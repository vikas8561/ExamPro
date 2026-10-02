/**
 * Regression: code can only be run and graded while the attempt is open.
 *
 * POST /api/coding/submit checked who you were and nothing else: not the
 * attempt's status, not its clock, not the proctoring session. A student could
 * submit partial code, hand the paper in, then keep submitting better code --
 * days later, after comparing notes -- and best-wins grading raised the score
 * the results page shows. /coding/run likewise worked against a finished paper
 * and outside the proctored page.
 *
 * Needs a judge. Start the Python-only stand-in with
 * `node scripts/lib/localJudge0.js` and point the API at it
 * (JUDGE0_URL=http://127.0.0.1:2358).
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `codewin-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

// Hidden cases "2" and "3"; the question is worth 4, so 2 marks per case.
const FULL = "print(input())";
const PARTIAL = "x = input()\nprint('2')"; // passes the "2" case only
const SLOW_FULL = "import time\ntime.sleep(4)\nprint(input())";

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");

  const bin = { tests: [], assignments: [] };

  try {
    const health = await api("/coding/health", { token: (await makeUser("Admin", "probe", { mark: MARK })).token });
    if (health.status !== 200) {
      console.error("\nThe API cannot reach a judge. Start scripts/lib/localJudge0.js and run the API with JUDGE0_URL=http://127.0.0.1:2358.");
      fail++;
      return;
    }

    const admin = await makeUser("Admin", "admin", { mark: MARK });

    const test = await Test.create({
      title: `ZZ CodeWindow ${MARK}`, type: "mixed", subject: "", status: "Active",
      timeLimit: 30, allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        {
          kind: "coding", text: "Echo the input.", language: "python", points: 4,
          visibleTestCases: [{ input: "1", output: "1" }],
          hiddenTestCases: [{ input: "2", output: "2", marks: 1 }, { input: "3", output: "3", marks: 1 }],
        },
      ],
    });
    bin.tests.push(test._id);
    const [mcqQ, codingQ] = test.questions;
    const T = String(test._id);

    /** A student sitting the exam: window opened a minute ago, 60 minutes long. */
    async function sit(label, { session = true } = {}) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      let sessionId = null;
      if (session) {
        const r = await api("/proctor/session/start", {
          token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} },
        });
        sessionId = r.body?.sessionId;
      }
      return { s, a, A, sessionId };
    }

    const code = (A, sourceCode, extra = {}) => ({
      assignmentId: A, questionId: String(codingQ._id), sourceCode, language: "python", ...extra,
    });
    const submitCode = (who, body) => api("/coding/submit", { token: who.token, method: "POST", body });
    const runCode = (who, body) => api("/coding/run", { token: who.token, method: "POST", body });
    // What the exam page sends on hand-in: the MCQ choice and whatever is in
    // the code editor at that moment.
    const handIn = (who, A, editorCode, extra = {}) => api("/test-submissions", {
      token: who.token, method: "POST",
      body: {
        assignmentId: A, timeSpent: 60, ...extra,
        responses: [
          { questionId: String(mcqQ._id), selectedOption: "4" },
          { questionId: String(codingQ._id), textAnswer: editorCode, language: "python" },
        ],
      },
    });
    const scores = async (a) => {
      const asg = await Assignment.findById(a._id).lean();
      const sub = await TestSubmission.findOne({ assignmentId: a._id, userId: asg.userId }).lean();
      const coding = (sub?.responses || []).find((r) => String(r.questionId) === String(codingQ._id));
      return { status: asg.status, autoScore: asg.autoScore, totalScore: sub?.totalScore ?? null, codingPoints: coding?.points ?? null };
    };

    // ── 1. The exploit, start to finish ────────────────────────────────────
    section("1. Submit partial code, hand in, then try to improve it");
    const cheat = await sit("cheat");
    let r = await runCode(cheat.s, code(cheat.A, FULL));
    check("During the exam: Run works (200)", r.status === 200, r);
    r = await submitCode(cheat.s, code(cheat.A, PARTIAL));
    check("During the exam: Submit grades partial code (1 of 2 cases)", r.status === 200 && r.body?.passedCount === 1, r);
    r = await handIn(cheat.s, cheat.A, PARTIAL);
    check("Hand in: 201", r.status === 201, r);
    const handedIn = await scores(cheat.a);
    check("Marked: MCQ 1 + coding 2 = 3, assignment and submission agree",
      handedIn.status === "Completed" && handedIn.totalScore === 3 && handedIn.autoScore === 3 && handedIn.codingPoints === 2, handedIn);

    r = await submitCode(cheat.s, code(cheat.A, FULL));
    check("After handing in: Submit refused (400 attempt_not_active)", r.status === 400 && r.body?.code === "attempt_not_active", r);
    r = await submitCode(cheat.s, { ...code(cheat.A, FULL), assignmentId: undefined, testId: T });
    check("…also when the request names the test instead of the assignment", r.status === 400 && r.body?.code === "attempt_not_active", r);
    r = await runCode(cheat.s, code(cheat.A, FULL));
    check("After handing in: Run refused too (400 attempt_not_active)", r.status === 400 && r.body?.code === "attempt_not_active", r);
    const afterTries = await scores(cheat.a);
    check("The score did not move (still 3; coding still 2)", JSON.stringify(afterTries) === JSON.stringify(handedIn), { before: handedIn, after: afterTries });

    // ── 1b. An earned grade survives a blank hand-in ───────────────────────
    section("1b. Score on Judge0, clear the editor, hand in blank");
    const blank = await sit("blank");
    r = await submitCode(blank.s, code(blank.A, PARTIAL));
    check("Submit grades partial code (1 of 2 cases)", r.status === 200 && r.body?.passedCount === 1, r);
    // The editor is emptied and that autosaves, as the page would.
    await api("/answers", { token: blank.s.token, method: "POST", body: { assignmentId: blank.A, questionId: String(codingQ._id), textAnswer: "", language: "python" } });
    r = await handIn(blank.s, blank.A, "");
    check("Hand in with an empty editor: 201", r.status === 201, r);
    const blankScores = await scores(blank.a);
    check("The earned 2 marks are kept: MCQ 1 + coding 2 = 3, assignment and submission agree",
      blankScores.totalScore === 3 && blankScores.autoScore === 3 && blankScores.codingPoints === 2, blankScores);
    const blankRow = (await TestSubmission.findOne({ assignmentId: blank.a._id }).lean())
      .responses.find((x) => String(x.questionId) === String(codingQ._id));
    check("  …stored with the code that earned them, not the empty editor", blankRow?.textAnswer === PARTIAL, blankRow?.textAnswer);

    // ── 1c. Graded, then kept editing: hand-in keeps both ──────────────────
    section("1c. Score on Judge0, keep editing, hand in the edited code");
    const EDITED = "# trying something else\nx = input()\nprint('9')";
    const kept = await sit("keptediting");
    r = await submitCode(kept.s, code(kept.A, PARTIAL));
    check("Submit grades partial code (1 of 2 cases)", r.status === 200 && r.body?.passedCount === 1, r);
    await api("/answers", { token: kept.s.token, method: "POST", body: { assignmentId: kept.A, questionId: String(codingQ._id), textAnswer: EDITED, language: "python" } });
    r = await handIn(kept.s, kept.A, EDITED);
    check("Hand in with the edited code in the editor: 201", r.status === 201, r);
    const keptRow = (await TestSubmission.findOne({ assignmentId: kept.a._id }).lean())
      .responses.find((x) => String(x.questionId) === String(codingQ._id));
    check("Grade kept (2) and stored with the code that earned it", keptRow?.points === 2 && keptRow?.textAnswer === PARTIAL, { points: keptRow?.points, textAnswer: keptRow?.textAnswer });
    check("The edited code is kept as the draft", keptRow?.draftAnswer === EDITED, keptRow?.draftAnswer);
    check("The pass count survives hand-in (1 of 2)", keptRow?.passedCount === 1 && keptRow?.totalHidden === 2, { passedCount: keptRow?.passedCount, totalHidden: keptRow?.totalHidden });

    const reviewerView = await api(`/test-submissions/assignment/${kept.A}`, { token: admin.token });
    const reviewerQ = reviewerView.body?.test?.questions?.find((q) => String(q._id) === String(codingQ._id));
    check("Reviewer's results page: graded code, draft and pass count",
      reviewerQ?.textAnswer === PARTIAL && reviewerQ?.draftAnswer === EDITED && reviewerQ?.passedCount === 1 && reviewerQ?.totalHidden === 2,
      { textAnswer: reviewerQ?.textAnswer, draftAnswer: reviewerQ?.draftAnswer, passedCount: reviewerQ?.passedCount });

    const studentEarly = await api(`/test-submissions/assignment/${kept.A}`, { token: kept.s.token });
    const studentQ = studentEarly.body?.test?.questions?.find((q) => String(q._id) === String(codingQ._id));
    check("Student before results are released: own code and draft, but no pass count",
      studentEarly.body?.showResults === false && studentQ?.textAnswer === PARTIAL && studentQ?.draftAnswer === EDITED && studentQ?.passedCount === undefined,
      { showResults: studentEarly.body?.showResults, keys: Object.keys(studentQ || {}) });

    await Assignment.updateOne({ _id: kept.a._id }, { $set: { deadline: new Date(Date.now() - 60 * 1000) } });
    const studentLater = await api(`/test-submissions/assignment/${kept.A}`, { token: kept.s.token });
    const studentLaterQ = studentLater.body?.test?.questions?.find((q) => String(q._id) === String(codingQ._id));
    check("Student after results are released: pass count shown too",
      studentLater.body?.showResults === true && studentLaterQ?.passedCount === 1 && studentLaterQ?.draftAnswer === EDITED,
      { showResults: studentLater.body?.showResults, passedCount: studentLaterQ?.passedCount });

    section("1d. Abandoned after grading and editing: the sweep keeps both");
    const gone = await sit("abandonedgraded");
    await submitCode(gone.s, code(gone.A, PARTIAL));
    await api("/answers", { token: gone.s.token, method: "POST", body: { assignmentId: gone.A, questionId: String(codingQ._id), textAnswer: EDITED, language: "python" } });
    await Assignment.updateOne({ _id: gone.a._id }, { $set: { startedAt: new Date(Date.now() - 30 * MIN - 6 * MIN) } });
    await sweepExpiredAttempts();
    const goneScores = await scores(gone.a);
    const goneRow = (await TestSubmission.findOne({ assignmentId: gone.a._id }).lean())
      .responses.find((x) => String(x.questionId) === String(codingQ._id));
    check("Sweep finalised it with the earned grade (2), assignment and submission agree",
      goneScores.status === "Completed" && goneScores.codingPoints === 2 && goneScores.autoScore === goneScores.totalScore, goneScores);
    check("  …graded code, draft and pass count all kept",
      goneRow?.textAnswer === PARTIAL && goneRow?.draftAnswer === EDITED && goneRow?.passedCount === 1,
      { textAnswer: goneRow?.textAnswer, draftAnswer: goneRow?.draftAnswer, passedCount: goneRow?.passedCount });

    // ── 2. Time up, but not yet finalised ──────────────────────────────────
    section("2. Clock has run out; the attempt is still marked In Progress");
    const late = await sit("late");
    await Assignment.updateOne({ _id: late.a._id }, { $set: { startedAt: new Date(Date.now() - 30 * MIN - 10 * 1000) } });
    r = await submitCode(late.s, code(late.A, FULL));
    check("Submit refused (400 attempt_expired)", r.status === 400 && r.body?.code === "attempt_expired", r);
    r = await submitCode(late.s, { ...code(late.A, FULL), assignmentId: undefined, testId: T });
    check("…also by testId", r.status === 400 && r.body?.code === "attempt_expired", r);
    r = await runCode(late.s, code(late.A, FULL));
    check("Run refused (400 attempt_expired)", r.status === 400 && r.body?.code === "attempt_expired", r);
    check("Nothing was graded", (await TestSubmission.countDocuments({ assignmentId: late.a._id })) === 0);

    const edge = await sit("edge");
    await Assignment.updateOne({ _id: edge.a._id }, { $set: { startedAt: new Date(Date.now() - 30 * MIN + 15 * 1000) } });
    r = await submitCode(edge.s, code(edge.A, FULL));
    check("With 15 seconds left, Submit is still accepted and graded", r.status === 200 && r.body?.passedCount === 2, r);

    // ── 3. Outside the proctored page ──────────────────────────────────────
    section("3. Proctoring session missing, terminated, or ended");
    const nosess = await sit("nosession", { session: false });
    r = await submitCode(nosess.s, code(nosess.A, FULL));
    check("No session: Submit refused (403, proctoringRequired)", r.status === 403 && r.body?.proctoringRequired === true && r.body?.reason === "no_session", r);
    r = await submitCode(nosess.s, { ...code(nosess.A, FULL), assignmentId: undefined, testId: T });
    check("No session, by testId: refused too (403)", r.status === 403 && r.body?.reason === "no_session", r);
    r = await runCode(nosess.s, code(nosess.A, FULL));
    check("No session: Run refused (403)", r.status === 403 && r.body?.reason === "no_session", r);

    const term = await sit("terminated");
    await ProctorSession.updateOne({ _id: term.sessionId }, { $set: { status: "terminated", terminatedReason: "test" } });
    r = await submitCode(term.s, code(term.A, FULL));
    check("Session terminated by proctoring: Submit refused (403 terminated)", r.status === 403 && r.body?.reason === "terminated", r);

    const ended = await sit("ended");
    // A student can no longer end their own session mid-exam (it waits for the
    // hand-in), so put the session in the ended state directly -- the state a
    // hand-in or the sweep leaves it in.
    await ProctorSession.updateOne({ _id: ended.sessionId }, { $set: { status: "ended", endedAt: new Date() } });
    r = await submitCode(ended.s, code(ended.A, FULL));
    check("Session ended: Submit refused (403 ended)", r.status === 403 && r.body?.reason === "ended", r);
    for (const who of [nosess, term, ended]) {
      check(`  …no grade written for ${who.s.user.name.split(" ")[1]}`, (await TestSubmission.countDocuments({ assignmentId: who.a._id })) === 0);
    }

    // ── 4. A grade in flight when the page auto-submits ────────────────────
    section("4. Submit pressed in time; the page auto-submits while it is being judged");
    const race = await sit("race");
    const t0 = Date.now();
    const inFlight = submitCode(race.s, code(race.A, SLOW_FULL)); // ~4s per case in the judge
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const handedRace = await handIn(race.s, race.A, SLOW_FULL, { autoSubmit: true });
    check("The auto-submit lands while the code is still being judged (201)", handedRace.status === 201 && Date.now() - t0 < 4000,
      { status: handedRace.status, elapsedMs: Date.now() - t0 });
    const before = await scores(race.a);
    check("  …and at that moment the paper is Completed with only the MCQ mark (1)", before.status === "Completed" && before.autoScore === 1, before);
    r = await inFlight;
    check("The in-flight grade still returns (it was submitted in time): both cases pass", r.status === 200 && r.body?.passedCount === 2, r);
    const after = await scores(race.a);
    check("It is kept: coding 4, total 5",
      after.codingPoints === 4 && after.totalScore === 5, after);
    check("…and the assignment's score was brought into line (autoScore 5, not 1)", after.autoScore === 5 && after.status === "Completed", after);
    r = await submitCode(race.s, code(race.A, FULL));
    check("A new Submit after that is refused (400 attempt_not_active)", r.status === 400 && r.body?.code === "attempt_not_active", r);

    // ── 5. Legitimate paths still work ─────────────────────────────────────
    section("5. Re-enabled attempts and reviewers");
    r = await api(`/assignments/${cheat.A}/re-enable`, { token: admin.token, method: "POST", body: {} });
    check("Admin re-enables the handed-in paper (200)", r.status === 200, r);
    r = await submitCode(cheat.s, code(cheat.A, FULL));
    check("Re-enabled attempt: Submit works again and grades in full", r.status === 200 && r.body?.passedCount === 2, r);
    const reopened = await scores(cheat.a);
    check("  …and the attempt is still In Progress with the new coding mark (4)",
      reopened.status === "In Progress" && reopened.codingPoints === 4, reopened);

    r = await runCode(admin, code(race.A, FULL));
    check("Admin can still Run code against a finished paper for review (200)", r.status === 200, r);
    r = await submitCode(admin, code(race.A, FULL));
    check("Admin still cannot Submit into a student's paper (403)", r.status === 403, r.status);
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
