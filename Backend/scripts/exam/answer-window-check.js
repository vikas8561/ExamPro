/**
 * Regression: answers can only be saved while the attempt is running, and only
 * the attempt owner's own submission row is ever read back.
 *
 * POST /api/answers checked one thing: that a proctoring session was "active".
 * A session stays active after the clock runs out until the expiry sweep closes
 * it -- the 5-minute grace plus up to a minute -- so for those minutes a student
 * could keep changing answers, and the sweep graded the changes. The attempt's
 * status was never checked, so a test that needs no session accepted answers
 * after it had been handed in.
 *
 * Before hand-in and autosave checked ownership, a request against someone
 * else's assignment left a submission row there under the caller's id. Such
 * rows can no longer be created, but old ones may exist; readers that fetch "the
 * submission for this assignment" must pick the owner's, and
 * scripts/auditForeignSubmissions.js quarantines the rest.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const path = require("path");
const { execFileSync } = require("child_process");
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `answin-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

(async () => {
  const mongoose = await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");
  const { listReEnableable } = require("../../services/reEnable");

  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });

    const mkTest = async (type) => {
      const t = await Test.create({
        title: `ZZ AnswerWindow ${type} ${MARK}`, type, status: "Active", timeLimit: 30,
        allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
        questions: [
          { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
          { kind: "mcq", text: "3+3?", options: [{ text: "5" }, { text: "6" }], answer: "6", points: 1 },
        ],
      });
      bin.tests.push(t._id);
      return t;
    };
    const exam = await mkTest("mcq");          // proctored
    const unproctored = await mkTest("practice"); // needs no session

    async function sit(label, test, { start = true, session = true } = {}) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      if (start) await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      if (session) await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      return { s, a, A, test };
    }
    const save = (who, qi, option) => api("/answers", {
      token: who.s.token, method: "POST",
      body: { assignmentId: who.A, questionId: String(who.test.questions[qi]._id), selectedOption: option, textAnswer: "" },
    });
    const savedOption = async (who, qi) => {
      const sub = await TestSubmission.findOne({ assignmentId: who.a._id, userId: who.s.user._id }).lean();
      return (sub?.responses || []).find((r) => String(r.questionId) === String(who.test.questions[qi]._id))?.selectedOption ?? null;
    };
    /** Put the student's countdown `msPastEnd` past its end (negative = time left). */
    const clockAt = (who, msPastEnd) =>
      Assignment.updateOne({ _id: who.a._id }, { $set: { startedAt: new Date(Date.now() - 30 * MIN - msPastEnd) } });

    // ── 1. While the attempt runs ──────────────────────────────────────────
    section("1. During the exam");
    const live = await sit("live", exam);
    let r = await save(live, 0, "4");
    check("Autosave works (200)", r.status === 200, r);
    await clockAt(live, -10 * 1000);
    r = await save(live, 1, "6");
    check("With 10 seconds left, autosave still works (200)", r.status === 200, r);

    // ── 2. The clock runs out; the session is still "active" ───────────────
    section("2. Time is up, the attempt is not yet finalised (the grace window)");
    const cheat = await sit("grace", exam);
    await save(cheat, 0, "3");                 // answered (wrongly) in time
    await clockAt(cheat, 2 * 1000);
    r = await save(cheat, 1, "5");
    check("2 seconds after the end (in flight at the bell): accepted (200)", r.status === 200, r);
    await clockAt(cheat, 2 * MIN);
    const session = await ProctorSession.findOne({ assignmentId: cheat.a._id }).lean();
    check("Two minutes past the end the proctoring session is still active (why this matters)", session?.status === "active", session?.status);
    r = await save(cheat, 0, "4");
    check("…but changing an answer is refused: 400 attempt_expired", r.status === 400 && r.body?.code === "attempt_expired", r);
    r = await save(cheat, 1, "6");
    check("…for every question", r.status === 400 && r.body?.code === "attempt_expired", r);
    check("The stored answers are the ones given in time ('3', '5')",
      (await savedOption(cheat, 0)) === "3" && (await savedOption(cheat, 1)) === "5",
      [await savedOption(cheat, 0), await savedOption(cheat, 1)]);
    await clockAt(cheat, 6 * MIN);
    await sweepExpiredAttempts();
    const swept = await Assignment.findById(cheat.a._id).lean();
    check("The sweep grades what was answered in time: 0, not the 2 the late changes would have earned",
      swept.status === "Completed" && swept.autoScore === 0, { status: swept.status, autoScore: swept.autoScore });

    // ── 3. After hand-in, on a test that needs no proctoring session ──────
    section("3. A test with no proctoring session: only the status stands in the way");
    const free = await sit("noproctor", unproctored, { session: false });
    r = await save(free, 0, "3");
    check("During the attempt: autosave works without a session (200)", r.status === 200, r);
    r = await api("/test-submissions", {
      token: free.s.token, method: "POST",
      body: { assignmentId: free.A, timeSpent: 60, responses: [{ questionId: String(unproctored.questions[0]._id), selectedOption: "3" }] },
    });
    const freeStored = await TestSubmission.findOne({ assignmentId: free.a._id }).lean();
    check("Hand in: 201, scored 0", r.status === 201 && freeStored?.totalScore === 0, freeStored?.totalScore);
    r = await save(free, 0, "4");
    check("After hand-in: autosave refused (400 attempt_not_active)", r.status === 400 && r.body?.code === "attempt_not_active", r);
    check("…and the handed-in answer is untouched ('3')", (await savedOption(free, 0)) === "3");

    const unstarted = await sit("unstarted", unproctored, { start: false, session: false });
    r = await save(unstarted, 0, "4");
    check("Never started: autosave refused (400 attempt_not_active)", r.status === 400 && r.body?.code === "attempt_not_active", r);

    // ── 4. Re-enabled attempts accept answers again ────────────────────────
    section("4. Re-enabled attempt");
    const reopen = await sit("reenable", exam);
    await save(reopen, 0, "3");
    await api("/test-submissions", { token: reopen.s.token, method: "POST", body: { assignmentId: reopen.A, timeSpent: 60, responses: [{ questionId: String(exam.questions[0]._id), selectedOption: "3" }] } });
    r = await save(reopen, 0, "4");
    check("Handed in: autosave refused", r.status === 403 || r.status === 400, r.status);
    r = await api(`/assignments/${reopen.A}/re-enable`, { token: admin.token, method: "POST", body: {} });
    check("Admin re-enables (200)", r.status === 200, r);
    r = await save(reopen, 0, "4");
    check("Re-enabled: autosave works again (200)", r.status === 200 && (await savedOption(reopen, 0)) === "4", r.status);

    // ── 5. A row written by someone else (pre-fix data) is never read ──────
    section("5. Old foreign row on an attempt: readers pick the owner's row");
    const owner = await sit("owner", exam);
    await save(owner, 0, "4");
    await api("/test-submissions", { token: owner.s.token, method: "POST", body: { assignmentId: owner.A, timeSpent: 60, responses: [{ questionId: String(exam.questions[0]._id), selectedOption: "4" }] } });
    const intruder = await makeUser("Student", "intruder", { mark: MARK });
    // Planted directly: the API refuses to create these now.
    const foreign = await TestSubmission.create({
      assignmentId: owner.a._id, testId: exam._id, userId: intruder.user._id, isFinalized: true,
      totalScore: 0, maxScore: 2, submittedAt: new Date(Date.now() + 1000), autoSubmit: true, cancelledDueToViolation: true,
      responses: [{ questionId: exam.questions[0]._id, selectedOption: "3", points: 0 }],
    });

    r = await api(`/mentor/monitor/${owner.A}`, { token: admin.token });
    check("Mentor monitor shows the OWNER's submission (score 1), not the planted one",
      r.status === 200 && String(r.body?.submission?._id) !== String(foreign._id) && r.body?.monitoringData?.score === 1,
      { status: r.status, submission: r.body?.submission?._id, score: r.body?.monitoringData?.score });

    const listed = await listReEnableable([owner.s.user._id]);
    const entry = (listed.get(String(owner.s.user._id)) || [])[0];
    check("Re-enable list reads the owner's row (reason 'submitted', not the planted 'violation')",
      entry?.reason === "submitted", entry);

    r = await api(`/assignments/${owner.A}/re-enable`, { token: admin.token, method: "POST", body: {} });
    const ownerRow = await TestSubmission.findOne({ assignmentId: owner.a._id, userId: owner.s.user._id }).lean();
    const plantedRow = await TestSubmission.findById(foreign._id).lean();
    check("Re-enable reopens the OWNER's row and leaves the planted one alone",
      r.status === 200 && ownerRow.isFinalized === false && plantedRow.isFinalized === true,
      { status: r.status, owner: ownerRow.isFinalized, planted: plantedRow.isFinalized });
    await save(owner, 0, "4");
    await api("/test-submissions", { token: owner.s.token, method: "POST", body: { assignmentId: owner.A, timeSpent: 60, responses: [{ questionId: String(exam.questions[0]._id), selectedOption: "4" }] } });

    r = await api("/mentor-fast/assignments?limit=500", { token: admin.token });
    const fastRow = (Array.isArray(r.body) ? r.body : []).find((a) => String(a._id) === owner.A);
    check("Mentor fast list takes the owner's submission time, not the planted one",
      fastRow && new Date(fastRow.submittedAt).getTime() < new Date(foreign.submittedAt).getTime(),
      { status: r.status, submittedAt: fastRow?.submittedAt, planted: foreign.submittedAt });

    // ── 6. The cleanup script ──────────────────────────────────────────────
    section("6. scripts/auditForeignSubmissions.js");
    const script = path.resolve(__dirname, "../auditForeignSubmissions.js");
    const env = { ...process.env };
    const dry = execFileSync("node", [script], { env, encoding: "utf8" });
    check("Dry run reports the planted row", dry.includes(String(foreign._id)) && /read-only/i.test(dry), dry.slice(0, 400));
    check("Dry run changes nothing", Boolean(await TestSubmission.findById(foreign._id).lean()));
    check("Dry run does not report the owner's real row", !dry.includes(String(ownerRow._id)));

    const applied = execFileSync("node", [script, "--apply"], { env, encoding: "utf8" });
    const quarantined = await mongoose.connection.db.collection("testsubmissions_foreign_quarantine").findOne({ _id: foreign._id });
    check("--apply moves it into quarantine with the reason recorded",
      Boolean(quarantined) && quarantined.quarantineReason === "written_by_non_owner" && /Quarantined/.test(applied), applied.slice(-300));
    check("…removes it from testsubmissions", !(await TestSubmission.findById(foreign._id).lean()));
    check("…and leaves the owner's real row untouched", Boolean(await TestSubmission.findById(ownerRow._id).lean()));
    const again = execFileSync("node", [script], { env, encoding: "utf8" });
    check("A second run finds nothing left of ours", !again.includes(String(foreign._id)));
    await mongoose.connection.db.collection("testsubmissions_foreign_quarantine").deleteOne({ _id: foreign._id });
  } catch (error) {
    fail++;
    console.error("\nCRASH", error);
  } finally {
    await TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } });
    await ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } });
    await Assignment.deleteMany({ _id: { $in: bin.assignments } });
    await Test.deleteMany({ _id: { $in: bin.tests } });
    await disconnect();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
