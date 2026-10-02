/**
 * Verification: re-enabling an exam that was handed in before its time was up.
 *
 * Drives the real API the way the exam page and the Users page do — start,
 * proctoring session, autosave, submit, re-enable, resume, resubmit — and checks
 * the database after every step. Also exercises the parts no HTTP call can
 * reach on demand: a concurrent double press, a failure half-way through, and
 * the expiry sweep closing a reopened attempt whose time then ran out.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js,
 * which refuses anything else before a single record is written. Students live
 * in the university's database, and this creates some.
 */

const { API, connect, disconnect } = require("../lib/examHarness");
const mongoose = require("mongoose");
const { generateToken } = require("../../middleware/auth");
const { grantSession, revokeSessions } = require("../lib/testAuth");
const Student = require("../../models/Student");
const Mentor = require("../../models/Mentor");
const Admin = require("../../models/Admin");
const Test = require("../../models/Test");
const Assignment = require("../../models/Assignment");
const TestSubmission = require("../../models/TestSubmission");
const ProctorSession = require("../../models/ProctorSession");
const reEnable = require("../../services/reEnable");
const { sweepExpiredAttempts } = require("../../services/expiredAttempts");

const MARK = `reenable-${Date.now()}`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const MIN = 60 * 1000;

let passed = 0, failed = 0;
const check = (cond, label, detail) => {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`); }
};
const section = (title) => console.log(`\n── ${title}`);

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function tokenFor(doc, role) {
  const token = generateToken({ _id: doc._id, email: doc.email || doc.studentEmail || "", role });
  await grantSession({ _id: doc._id, role }, token);
  return token;
}

const mcq = (text, options, answer) => ({ kind: "mcq", text, options: options.map((o) => ({ text: o })), answer, points: 1 });

/** Start → session → autosave → submit, as the exam page does. */
async function sitAndSubmit(token, assignment, test, answers) {
  const started = await api(`/assignments/${assignment._id}/start`, { token, method: "POST", body: {} });
  const session = await api("/proctor/session/start", {
    token, method: "POST", body: { assignmentId: String(assignment._id), testKind: "assigned", environment: {} },
  });
  for (const [qIndex, option] of answers) {
    await api("/answers", {
      token, method: "POST",
      body: { assignmentId: String(assignment._id), questionId: String(test.questions[qIndex]._id), selectedOption: option },
    });
  }
  const submitted = await api("/test-submissions", {
    token, method: "POST",
    body: {
      assignmentId: String(assignment._id),
      responses: answers.map(([qIndex, option]) => ({ questionId: String(test.questions[qIndex]._id), selectedOption: option })),
      timeSpent: 60,
    },
  });
  return { started, session, submitted };
}

async function main() {
  await connect();

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const admin = await Admin.create({ name: `Admin ${MARK}`, email: `admin-${MARK}@e2e.invalid`, password: "secret123" });
  const mentor = await Mentor.create({ name: `Mentor ${MARK}`, email: `mentor-${MARK}@e2e.invalid`, password: "secret123", batches: ["ru"] });

  const mkStudent = (name, University) =>
    Student.create({ studentName: `${name} ${MARK}`, studentEmail: `${name.toLowerCase()}-${MARK}@e2e.invalid`, UniversityUID: `${name}-${MARK}`, rollno: `${name}-${MARK}`, University, role: "Student" });
  const asha = await mkStudent("Asha", "Rai University");      // mentor's batch
  const bilal = await mkStudent("Bilal", "Rai University");    // mentor's batch
  const chen = await mkStudent("Chen", "SUxCG 702");           // NOT the mentor's batch
  const studentIds = [asha._id, bilal._id, chen._id];

  const adminToken = await tokenFor(admin, "Admin");
  const mentorToken = await tokenFor(mentor, "Mentor");
  const ashaToken = await tokenFor(asha, "Student");
  const bilalToken = await tokenFor(bilal, "Student");
  const chenToken = await tokenFor(chen, "Student");

  const created = await api("/tests", {
    token: adminToken, method: "POST",
    body: {
      title: `Algebra ${MARK}`, subject: "Maths", type: "mcq", timeLimit: 60, allowedTabSwitches: 0,
      questions: [mcq("1+1?", ["1", "2"], "2"), mcq("2+2?", ["4", "5"], "4"), mcq("3+3?", ["6", "7"], "6")],
    },
  });
  check(created.status === 201, "fixture: admin created the test", created.body);
  await Test.updateOne({ _id: created.body._id }, { $set: { status: "Active" } });
  const test = await Test.findById(created.body._id).lean();
  const practice = await Test.create({
    title: `Practice ${MARK}`, type: "practice", isPracticeTest: true, timeLimit: 30, allowedTabSwitches: -1,
    status: "Active", createdBy: admin._id, questions: [mcq("x?", ["a", "b"], "a")],
  });

  const now = Date.now();
  const assign = (student, overrides = {}) =>
    Assignment.create({ testId: test._id, userId: student._id, mentorId: mentor._id, startTime: new Date(now - 2 * MIN), duration: 60, ...overrides });

  try {
    // ════════════════════════════════════════════════════════════════════════
    section("Submitted by the student, reopened by their mentor");
    const a1 = await assign(asha);
    const sat = await sitAndSubmit(ashaToken, a1, test, [[0, "2"]]);
    check(sat.started.status === 200 && sat.session.status === 200, "student started the test and opened proctoring", { start: sat.started.status, session: sat.session.body });
    check(sat.submitted.status === 201, "student submitted early", sat.submitted.body);
    check((await Assignment.findById(a1._id).lean()).status === "Completed", "attempt is Completed");

    let list = await api("/users/profiles?limit=50", { token: mentorToken });
    const ashaRow = list.body.users.find((u) => String(u._id) === String(asha._id));
    const card = ashaRow?.reEnableable?.find((t) => String(t.assignmentId) === String(a1._id));
    check(Boolean(card), "mentor's My Students card offers Re-enable for the test", ashaRow);
    check(card?.testTitle === test.title, "  …showing the test's name", card);
    check(card?.reason === "submitted", "  …and why it ended (submitted)", card);
    check(new Date(card?.endsAt).getTime() > Date.now(), "  …and when its time ends", card);
    check(!list.body.users.some((u) => String(u._id) === String(chen._id)), "mentor does not see students outside their batch");

    let r = await api(`/assignments/${a1._id}/re-enable`, { token: ashaToken, method: "POST" });
    check(r.status === 403, "a student cannot re-enable their own test", r);

    const startedAtBefore = (await Assignment.findById(a1._id).lean()).startedAt.getTime();
    r = await api(`/assignments/${a1._id}/re-enable`, { token: mentorToken, method: "POST" });
    check(r.status === 200, "mentor re-enabled it", r.body);
    check(/Algebra/.test(r.body?.message || ""), "  …and the reply names the test", r.body);

    const a1After = await Assignment.findById(a1._id).lean();
    check(a1After.status === "In Progress" && a1After.completedAt === null, "attempt is back to In Progress", a1After.status);
    check(a1After.autoScore === null, "the submitted score is withdrawn", a1After.autoScore);
    check(a1After.startedAt.getTime() === startedAtBefore, "the original start time is kept, so no extra time is given", { before: startedAtBefore, after: a1After.startedAt });
    const entry = a1After.reEnableHistory?.[0];
    check(entry?.byRole === "Mentor" && entry?.byName === mentor.name && entry?.reason === "submitted", "the reopen is recorded: by whom, why", entry);

    const sub1 = await TestSubmission.findOne({ assignmentId: a1._id }).lean();
    check(sub1.isFinalized === false, "submission taken out of scores until resubmitted", sub1.isFinalized);
    check(sub1.responses.find((x) => String(x.questionId) === String(test.questions[0]._id))?.selectedOption === "2", "saved answers are kept", sub1.responses);
    const s1 = await ProctorSession.findOne({ assignmentId: a1._id }).sort({ createdAt: -1 }).lean();
    check(s1.status === "active", "proctoring session reopened", s1.status);

    r = await api(`/assignments/${a1._id}/re-enable`, { token: mentorToken, method: "POST" });
    check(r.status === 400 && r.body.code === "not_submitted", "re-enabling an already-open test is refused", r.body);

    list = await api("/users/profiles?limit=50", { token: mentorToken });
    check(!(list.body.users.find((u) => String(u._id) === String(asha._id))?.reEnableable || []).length, "the card no longer offers it", list.body.users.find((u) => String(u._id) === String(asha._id))?.reEnableable);

    section("The student carries on and hands it in again");
    r = await api(`/assignments/${a1._id}/start`, { token: ashaToken, method: "POST", body: {} });
    check(r.status === 200 && r.body.alreadyStarted === true, "Start resumes the open attempt", r.body?.message);
    r = await api("/proctor/session/start", { token: ashaToken, method: "POST", body: { assignmentId: String(a1._id), testKind: "assigned", environment: {} } });
    check(r.status === 200 && r.body.resumed === true, "proctoring resumes the same session", r.body);
    r = await api(`/answers/assignment/${a1._id}`, { token: ashaToken });
    check(Array.isArray(r.body) && r.body.some((x) => x.selectedOption === "2"), "the exam page gets the earlier answer back", r.body);
    r = await api("/answers", { token: ashaToken, method: "POST", body: { assignmentId: String(a1._id), questionId: String(test.questions[1]._id), selectedOption: "4" } });
    check(r.status === 200, "autosave works again", r.body?.message);
    r = await api("/test-submissions", {
      token: ashaToken, method: "POST",
      body: { assignmentId: String(a1._id), responses: [[0, "2"], [1, "4"]].map(([i, o]) => ({ questionId: String(test.questions[i]._id), selectedOption: o })), timeSpent: 120 },
    });
    check(r.status === 201 && r.body.totalScore === 2, "resubmitted and regraded with both answers", r.body?.totalScore);
    const a1Final = await Assignment.findById(a1._id).lean();
    const sub1Final = await TestSubmission.findOne({ assignmentId: a1._id }).lean();
    check(a1Final.status === "Completed" && a1Final.autoScore === 2 && sub1Final.isFinalized === true, "attempt is Completed again with the new score", { status: a1Final.status, score: a1Final.autoScore });
    check(a1Final.reEnableHistory.length === 1, "the reopen stays on the record after resubmitting", a1Final.reEnableHistory.length);

    // ════════════════════════════════════════════════════════════════════════
    section("Cancelled by proctoring, reopened by an admin");
    const a2 = await assign(bilal);
    await api(`/assignments/${a2._id}/start`, { token: bilalToken, method: "POST", body: {} });
    const sess2 = await api("/proctor/session/start", { token: bilalToken, method: "POST", body: { assignmentId: String(a2._id), testKind: "assigned", environment: {} } });
    await api("/answers", { token: bilalToken, method: "POST", body: { assignmentId: String(a2._id), questionId: String(test.questions[0]._id), selectedOption: "2" } });
    r = await api("/proctor/session/event", { token: bilalToken, method: "POST", body: { sessionId: sess2.body.sessionId, violationType: "tab_switch", details: "Switched tab" } });
    check(r.body?.action === "terminate", "a violation over the limit cancels the attempt", r.body);
    r = await api("/test-submissions", {
      token: bilalToken, method: "POST",
      body: { assignmentId: String(a2._id), responses: [{ questionId: String(test.questions[0]._id), selectedOption: "2" }], autoSubmit: true, cancelledDueToViolation: true },
    });
    check(r.status === 201, "the cancelled attempt was auto-submitted", r.body?.message);
    r = await api("/proctor/session/start", { token: bilalToken, method: "POST", body: { assignmentId: String(a2._id), environment: {} } });
    check(r.status === 400 || r.status === 403, "before re-enabling, the student cannot get back in", r.status);

    list = await api("/users/profiles?limit=50", { token: adminToken });
    const bilalCard = list.body.users.find((u) => String(u._id) === String(bilal._id))?.reEnableable?.[0];
    check(bilalCard?.reason === "violation", "admin's Users card shows it as cancelled by proctoring", bilalCard);

    const sessBefore = await ProctorSession.findOne({ assignmentId: a2._id }).sort({ createdAt: -1 }).lean();
    // Pretend the student left ten minutes ago, to prove the gap is not charged.
    await ProctorSession.updateOne({ _id: sessBefore._id }, { $set: { lastHeartbeatAt: new Date(Date.now() - 10 * MIN) } });

    r = await api(`/assignments/${a2._id}/re-enable`, { token: adminToken, method: "POST" });
    check(r.status === 200 && r.body.reason === "violation", "admin re-enabled it", r.body);
    const a2After = await Assignment.findById(a2._id).lean();
    const sess2After = await ProctorSession.findById(sessBefore._id).lean();
    check(a2After.cancelledDueToViolation === false && a2After.tabViolationCount === 0, "the cancellation and active violation count are cleared", { c: a2After.cancelledDueToViolation, n: a2After.tabViolationCount });
    check(sess2After.status === "active" && sess2After.violationCount === 0 && sess2After.terminatedReason === null, "the proctoring session is live again at zero", sess2After);
    check(sess2After.violations.length === sessBefore.violations.length && sessBefore.violations.length > 0, "the violation history is kept for the report", { before: sessBefore.violations.length, after: sess2After.violations.length });
    check(a2After.reEnableHistory[0]?.byRole === "Admin" && a2After.reEnableHistory[0]?.previousViolationCount === 1, "the record shows an admin reopened it and what the count was", a2After.reEnableHistory[0]);

    r = await api("/proctor/session/heartbeat", { token: bilalToken, method: "POST", body: { sessionId: String(sessBefore._id) } });
    const sessAfterBeat = await ProctorSession.findById(sessBefore._id).lean();
    check(sessAfterBeat.violationCount === 0 && !sessAfterBeat.violations.slice(sessBefore.violations.length).some((v) => v.violationType === "heartbeat_lost"), "the time spent closed is not charged as a lost heartbeat", { count: sessAfterBeat.violationCount, action: r.body?.action });

    r = await api("/proctor/session/start", { token: bilalToken, method: "POST", body: { assignmentId: String(a2._id), testKind: "assigned", environment: {} } });
    check(r.status === 200 && r.body.violationCount === 0, "the student is let back in", r.body);

    // ════════════════════════════════════════════════════════════════════════
    section("Mentors are confined to their own batches");
    const a3 = await assign(chen);
    await sitAndSubmit(chenToken, a3, test, [[0, "1"]]);
    r = await api(`/assignments/${a3._id}/re-enable`, { token: mentorToken, method: "POST" });
    check(r.status === 403, "mentor cannot re-enable for a student outside their batch", r);
    check((await Assignment.findById(a3._id).lean()).status === "Completed", "  …and nothing changed", null);
    list = await api("/users/profiles?limit=50", { token: adminToken });
    check(list.body.users.find((u) => String(u._id) === String(chen._id))?.reEnableable?.length === 1, "admin does see it on that student's card", null);

    // ════════════════════════════════════════════════════════════════════════
    section("Never after the time has ended");
    const test2 = await Test.create({ title: `Geometry ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 0, status: "Active", createdBy: admin._id, questions: [mcq("a?", ["x", "y"], "x")] });
    const test3 = await Test.create({ title: `Short ${MARK}`, type: "mcq", timeLimit: 2, allowedTabSwitches: 0, status: "Active", createdBy: admin._id, questions: [mcq("a?", ["x", "y"], "x")] });
    const test4 = await Test.create({ title: `Edge ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 0, status: "Active", createdBy: admin._id, questions: [mcq("a?", ["x", "y"], "x")] });

    const windowOver = await Assignment.create({ testId: test2._id, userId: asha._id, startTime: new Date(now - 3 * 60 * MIN), duration: 60, startedAt: new Date(now - 3 * 60 * MIN), status: "Completed", completedAt: new Date(now - 2.5 * 60 * MIN) });
    const timerOver = await Assignment.create({ testId: test3._id, userId: asha._id, startTime: new Date(now - 10 * MIN), duration: 120, startedAt: new Date(now - 3 * MIN), status: "Completed", completedAt: new Date(now - 2.5 * MIN) });
    const lastMinute = await Assignment.create({ testId: test4._id, userId: asha._id, startTime: new Date(now - 59.5 * MIN), duration: 60, startedAt: new Date(now - 59 * MIN), status: "Completed", completedAt: new Date(now - MIN) });
    const practiceAttempt = await Assignment.create({ testId: practice._id, userId: asha._id, startTime: new Date(now - 2 * MIN), duration: 60, startedAt: new Date(now - MIN), status: "Completed", completedAt: new Date() });

    for (const [label, a] of [
      ["the assignment window has closed", windowOver],
      ["the student's own countdown has run out, even though the window is open", timerOver],
      ["less than a minute is left", lastMinute],
    ]) {
      r = await api(`/assignments/${a._id}/re-enable`, { token: adminToken, method: "POST" });
      check(r.status === 400 && r.body.code === "time_over", `admin cannot re-enable when ${label}`, r.body);
      check((await Assignment.findById(a._id).lean()).status === "Completed", "  …and the attempt is untouched", null);
    }
    r = await api(`/assignments/${practiceAttempt._id}/re-enable`, { token: adminToken, method: "POST" });
    check(r.status === 400 && r.body.code === "not_exam", "practice tests cannot be re-enabled", r.body);

    list = await api("/users/profiles?limit=50", { token: adminToken });
    const ashaOffers = (list.body.users.find((u) => String(u._id) === String(asha._id))?.reEnableable || []).map((t) => t.testTitle);
    check(
      !ashaOffers.some((title) => /^(Geometry|Short|Edge|Practice) /.test(title)),
      "none of those appear on the card",
      ashaOffers
    );
    // Algebra is still there, and should be: she resubmitted it after being
    // reopened, with time left, so it can be reopened again.
    check(ashaOffers.some((title) => /^Algebra /.test(title)), "a test resubmitted with time left can be offered again", ashaOffers);

    // ════════════════════════════════════════════════════════════════════════
    section("Two people press Re-enable at the same moment");
    const test5 = await Test.create({ title: `Race ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 0, status: "Active", createdBy: admin._id, questions: [mcq("a?", ["x", "y"], "x")] });
    const race = await Assignment.create({ testId: test5._id, userId: bilal._id, startTime: new Date(now - 2 * MIN), duration: 60 });
    await sitAndSubmit(bilalToken, race, await Test.findById(test5._id).lean(), [[0, "x"]]);
    const [p1, p2] = await Promise.all([
      api(`/assignments/${race._id}/re-enable`, { token: adminToken, method: "POST" }),
      api(`/assignments/${race._id}/re-enable`, { token: mentorToken, method: "POST" }),
    ]);
    const wins = [p1, p2].filter((x) => x.status === 200).length;
    check(wins === 1, "exactly one succeeds", [p1.status, p2.status, p1.body?.code, p2.body?.code]);
    check((await Assignment.findById(race._id).lean()).reEnableHistory.length === 1, "  …and it is recorded once", null);

    // ════════════════════════════════════════════════════════════════════════
    section("A failure half-way leaves nothing half-open");
    const test6 = await Test.create({ title: `Rollback ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 0, status: "Active", createdBy: admin._id, questions: [mcq("a?", ["x", "y"], "x")] });
    const rb = await Assignment.create({ testId: test6._id, userId: bilal._id, startTime: new Date(now - 2 * MIN), duration: 60 });
    await sitAndSubmit(bilalToken, rb, await Test.findById(test6._id).lean(), [[0, "x"]]);
    const rbBefore = await Assignment.findById(rb._id).lean();
    const realUpdate = ProctorSession.updateOne;
    ProctorSession.updateOne = async () => { throw new Error("simulated database failure"); };
    let threw = false;
    try {
      await reEnable.reEnableAttempt(rb._id, { id: admin._id, role: "Admin", name: admin.name });
    } catch { threw = true; } finally { ProctorSession.updateOne = realUpdate; }
    const rbAfter = await Assignment.findById(rb._id).lean();
    check(threw, "the failure is reported, not swallowed", threw);
    check(rbAfter.status === "Completed" && rbAfter.autoScore === rbBefore.autoScore && String(rbAfter.completedAt) === String(rbBefore.completedAt), "the attempt is restored exactly as it was", { status: rbAfter.status, score: rbAfter.autoScore });
    check(rbAfter.reEnableHistory.length === 0, "  …with no history entry for a reopen that did not happen", rbAfter.reEnableHistory);
    r = await api(`/assignments/${rb._id}/re-enable`, { token: adminToken, method: "POST" });
    check(r.status === 200, "and a retry then succeeds", r.body);

    // ════════════════════════════════════════════════════════════════════════
    section("A reopened attempt whose time runs out is still closed by the sweep");
    // Pretend the clock has run out on Bilal's reopened proctoring attempt (a2).
    await api("/answers", { token: bilalToken, method: "POST", body: { assignmentId: String(a2._id), questionId: String(test.questions[1]._id), selectedOption: "4" } });
    await Assignment.updateOne({ _id: a2._id }, { $set: { startTime: new Date(now - 3 * 60 * MIN), deadline: new Date(now - 2 * 60 * MIN), startedAt: new Date(now - 3 * 60 * MIN) } });
    await sweepExpiredAttempts({ graceMs: 0 });
    const a2Swept = await Assignment.findById(a2._id).lean();
    const sub2Swept = await TestSubmission.findOne({ assignmentId: a2._id }).lean();
    check(a2Swept.status === "Completed" && sub2Swept.isFinalized === true, "the sweep finalises it", { status: a2Swept.status, finalized: sub2Swept.isFinalized });
    check(a2Swept.autoScore === 2, "  …scoring the answers given before AND after the reopen", a2Swept.autoScore);
    r = await api(`/assignments/${a2._id}/re-enable`, { token: adminToken, method: "POST" });
    check(r.status === 400 && r.body.code === "time_over", "and it can no longer be re-enabled", r.body);

    // ════════════════════════════════════════════════════════════════════════
    section("Rule unit checks");
    const T = { type: "mcq", timeLimit: 60 };
    const base = { status: "Completed", startTime: new Date(now - MIN), duration: 60, startedAt: new Date(now - MIN) };
    check(reEnable.reEnableBlocker(base, T, now) === null, "a fresh early submission can be re-enabled");
    check(reEnable.reEnableBlocker({ ...base, status: "Cancelled" }, T, now) === null, "so can a Cancelled one");
    check(reEnable.reEnableBlocker({ ...base, status: "Assigned" }, T, now)?.code === "not_submitted", "an unstarted one cannot");
    check(reEnable.reEnableBlocker({ ...base, status: "Overdue" }, T, now)?.code === "not_submitted", "an overdue one cannot");
    check(reEnable.reEnableBlocker({ status: "Completed" }, T, now)?.code === "no_window", "one with no time window cannot");
    check(reEnable.reEnableBlocker(base, null, now)?.code === "not_found", "one whose test was deleted cannot");
    check(reEnable.endReason({ cancelledDueToViolation: true }, null) === "violation", "reason: cancelled assignment → violation");
    check(reEnable.endReason({}, { autoSubmit: true }) === "auto_submit", "reason: auto-submit");
    check(reEnable.endReason({}, { autoSubmit: false }) === "submitted", "reason: student submit");
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    const testIds = (await Test.find({ title: new RegExp(MARK) }).select("_id").lean()).map((t) => t._id);
    const assignmentIds = (await Assignment.find({ testId: { $in: testIds } }).select("_id").lean()).map((a) => a._id);
    await TestSubmission.deleteMany({ assignmentId: { $in: assignmentIds } });
    await ProctorSession.deleteMany({ assignmentId: { $in: assignmentIds } });
    await Assignment.deleteMany({ _id: { $in: assignmentIds } });
    await Test.deleteMany({ _id: { $in: testIds } });
    await Student.deleteMany({ _id: { $in: studentIds } });
    await Mentor.deleteOne({ _id: mentor._id });
    await Admin.deleteOne({ _id: admin._id });
    await revokeSessions([admin._id, mentor._id, ...studentIds]);
    await disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
