/**
 * Regression: hidden test cases never reach a student, even reviewing a
 * released paper.
 *
 * The results route stripped them from the questions only when the student had
 * a submission row. With none -- an attempt finalised with nothing saved -- it
 * sent every question whole once results were released, hidden inputs and
 * expected outputs included. The same cases grade every cohort that sits the
 * question, so one leak hands them to everyone the student passes them to.
 *
 * GET /api/practice-tests/:testId likewise removed only `answer`, so a practice
 * test holding a coding or theory question served its hidden cases and model
 * answer.
 *
 * Every secret here carries a unique marker and each reply is searched for it.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `hidden-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

const HIDDEN = [`HIDDEN-IN-A-${MARK}`, `HIDDEN-OUT-A-${MARK}`, `HIDDEN-IN-B-${MARK}`, `HIDDEN-OUT-B-${MARK}`];
const VISIBLE = `VISIBLE-IN-${MARK}`;
const MODEL = `MODEL-ANSWER-${MARK}`;
const leaks = (body, secrets) => {
  const text = JSON.stringify(body ?? null);
  return secrets.filter((secret) => text.includes(secret));
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
    const coding = {
      kind: "coding", text: "Echo it.", language: "python", points: 4,
      visibleTestCases: [{ input: VISIBLE, output: VISIBLE }],
      hiddenTestCases: [{ input: HIDDEN[0], output: HIDDEN[1], marks: 1 }, { input: HIDDEN[2], output: HIDDEN[3], marks: 1 }],
    };
    const test = await Test.create({
      title: `ZZ Hidden ${MARK}`, type: "mixed", status: "Active", timeLimit: 30,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 }, coding],
    });
    bin.tests.push(test._id);

    /** An assignment whose window closed 10 minutes ago, so results are released. */
    async function finishedAttempt(label, status = "Completed") {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - 70 * MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status, startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN), startedAt: startTime, completedAt: new Date(Date.now() - 15 * MIN),
      });
      bin.assignments.push(a._id);
      return { s, a, A: String(a._id) };
    }

    // ── 1. Released, no submission row ─────────────────────────────────────
    section("1. Released paper, attempt finished with nothing submitted");
    const bare = await finishedAttempt("nosubmission");
    check("(no submission row exists)", (await TestSubmission.countDocuments({ assignmentId: bare.a._id })) === 0);
    let r = await api(`/test-submissions/assignment/${bare.A}`, { token: bare.s.token });
    check("Results page answers (200) and shows results", r.status === 200 && r.body?.showResults === true, { status: r.status, showResults: r.body?.showResults });
    check("No hidden test case input or output anywhere in the reply", leaks(r.body, HIDDEN).length === 0, leaks(r.body, HIDDEN));
    const codingQ = (r.body?.test?.questions || []).find((q) => q.kind === "coding");
    check("…the review still has what it should: the visible case, and how many hidden ones there were (2)",
      leaks(r.body, [VISIBLE]).length === 1 && codingQ?.hiddenTestCaseCount === 2 && codingQ?.hiddenTestCases === undefined, codingQ && { count: codingQ.hiddenTestCaseCount });
    check("…and the MCQ answer key (that is the point of a review)",
      (r.body?.test?.questions || []).some((q) => q.kind === "mcq" && q.answer === "4"));

    // ── 2. Released, with a submission row ─────────────────────────────────
    section("2. Released paper with a submission");
    const sub = await finishedAttempt("withsubmission");
    await TestSubmission.create({
      assignmentId: sub.a._id, testId: test._id, userId: sub.s.user._id, isFinalized: true, mentorReviewed: true,
      reviewStatus: "Reviewed", totalScore: 1, maxScore: 5,
      responses: [{ questionId: test.questions[0]._id, selectedOption: "4", isCorrect: true, points: 1, autoGraded: true },
        { questionId: test.questions[1]._id, textAnswer: "print(input())", points: 0, passedCount: 0, totalHidden: 2, autoGraded: true }],
    });
    r = await api(`/test-submissions/assignment/${sub.A}`, { token: sub.s.token });
    check("Results page: 200, shown, no hidden cases", r.status === 200 && r.body?.showResults === true && leaks(r.body, HIDDEN).length === 0,
      { status: r.status, leaks: leaks(r.body, HIDDEN) });
    check("…score and per-question marks are there as before", r.body?.submission?.totalScore === 1 && (r.body?.test?.questions || []).some((q) => q.isCorrect === true));

    // ── 3. Not yet released ────────────────────────────────────────────────
    section("3. Window still open (not released)");
    const s3 = await makeUser("Student", "open", { mark: MARK });
    const a3 = await Assignment.create({
      testId: test._id, userId: s3.user._id, status: "Completed", startTime: new Date(Date.now() - 10 * MIN), duration: 60,
      deadline: new Date(Date.now() + 50 * MIN), startedAt: new Date(Date.now() - 10 * MIN), completedAt: new Date(),
    });
    bin.assignments.push(a3._id);
    r = await api(`/test-submissions/assignment/${a3._id}`, { token: s3.token });
    check("No hidden cases, before release either", r.status === 200 && leaks(r.body, HIDDEN).length === 0, leaks(r.body, HIDDEN));

    // ── 4. Reviewers are unaffected ────────────────────────────────────────
    section("4. Reviewers");
    r = await api(`/test-submissions/assignment/${bare.A}`, { token: admin.token });
    check("An admin still sees every hidden case", r.status === 200 && leaks(r.body, HIDDEN).length === HIDDEN.length, leaks(r.body, HIDDEN));

    // ── 5. Practice test holding a coding and a theory question ────────────
    section("5. A practice test that ended up holding non-MCQ questions");
    const practice = await Test.create({
      title: `ZZ Hidden practice ${MARK}`, type: "practice", status: "Active", timeLimit: 30, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "1+1?", options: [{ text: "2" }, { text: "3" }], answer: "2", points: 1 }],
    });
    bin.tests.push(practice._id);
    // The way it happens in practice: an update that skips the save hook.
    await Test.updateOne({ _id: practice._id }, { $push: { questions: { $each: [coding, { kind: "theory", text: "Why?", expectedAnswer: MODEL, points: 2 }] } } });
    const learner = await makeUser("Student", "practice", { mark: MARK });
    r = await api(`/practice-tests/${practice._id}`, { token: learner.token });
    check("Practice paper loads (200)", r.status === 200 && (r.body?.questions || []).length === 3, r.status);
    check("…with no hidden cases and no model answer", leaks(r.body, [...HIDDEN, MODEL]).length === 0, leaks(r.body, [...HIDDEN, MODEL]));
    check("…and no MCQ answer (as before)", (r.body?.questions || []).every((q) => q.answer === undefined));
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
