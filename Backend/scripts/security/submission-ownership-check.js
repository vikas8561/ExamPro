/**
 * Regression: nobody may hand in, autosave into, or grade code into another
 * student's exam.
 *
 * POST /api/test-submissions used to log an ownership mismatch and carry on, and
 * the proctoring guard in front of it waved a non-owner straight through. Any
 * student holding a classmate's assignment id -- and cohort ids run nearly in
 * sequence -- could submit that classmate's live attempt with their own answers:
 * it was marked Completed and scored from the attacker's paper.
 *
 * This drives the real API the way an attacker would and checks the DATABASE
 * after every refused call, not just the status code: a 403 that still wrote
 * something would pass a status-only check.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `owner-${Date.now()}`;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const Student = require("../../models/Student");

  const bin = { tests: [], assignments: [] };

  try {
    // ── Fixtures ────────────────────────────────────────────────────────────
    const victim = await makeUser("Student", "victim", { mark: MARK });
    const attacker = await makeUser("Student", "attacker", { mark: MARK });
    const outsider = await makeUser("Student", "outsider", { mark: MARK }); // no assignment on this test at all
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const mentor = await makeUser("Mentor", "mentor", { mark: MARK, batches: ["ru"] });

    // Mixed paper: an MCQ the submit route grades, and a coding question for the
    // /coding/submit path. SEB off so a plain proctoring session can open.
    const test = await Test.create({
      title: `ZZ Ownership ${MARK}`, type: "mixed", subject: "", status: "Active",
      timeLimit: 60, allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        {
          kind: "coding", text: "Echo the input.", language: "python", points: 5,
          visibleTestCases: [{ input: "1", output: "1" }],
          hiddenTestCases: [{ input: "2", output: "2", marks: 1 }],
        },
      ],
    });
    bin.tests.push(test._id);
    const [mcqQ, codingQ] = test.questions;

    const now = Date.now();
    const mkAssignment = (userId) => Assignment.create({
      testId: test._id, userId, status: "Assigned",
      startTime: new Date(now - 60 * 1000), duration: 60,
      deadline: new Date(now + 59 * 60 * 1000),
    });
    const victimA = await mkAssignment(victim.user._id);
    const attackerA = await mkAssignment(attacker.user._id);
    bin.assignments.push(victimA._id, attackerA._id);
    const V = String(victimA._id);

    // ── Both students sit the exam normally ─────────────────────────────────
    section("Set-up: victim and attacker both start their own exam");
    for (const [who, a] of [[victim, victimA], [attacker, attackerA]]) {
      const started = await api(`/assignments/${a._id}/start`, { token: who.token, method: "POST", body: {} });
      const session = await api("/proctor/session/start", {
        token: who.token, method: "POST",
        body: { assignmentId: String(a._id), testKind: "assigned", environment: {} },
      });
      check(`${who.user.name}: start ${started.status}, proctor session ${session.status}`,
        started.status === 200 && session.status === 200, { started: started.body, session: session.body });
    }

    const saved = await api("/answers", {
      token: victim.token, method: "POST",
      body: { assignmentId: V, questionId: String(mcqQ._id), selectedOption: "4" },
    });
    check("Victim autosaves their own MCQ answer (200)", saved.status === 200, saved);

    // Snapshot of everything an attack could change.
    const snapshot = async () => {
      const a = await Assignment.findById(victimA._id).lean();
      const subs = await TestSubmission.find({ assignmentId: victimA._id }).lean();
      const session = await ProctorSession.findOne({ assignmentId: victimA._id }).lean();
      return {
        status: a.status,
        completedAt: a.completedAt ? String(a.completedAt) : null,
        autoScore: a.autoScore ?? null,
        reviewStatus: a.reviewStatus,
        submissions: subs.map((s) => ({
          userId: String(s.userId),
          totalScore: s.totalScore,
          responses: (s.responses || []).map((r) => [String(r.questionId), r.selectedOption ?? null, r.textAnswer ?? null, r.points]),
        })),
        sessionStatus: session?.status || null,
      };
    };
    const before = await snapshot();
    check("Baseline: victim In Progress, one submission row (theirs), live session",
      before.status === "In Progress" && before.submissions.length === 1 &&
      before.submissions[0].userId === String(victim.user._id) && before.sessionStatus === "active", before);

    const unchanged = async (label) => {
      const after = await snapshot();
      check(`  …and the victim's attempt is untouched (${label})`,
        JSON.stringify(after) === JSON.stringify(before), { before, after });
    };

    const wrongPaper = {
      assignmentId: V,
      responses: [{ questionId: String(mcqQ._id), selectedOption: "3" }],
      timeSpent: 1,
    };

    // ── C1 proper: handing in someone else's exam ───────────────────────────
    section("POST /test-submissions against the victim's assignment");

    let r = await api("/test-submissions", { token: attacker.token, method: "POST", body: wrongPaper });
    check("Attacker (with their own live session) is refused: 403 not_owner",
      r.status === 403 && r.body?.reason === "not_owner", r);
    check("  …and is not told to start proctoring / reopen SEB",
      !r.body?.proctoringRequired && !r.body?.sebRequired, r.body);
    await unchanged("attacker submit");

    r = await api("/test-submissions", { token: attacker.token, method: "POST", body: { ...wrongPaper, autoSubmit: true, cancelledDueToViolation: true } });
    check("Attacker posing as an auto-submit / violation cancel is refused: 403",
      r.status === 403 && r.body?.reason === "not_owner", r);
    await unchanged("attacker auto-submit");

    r = await api("/test-submissions", { token: outsider.token, method: "POST", body: wrongPaper });
    check("Student with no session and no assignment on this test is refused: 403",
      r.status === 403 && r.body?.reason === "not_owner", r);
    await unchanged("outsider submit");

    r = await api("/test-submissions", { token: admin.token, method: "POST", body: wrongPaper });
    check("Admin cannot submit on the student's behalf: 403", r.status === 403 && r.body?.reason === "not_owner", r);
    await unchanged("admin submit");

    r = await api("/test-submissions", { token: mentor.token, method: "POST", body: wrongPaper });
    check("Mentor cannot submit on the student's behalf: 403", r.status === 403 && r.body?.reason === "not_owner", r);
    await unchanged("mentor submit");

    const junk = await TestSubmission.countDocuments({
      assignmentId: victimA._id,
      userId: { $in: [attacker.user._id, outsider.user._id, admin.user._id, mentor.user._id] },
    });
    check("No submission row exists under anyone else's id on the victim's attempt", junk === 0, { junk });

    // ── Sibling write paths ─────────────────────────────────────────────────
    section("POST /answers (autosave) against the victim's assignment");
    const overwrite = { assignmentId: V, questionId: String(mcqQ._id), selectedOption: "3" };
    for (const [label, who] of [["Attacker", attacker], ["Outsider", outsider], ["Admin", admin], ["Mentor", mentor]]) {
      r = await api("/answers", { token: who.token, method: "POST", body: overwrite });
      check(`${label} autosave is refused: 403 not_owner`, r.status === 403 && r.body?.reason === "not_owner", r);
    }
    await unchanged("autosaves");

    section("POST /coding/submit against the victim's assignment");
    const code = {
      assignmentId: V, testId: String(test._id), questionId: String(codingQ._id),
      sourceCode: "print(input())", language: "python",
    };
    for (const [label, who] of [["Attacker", attacker], ["Admin", admin], ["Mentor", mentor]]) {
      r = await api("/coding/submit", { token: who.token, method: "POST", body: code });
      check(`${label} cannot write a graded attempt into the victim's paper: 403`, r.status === 403, r);
    }
    await unchanged("coding submits");

    r = await api("/coding/run", { token: admin.token, method: "POST", body: code });
    check("Admin may still RUN code against it for review (not refused for ownership)",
      r.status !== 403, { status: r.status, body: r.body });
    await unchanged("admin run");

    section("Read paths");
    r = await api(`/assignments/${V}`, { token: attacker.token });
    check("Attacker cannot load the victim's assignment: 403", r.status === 403, r.status);
    r = await api(`/assignments/check-expiration/${V}`, { token: attacker.token });
    check("Attacker cannot probe the victim's clock: 403", r.status === 403, r);
    r = await api(`/assignments/check-expiration/${V}`, { token: victim.token });
    check("Victim can still check their own clock: 200", r.status === 200, r);
    r = await api("/proctor/session/start", {
      token: attacker.token, method: "POST", body: { assignmentId: V, testKind: "assigned", environment: {} },
    });
    check("Attacker cannot open a proctor session on the victim's assignment (404)", r.status === 404, r);

    // An assignment whose student is no longer on the university roster. The
    // old check read the owner AFTER attach(), which nulls a missing student,
    // and so served the assignment to anyone.
    const ghost = await makeUser("Student", "ghost", { mark: MARK });
    const ghostA = await mkAssignment(ghost.user._id);
    bin.assignments.push(ghostA._id);
    await Student.deleteOne({ _id: ghost.user._id });
    r = await api(`/assignments/${ghostA._id}`, { token: attacker.token });
    check("Attacker cannot load an assignment whose student left the roster: 403", r.status === 403, r.status);
    r = await api(`/assignments/${ghostA._id}`, { token: admin.token });
    check("Admin can still load it: 200", r.status === 200, r.status);

    // ── The owner is unaffected ─────────────────────────────────────────────
    section("The real student can still hand in");
    r = await api(`/assignments/${V}`, { token: victim.token });
    check("Victim loads their own exam with questions: 200",
      r.status === 200 && (r.body?.testId?.questions || []).length === 2, { status: r.status, n: r.body?.testId?.questions?.length });

    r = await api("/test-submissions", {
      token: victim.token, method: "POST",
      body: { assignmentId: V, responses: [{ questionId: String(mcqQ._id), selectedOption: "4" }], timeSpent: 120 },
    });
    check("Victim's own submit succeeds: 201", r.status === 201, r);
    const done = await Assignment.findById(victimA._id).lean();
    const sub = await TestSubmission.findOne({ assignmentId: victimA._id, userId: victim.user._id }).lean();
    check("Victim's attempt is Completed and graded from THEIR answer (1 mark)",
      done.status === "Completed" && done.autoScore === 1 && sub?.totalScore === 1,
      { status: done.status, autoScore: done.autoScore, totalScore: sub?.totalScore });

    r = await api("/test-submissions", { token: attacker.token, method: "POST", body: wrongPaper });
    check("After completion the attacker still gets 403 not_owner (ownership checked first)",
      r.status === 403 && r.body?.reason === "not_owner", r);
    const after = await TestSubmission.findOne({ assignmentId: victimA._id, userId: victim.user._id }).lean();
    check("  …and the victim's graded score is unchanged", after?.totalScore === 1, after?.totalScore);

    section("The attacker's own exam is unaffected");
    r = await api("/answers", {
      token: attacker.token, method: "POST",
      body: { assignmentId: String(attackerA._id), questionId: String(mcqQ._id), selectedOption: "3" },
    });
    check("Attacker can autosave their own exam: 200", r.status === 200, r);
    r = await api("/test-submissions", {
      token: attacker.token, method: "POST",
      body: { assignmentId: String(attackerA._id), responses: [{ questionId: String(mcqQ._id), selectedOption: "3" }], timeSpent: 60 },
    });
    check("Attacker can submit their own exam: 201", r.status === 201, r);

    section("Unchanged edge cases");
    r = await api("/test-submissions", { token: attacker.token, method: "POST", body: { ...wrongPaper, assignmentId: "0123456789abcdef01234567" } });
    check("Unknown assignment id is still 404", r.status === 404, r);
    r = await api("/test-submissions", { token: attacker.token, method: "POST", body: { ...wrongPaper, assignmentId: "not-an-id" } });
    check("Malformed assignment id is still 400", r.status === 400, r);
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
