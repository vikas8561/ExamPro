/**
 * Regression: a student must not be signed out of a live exam, and signing back
 * in must not cost them their answers.
 *
 * Reported 2026-10-16: many students were "logged out" during the exam or at
 * Submit, and came back to a blank paper. Three causes, each checked here:
 *
 *   1. A token lived exactly 24 hours and nothing renewed it. A student who
 *      signed in yesterday around the exam's time ran out mid-paper, and every
 *      autosave after that was refused. -> POST /auth/refresh renews a live
 *      token, keeps the old one valid briefly for requests in flight, and
 *      carries the exam binding over.
 *   2. Any sign-in elsewhere (a phone, a second browser) revoked the exam
 *      session at once, as did an admin's password reset. -> a session sitting
 *      a live exam survives both; a second device may not open the same exam
 *      while the first is live; the old rule applies again once it is over.
 *   3. The hand-in replaced every saved answer with the page's copy, so a page
 *      that came back blank erased the paper. -> blank answers on the page fall
 *      back to the saved ones (services/answerMerge.js).
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const { grantSession } = require("../lib/testAuth");
const { mergeWithSaved } = require("../../services/answerMerge");

const MARK = `session-${Date.now()}`;
const MIN = 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The auth middleware remembers a live session for this long; a revocation
// only shows once it has passed.
const SESSION_CACHE_MS = 10_500;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const AuthSession = require("../../models/AuthSession");
  const Student = require("../../models/Student");

  const bin = { tests: [], assignments: [] };

  try {
    // ── 0. The merge rule on its own ─────────────────────────────────────────
    section("0. answerMerge: the page wins when it has an answer, the saved copy when it is blank");
    {
      const saved = [
        { questionId: "a", selectedOption: "4" },
        { questionId: "b", textAnswer: "essay" },
        { questionId: "c", textAnswer: "graded()", draftAnswer: "later()", language: "python" },
        { questionId: "d", textAnswer: "" },
      ];
      const { responses, fromSaved } = mergeWithSaved(
        [
          { questionId: "a" },
          { questionId: "b", textAnswer: "  " },
          { questionId: "c", textAnswer: "", language: "cpp" },
          { questionId: "d", textAnswer: "new" },
          { questionId: "e", selectedOption: "x" },
        ],
        saved
      );
      const by = Object.fromEntries(responses.map((r) => [r.questionId, r]));
      check("Blank MCQ takes the saved option", by.a.selectedOption === "4", by.a);
      check("Whitespace-only theory takes the saved text", by.b.textAnswer === "essay", by.b);
      check("Blank coding takes the latest draft, keeping the page's language", by.c.textAnswer === "later()" && by.c.language === "cpp", by.c);
      check("A page answer always wins", by.d.textAnswer === "new" && by.e.selectedOption === "x");
      check("fromSaved names exactly the filled-in questions", JSON.stringify(fromSaved.sort()) === '["a","b","c"]', fromSaved);
      check("Saved answers the page never mentions are kept", mergeWithSaved([], [{ questionId: "z", selectedOption: "1" }]).responses.length === 1);
    }

    // ── Fixtures ────────────────────────────────────────────────────────────
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const test = await Test.create({
      title: `ZZ SessionContinuity ${MARK}`, type: "mcq", status: "Active", timeLimit: 60,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "mcq", text: "3+3?", options: [{ text: "5" }, { text: "6" }], answer: "6", points: 1 },
        { kind: "theory", text: "Explain.", points: 5 },
      ],
    });
    bin.tests.push(test._id);
    const Q = test.questions.map((q) => String(q._id));

    async function student(label) {
      const s = await makeUser("Student", label, { mark: MARK });
      await Student.updateOne({ _id: s.user._id }, { $set: { password: await bcrypt.hash("local-only", 4) } });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 120,
        deadline: new Date(startTime.getTime() + 120 * MIN),
      });
      bin.assignments.push(a._id);
      return { s, a, A: String(a._id), uid: s.doc.UniversityUID };
    }
    // Real sign-ins, one second apart at least: that is what students do.
    const login = async (who) => {
      await sleep(1100);
      const r = await api("/auth/login", { method: "POST", body: { identifier: who.uid, password: "local-only" } });
      return r.body?.token;
    };
    const openExam = (who, token) =>
      api("/proctor/session/start", { token, method: "POST", body: { assignmentId: who.A, testKind: "assigned", environment: {} } });
    const begin = async (who, token) => {
      await api(`/assignments/${who.A}/start`, { token, method: "POST", body: {} });
      const r = await openExam(who, token);
      return r.body?.sessionId;
    };
    const save = (who, token, qi, option, text = "") =>
      api("/answers", { token, method: "POST", body: { assignmentId: who.A, questionId: Q[qi], selectedOption: option, textAnswer: text } });
    const stored = async (who) => {
      const sub = await TestSubmission.findOne({ assignmentId: who.a._id }).lean();
      return Object.fromEntries((sub?.responses || []).map((r) => [String(r.questionId), r.selectedOption || r.textAnswer || null]));
    };

    // ── 1. A sign-in elsewhere during the exam ──────────────────────────────
    section("1. Signing in on another device during a live exam");
    const one = await student("second-login");
    const laptop = await login(one);
    const sid = await begin(one, laptop);
    check("Exam opened on the laptop", Boolean(sid));
    check("Laptop saves Q1", (await save(one, laptop, 0, "4")).status === 200);
    const phone = await login(one);
    check("The phone signs in", Boolean(phone) && phone !== laptop);
    await sleep(SESSION_CACHE_MS);
    let r = await save(one, laptop, 1, "6");
    check("The laptop keeps saving answers (was: 403 Invalid or expired session)", r.status === 200, r);
    r = await api("/proctor/session/heartbeat", { token: laptop, method: "POST", body: { sessionId: sid } });
    check("…and its heartbeat keeps going", r.status === 200 && r.body?.action === "continue", r);
    check("The phone is signed in too", (await api("/auth/profile", { token: phone })).status === 200);
    r = await openExam(one, phone);
    check("The phone may NOT open the same exam alongside it: 409 exam_open_elsewhere", r.status === 409 && r.body?.code === "exam_open_elsewhere", r);
    r = await openExam(one, laptop);
    check("The laptop itself can reload the exam", r.status === 200 && r.body?.resumed === true, r);

    section("1b. Once the exam is handed in, the single-session rule is back");
    r = await api("/test-submissions", {
      token: laptop, method: "POST",
      body: { assignmentId: one.A, timeSpent: 60, responses: Q.map((questionId) => ({ questionId })) },
    });
    check("Hand-in from the laptop: 201", r.status === 201, r);
    await login(one);
    await sleep(SESSION_CACHE_MS);
    r = await api("/auth/profile", { token: laptop });
    check("A new sign-in now replaces the laptop's session (403)", r.status === 403 && r.body?.message === "Invalid or expired session", r);

    section("1c. Outside an exam nothing changed: a new sign-in replaces the old one");
    const idle = await student("idle");
    const first = await login(idle);
    await login(idle);
    await sleep(SESSION_CACHE_MS);
    r = await api("/auth/profile", { token: first });
    check("The earlier session is revoked (403 Invalid or expired session)", r.status === 403 && r.body?.message === "Invalid or expired session", r);

    section("1d. A crashed browser frees the exam once its binding lapses");
    const crash = await student("crash");
    const dead = await login(crash);
    await begin(crash, dead);
    const fresh = await login(crash);
    check("Straight after, another browser is refused (409)", (await openExam(crash, fresh)).status === 409);
    await AuthSession.updateOne({ token: dead }, { $set: { inExamUntil: new Date(Date.now() - 1000) } });
    r = await openExam(crash, fresh);
    check("Once the old browser has gone quiet past the binding, the new one may resume (200)", r.status === 200 && r.body?.resumed === true, r);

    // ── 2. An admin resets the password mid-exam ────────────────────────────
    section("2. A password reset during a live exam");
    const reset = await student("reset");
    const resetToken = await login(reset);
    await begin(reset, resetToken);
    r = await api(`/users/${reset.s.user._id}/reset-password`, { token: admin.token, method: "POST", body: {} });
    check("Admin resets the password: 200", r.status === 200, r);
    await sleep(SESSION_CACHE_MS);
    r = await save(reset, resetToken, 0, "4");
    check("The exam session is not thrown out (was: 403 after the cache)", r.status === 200, r);

    // ── 3. Renewal ──────────────────────────────────────────────────────────
    section("3. Renewing the token");
    const renew = await student("renew");
    // A token two minutes from its end, as a student who signed in yesterday has.
    const old = jwt.sign(
      { userId: renew.s.user._id, email: renew.s.user.email, role: "Student" },
      process.env.JWT_SECRET,
      { expiresIn: "2m", jwtid: "old-token" }
    );
    await grantSession(renew.s.user, old, { hours: 2 / 60 });
    const renewSid = await begin(renew, old);
    check("Exam opened on a nearly expired token", Boolean(renewSid));
    r = await api("/auth/refresh", { token: old, method: "POST" });
    const renewed = r.body?.token;
    check("POST /auth/refresh: 200 with a different token", r.status === 200 && renewed && renewed !== old, r);
    const decoded = jwt.decode(renewed);
    check("The new token is good for 24 hours", decoded.exp - decoded.iat === 24 * 3600, decoded);
    check("The new token saves answers", (await save(renew, renewed, 0, "4")).status === 200);
    check("The old one still works for in-flight requests", (await save(renew, old, 1, "6")).status === 200);
    const oldRow = await AuthSession.findOne({ token: old }).lean();
    const newRow = await AuthSession.findOne({ token: renewed }).lean();
    check("Old row is marked replaced, cut to a short overlap, and no longer holds the exam",
      oldRow?.replacedAt && new Date(oldRow.expiresAt) - Date.now() <= 2 * MIN && !oldRow.inExamUntil, oldRow);
    check("The exam binding moved to the new token", newRow?.inExamUntil && new Date(newRow.inExamUntil) > new Date(), newRow);
    r = await api("/auth/refresh", { token: old, method: "POST" });
    check("The old token cannot be renewed a second time (409 already_renewed)", r.status === 409 && r.body?.code === "already_renewed", r);
    r = await openExam(renew, renewed);
    check("Reloading the exam on the renewed token is not taken for a second device (200)", r.status === 200, r);
    r = await api("/auth/refresh", { token: renewed, method: "POST" });
    check("A token with nearly its whole life left comes back unchanged", r.status === 200 && r.body?.token === renewed, r);
    await AuthSession.updateOne({ token: old }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await sleep(SESSION_CACHE_MS);
    r = await save(renew, old, 1, "5");
    check("When the overlap ends, the old token is refused (403)", r.status === 403, r);

    section("3b. An expired token cannot be renewed");
    const gone = await student("gone");
    const expired = jwt.sign({ userId: gone.s.user._id, role: "Student" }, process.env.JWT_SECRET, { expiresIn: "1s", jwtid: "gone" });
    await grantSession(gone.s.user, expired);
    await sleep(1500);
    r = await api("/auth/refresh", { token: expired, method: "POST" });
    check("POST /auth/refresh with an expired token: 403", r.status === 403, r);

    // ── 4. Hand-in merges with the saved answers ────────────────────────────
    section("4. Submitting from a page that came back blank");
    const blank = await student("blank-page");
    const blankToken = await login(blank);
    await begin(blank, blankToken);
    await save(blank, blankToken, 0, "4");
    await save(blank, blankToken, 1, "5");
    await save(blank, blankToken, 2, undefined, "my essay");
    r = await api("/test-submissions", {
      token: blankToken, method: "POST",
      body: {
        assignmentId: blank.A, timeSpent: 60,
        // The page lost Q1 and Q3, and has a newer answer for Q2.
        responses: [{ questionId: Q[0] }, { questionId: Q[1], selectedOption: "6" }, { questionId: Q[2], textAnswer: "" }],
      },
    });
    check("Hand-in: 201", r.status === 201, r);
    const kept = await stored(blank);
    check("Q1 keeps its saved answer (was: wiped)", kept[Q[0]] === "4", kept);
    check("Q2 takes the page's newer answer", kept[Q[1]] === "6", kept);
    check("Q3 keeps its saved essay (was: wiped)", kept[Q[2]] === "my essay", kept);
    const graded = await Assignment.findById(blank.a._id).lean();
    check("The score counts the kept answers (2 of 2 MCQs right)", graded.autoScore === 2, graded.autoScore);
    const session = await ProctorSession.findOne({ assignmentId: blank.a._id }).lean();
    check("The proctoring session is closed as before", session?.status === "ended", session?.status);

    section("4b. A cleared MCQ stays cleared at hand-in");
    const cleared = await student("cleared");
    const clearedToken = await login(cleared);
    await begin(cleared, clearedToken);
    await save(cleared, clearedToken, 0, "3");
    // "Clear response": the page now saves the blank (TakeTest saveAnswerToBackend).
    r = await api("/answers", {
      token: clearedToken, method: "POST",
      body: { assignmentId: cleared.A, questionId: Q[0], textAnswer: "" },
    });
    check("Saving the cleared MCQ: 200", r.status === 200, r);
    r = await api("/test-submissions", {
      token: clearedToken, method: "POST",
      body: { assignmentId: cleared.A, timeSpent: 60, responses: Q.map((questionId) => ({ questionId })) },
    });
    const afterClear = await stored(cleared);
    check("Hand-in does not bring the cleared choice back", r.status === 201 && !afterClear[Q[0]], afterClear);
  } finally {
    await Promise.all([
      Test.deleteMany({ _id: { $in: bin.tests } }),
      Assignment.deleteMany({ _id: { $in: bin.assignments } }),
      TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } }),
      ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (error) => {
  console.error(error);
  await disconnect().catch(() => {});
  process.exit(1);
});
