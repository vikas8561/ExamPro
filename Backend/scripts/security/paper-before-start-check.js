/**
 * Regression: the question paper must not be readable before the exam opens,
 * nor outside the proctored page while it is running.
 *
 * Nothing checked the start time except POST /assignments/:id/start. A student
 * could open a proctoring session days early -- /proctor/session/start never
 * looked at the clock -- and that session unlocked the paper through
 * GET /assignments/:id and GET /tests/:id. The results route,
 * GET /test-submissions/assignment/:id, needed no session at all and returned
 * every question and option whenever results were not yet released: before the
 * exam, and in the middle of it. /coding/run handed out the visible test cases.
 *
 * Every question, option and visible test case here carries a unique marker,
 * and each response a student can get is searched for all of them -- so a leak
 * through any field, under any name, fails the check, not just a non-empty
 * `questions` array.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `paper-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

// Unique strings planted in every part of the paper a student must not see early.
const SECRET = {
  mcqText: `MCQ-STEM-${MARK}`,
  optA: `OPTION-A-${MARK}`,
  optB: `OPTION-B-${MARK}`,
  codingText: `CODING-STEM-${MARK}`,
  visibleIn: `VISIBLE-IN-${MARK}`,
  visibleOut: `VISIBLE-OUT-${MARK}`,
};
const leaked = (body) => {
  const text = JSON.stringify(body ?? null);
  return Object.entries(SECRET).filter(([, v]) => text.includes(v)).map(([k]) => k);
};
const noLeak = (label, r) => {
  const hits = leaked(r.body);
  check(`${label} -- no question content in the reply`, hits.length === 0, `leaked: ${hits.join(", ")}`);
};

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });

    const test = await Test.create({
      title: `ZZ Paper ${MARK}`, type: "mixed", subject: "", status: "Active",
      timeLimit: 60, allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: SECRET.mcqText, options: [{ text: SECRET.optA }, { text: SECRET.optB }], answer: SECRET.optB, points: 1 },
        {
          kind: "coding", text: SECRET.codingText, language: "python", points: 5,
          visibleTestCases: [{ input: SECRET.visibleIn, output: SECRET.visibleOut }],
          hiddenTestCases: [{ input: "2", output: "2", marks: 1 }],
        },
      ],
    });
    bin.tests.push(test._id);
    const [mcqQ, codingQ] = test.questions;
    const T = String(test._id);

    async function seat(label, startInMin, duration = 60) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() + startInMin * MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration,
        deadline: new Date(startTime.getTime() + duration * MIN),
      });
      bin.assignments.push(a._id);
      return { s, a, A: String(a._id) };
    }

    // ── 1. Two hours before the exam ───────────────────────────────────────
    section("1. Exam opens in 2 hours: every route a student can call");
    const early = await seat("early", 120);
    const { s, A } = early;

    let r = await api("/proctor/session/start", {
      token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} },
    });
    check("Proctor session refused: 400 not_started", r.status === 400 && r.body?.code === "not_started", r);
    check("  …with the opening time",
      Date.parse(r.body?.opensAt) === early.a.startTime.getTime(), r.body?.opensAt);
    check("  …and no session was created", (await ProctorSession.countDocuments({ assignmentId: early.a._id })) === 0);

    r = await api(`/assignments/${A}`, { token: s.token });
    check("GET /assignments/:id still answers (200) for the instructions screen", r.status === 200, r.status);
    check("  …with an empty paper and notStarted", r.body?.testId?.questions?.length === 0 && r.body?.notStarted === true,
      { questions: r.body?.testId?.questions?.length, notStarted: r.body?.notStarted });
    noLeak("GET /assignments/:id", r);

    r = await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
    check("POST /assignments/:id/start refused: 400 not_started", r.status === 400 && r.body?.code === "not_started", r);
    noLeak("POST /assignments/:id/start", r);
    const untouched = await Assignment.findById(early.a._id).lean();
    check("  …and the attempt was not started", untouched.status === "Assigned" && !untouched.startedAt, untouched.status);

    r = await api(`/tests/${T}`, { token: s.token });
    check("GET /tests/:id refused (403)", r.status === 403, r.status);
    noLeak("GET /tests/:id", r);

    r = await api(`/test-submissions/assignment/${A}`, { token: s.token });
    check("Results route answers without the paper (code not_started)",
      r.status === 200 && r.body?.code === "not_started" && r.body?.test?.questions?.length === 0, r);
    noLeak("GET /test-submissions/assignment/:id", r);

    const run = { assignmentId: A, testId: T, questionId: String(codingQ._id), sourceCode: "print(input())", language: "python" };
    r = await api("/coding/run", { token: s.token, method: "POST", body: run });
    check("POST /coding/run refused: 403 not_started", r.status === 403 && r.body?.code === "not_started", r);
    noLeak("POST /coding/run", r);

    r = await api("/coding/submit", { token: s.token, method: "POST", body: run });
    check("POST /coding/submit refused: 403 not_started", r.status === 403 && r.body?.code === "not_started", r);
    check("  …and nothing was graded into a submission",
      (await TestSubmission.countDocuments({ assignmentId: early.a._id })) === 0);

    r = await api("/answers", { token: s.token, method: "POST", body: { assignmentId: A, questionId: String(mcqQ._id), selectedOption: SECRET.optB } });
    check("Autosave refused before the exam (no session can exist)", r.status === 403, r.status);

    // ── 2. A session that already exists must not unlock an early paper ──
    section("2. A leftover live session (opened before this fix, or before a reschedule)");
    await ProctorSession.create({
      userId: s.user._id, assignmentId: early.a._id, testId: test._id, testKind: "assigned",
      status: "active", policy: { enabled: true, allowedViolations: 100 }, seb: { required: false },
      lastHeartbeatAt: new Date(),
    });
    r = await api(`/assignments/${A}`, { token: s.token });
    check("GET /assignments/:id: still no paper", r.status === 200 && r.body?.testId?.questions?.length === 0, r.status);
    noLeak("GET /assignments/:id with a live session", r);
    r = await api(`/tests/${T}`, { token: s.token });
    check("GET /tests/:id: 403 not_started even with a live session", r.status === 403 && r.body?.code === "not_started", r);
    noLeak("GET /tests/:id with a live session", r);

    // ── 3. Status already "In Progress" but the window has not opened ──────
    section("3. Assignment marked In Progress (admin edit) before its window opens");
    await Assignment.updateOne({ _id: early.a._id }, { $set: { status: "In Progress", startedAt: new Date() } });
    r = await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
    check("POST /start refuses on the in-progress branch too: 400 not_started", r.status === 400 && r.body?.code === "not_started", r);
    noLeak("POST /start (in-progress branch)", r);
    r = await api(`/assignments/${A}`, { token: s.token });
    noLeak("GET /assignments/:id (in-progress, not open)", r);
    await ProctorSession.deleteMany({ assignmentId: early.a._id });
    await Assignment.updateOne({ _id: early.a._id }, { $set: { status: "Assigned" }, $unset: { startedAt: 1 } });

    // ── 4. Reviewers are unaffected ────────────────────────────────────────
    section("4. Admins still see the paper before the exam");
    r = await api(`/tests/${T}`, { token: admin.token });
    check("Admin GET /tests/:id: 200 with the full paper", r.status === 200 && leaked(r.body).length === Object.keys(SECRET).length, leaked(r.body));
    r = await api(`/assignments/${A}`, { token: admin.token });
    check("Admin GET /assignments/:id: 200 with the paper", r.status === 200 && r.body?.testId?.questions?.length === 2, r.status);
    r = await api(`/test-submissions/assignment/${A}`, { token: admin.token });
    check("Admin results route: 200 with the paper", r.status === 200 && r.body?.test?.questions?.length === 2, r.status);

    // ── 5. Mid-exam, the results route is not a side door ──────────────────
    section("5. During the exam, the paper is only served through the proctored routes");
    const live = await seat("live", -1); // opened a minute ago
    r = await api(`/assignments/${live.A}/start`, { token: live.s.token, method: "POST", body: {} });
    check("Exam that has opened: /start 200", r.status === 200, r);
    r = await api("/proctor/session/start", {
      token: live.s.token, method: "POST", body: { assignmentId: live.A, testKind: "assigned", environment: {} },
    });
    check("  …proctor session 200", r.status === 200, r);
    r = await api(`/assignments/${live.A}`, { token: live.s.token });
    check("  …GET /assignments/:id serves both questions", r.status === 200 && r.body?.testId?.questions?.length === 2, r.body?.testId?.questions?.length);
    r = await api(`/tests/${T}`, { token: live.s.token });
    check("  …GET /tests/:id serves the paper", r.status === 200 && r.body?.questions?.length === 2, r.status);
    r = await api("/coding/run", { token: live.s.token, method: "POST", body: { ...run, assignmentId: live.A } });
    check("  …/coding/run is not refused for timing", r.status !== 403, { status: r.status, body: r.body });
    await api("/answers", { token: live.s.token, method: "POST", body: { assignmentId: live.A, questionId: String(mcqQ._id), selectedOption: SECRET.optB } });
    r = await api(`/test-submissions/assignment/${live.A}`, { token: live.s.token });
    check("Results route mid-exam: no paper (code attempt_in_progress)",
      r.status === 200 && r.body?.code === "attempt_in_progress" && r.body?.test?.questions?.length === 0, r);
    noLeak("Results route mid-exam", r);

    // ── 6. After the exam, the paper is the student's to review ────────────
    section("6. After submitting, the student can review their paper");
    r = await api("/test-submissions", {
      token: live.s.token, method: "POST",
      body: { assignmentId: live.A, responses: [{ questionId: String(mcqQ._id), selectedOption: SECRET.optB }], timeSpent: 60 },
    });
    check("Submit: 201", r.status === 201, r);
    r = await api(`/test-submissions/assignment/${live.A}`, { token: live.s.token });
    check("Results route after submitting: 200 with both questions",
      r.status === 200 && r.body?.test?.questions?.length === 2 && !r.body?.code, { status: r.status, n: r.body?.test?.questions?.length, code: r.body?.code });

    const lapsed = await seat("lapsed", -90, 60); // window closed half an hour ago, never started
    r = await api(`/test-submissions/assignment/${lapsed.A}`, { token: lapsed.s.token });
    check("Results route for a window that closed unstarted: paper shown (exam is over)",
      r.status === 200 && r.body?.test?.questions?.length === 2, { status: r.status, n: r.body?.test?.questions?.length });

    // ── 7. The moment the window opens ─────────────────────────────────────
    section("7. The same student, once the window opens");
    await Assignment.updateOne({ _id: early.a._id }, { $set: { startTime: new Date(Date.now() - 1000), deadline: new Date(Date.now() + 60 * MIN) } });
    r = await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
    check("/start: 200", r.status === 200, r);
    r = await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
    check("Proctor session: 200", r.status === 200, r);
    r = await api(`/assignments/${A}`, { token: s.token });
    check("GET /assignments/:id now serves the paper", r.status === 200 && r.body?.testId?.questions?.length === 2 && !r.body?.notStarted, r.status);
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
