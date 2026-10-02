/**
 * Regression: nothing about how a student did reaches them before their window
 * closes -- not per-question right/wrong, not the answer key, not the score.
 *
 * A student who finished early used to learn it all at once: the hand-in reply
 * carried every question marked right or wrong plus the total, the autosave
 * read-back carried `isCorrect` and `points`, and the results list, the
 * assignment cards and the dashboard average showed the mark -- while classmates
 * in the same window were still sitting the paper.
 *
 * Results are released when the student's OWN window closes (Vikas's decision,
 * 2026-10-02): services/attemptWindow.areResultsReleased.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `release-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

/** Every key in a reply whose presence (with a value) would tell the student how they did. */
const MARK_KEYS = ["isCorrect", "points", "totalScore", "maxScore", "scorePercent", "autoScore", "score", "mentorScore", "correctAnswer", "answer", "finalScore", "finalMarks", "correctCount", "incorrectCount"];
function marksIn(payload) {
  const hits = new Set();
  const walk = (node, inQuestion) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inQuestion));
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const meaningful = !(value === null || value === undefined || value === false || value === 0 || value === "");
      // A question's own `points` (what it is worth) is fine to show; a
      // response's `points` (what it earned) is not. Questions are the objects
      // carrying `text`; responses are the ones carrying `questionId`.
      if (MARK_KEYS.includes(key) && meaningful && !(key === "points" && inQuestion)) hits.add(key);
      walk(value, typeof value === "object" && value !== null && "text" in value);
    }
  };
  walk(payload, false);
  return [...hits];
}

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
      title: `ZZ Release ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "mcq", text: "3+3?", options: [{ text: "5" }, { text: "6" }], answer: "6", points: 1 },
      ],
    });
    bin.tests.push(test._id);
    const q0 = String(test.questions[0]._id), q1 = String(test.questions[1]._id);

    const student = await makeUser("Student", "early", { mark: MARK });
    async function assign(minutesAgo, duration, forTest = test) {
      const startTime = new Date(Date.now() - minutesAgo * MIN);
      const a = await Assignment.create({
        testId: forTest._id, userId: student.user._id, status: "Assigned", startTime, duration,
        deadline: new Date(startTime.getTime() + duration * MIN),
      });
      bin.assignments.push(a._id);
      return a;
    }
    const sitAndHandIn = async (a, picks) => {
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: student.token, method: "POST", body: {} });
      await api("/proctor/session/start", { token: student.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      const saved = await api("/answers", { token: student.token, method: "POST", body: { assignmentId: A, questionId: q0, selectedOption: picks[0] } });
      const handed = await api("/test-submissions", {
        token: student.token, method: "POST",
        body: { assignmentId: A, timeSpent: 300, responses: [{ questionId: q0, selectedOption: picks[0] }, { questionId: q1, selectedOption: picks[1] }] },
      });
      return { A, saved, handed };
    };

    // ── 1. Finished early: the window is still open for everyone ───────────
    section("1. Handed in early (1 right, 1 wrong), 55 minutes of window left");
    const open = await assign(1, 60);
    const { A, saved, handed } = await sitAndHandIn(open, ["4", "5"]);

    check("Autosave reply is a bare acknowledgement", saved.status === 200 && JSON.stringify(Object.keys(saved.body || {})) === '["message"]', saved.body);
    check("Hand-in accepted (201)", handed.status === 201, handed.status);
    check("Hand-in reply carries no marks, score or per-question result", marksIn(handed.body).length === 0, marksIn(handed.body));
    check("…and no copy of the submission or its responses", handed.body?.submission === undefined && !JSON.stringify(handed.body).includes("responses"), Object.keys(handed.body || {}));
    check("…but says when results arrive (resultsReleased false, resultsAt = window end + 5s)",
      handed.body?.resultsReleased === false && Date.parse(handed.body?.resultsAt) === open.deadline.getTime() + 5000, handed.body);

    let r = await api(`/answers/assignment/${A}`, { token: student.token });
    check("Answer read-back: the student's own choices, no marks",
      r.status === 200 && r.body?.some((x) => x.selectedOption === "4") && marksIn(r.body).length === 0, { marks: marksIn(r.body) });

    r = await api("/test-submissions/student", { token: student.token });
    const listed = (r.body?.submissions || []).find((x) => String(x.assignmentId?._id || x.assignmentId) === A);
    check("Results list: the entry is there, marked not released, with no score or responses",
      listed && listed.resultsReleased === false && marksIn(listed).length === 0 && listed.responses === undefined, { listed });

    r = await api("/assignments/student?limit=50", { token: student.token });
    let card = (r.body?.assignments || []).find((x) => String(x._id) === A);
    check("Assignment card: Completed, no score", card?.status === "Completed" && card?.resultsReleased === false && marksIn(card).length === 0, { card: card && { status: card.status, marks: marksIn(card) } });
    check("Dashboard average: nothing released yet, so none", r.body?.stats?.averagePercent === null, r.body?.stats);

    r = await api(`/assignments/${A}`, { token: student.token });
    check("Single assignment: no score fields", r.status === 200 && marksIn({ ...r.body, testId: undefined }).length === 0, marksIn({ ...r.body, testId: undefined }));

    r = await api(`/test-submissions/assignment/${A}`, { token: student.token });
    check("Results page: not shown yet, and no marks or answer key anywhere in the reply",
      r.status === 200 && r.body?.showResults === false && marksIn(r.body).length === 0, { showResults: r.body?.showResults, marks: marksIn(r.body) });

    r = await api(`/test-submissions/assignment/${A}`, { token: admin.token });
    check("A reviewer sees the result straight away (1/2)", r.body?.showResults === true && r.body?.submission?.totalScore === 1, r.body?.submission?.totalScore);

    // ── 2. The boundary ────────────────────────────────────────────────────
    section("2. Two seconds after the window closes (inside the 5s buffer)");
    await Assignment.updateOne({ _id: open._id }, { $set: { deadline: new Date(Date.now() - 2000) } });
    r = await api("/test-submissions/student", { token: student.token });
    const atBoundary = (r.body?.submissions || []).find((x) => String(x.assignmentId?._id || x.assignmentId) === A);
    check("Still not released", atBoundary?.resultsReleased === false && atBoundary?.totalScore === null, atBoundary);

    // ── 3. Released ────────────────────────────────────────────────────────
    section("3. After the window closes");
    await Assignment.updateOne({ _id: open._id }, { $set: { deadline: new Date(Date.now() - 10 * 1000) } });
    r = await api("/test-submissions/student", { token: student.token });
    const released = (r.body?.submissions || []).find((x) => String(x.assignmentId?._id || x.assignmentId) === A);
    check("Results list: released, score 1 / 2", released?.resultsReleased === true && released?.totalScore === 1 && released?.maxScore === 2, released);
    check("…still without per-question responses (those live on the results page)", released?.responses === undefined);

    r = await api("/assignments/student?limit=50", { token: student.token });
    card = (r.body?.assignments || []).find((x) => String(x._id) === A);
    check("Assignment card: released, 50%", card?.resultsReleased === true && card?.scorePercent === 50 && card?.totalScore === 1, card && { scorePercent: card.scorePercent, totalScore: card.totalScore });
    check("Dashboard average: 50", r.body?.stats?.averagePercent === 50, r.body?.stats);

    r = await api(`/assignments/${A}`, { token: student.token });
    check("Single assignment: score shown (autoScore 1)", r.body?.autoScore === 1, r.body?.autoScore);

    r = await api(`/test-submissions/assignment/${A}`, { token: student.token });
    const shown = r.body?.test?.questions || [];
    check("Results page: shown, with each question marked and the answer key",
      r.body?.showResults === true && r.body?.submission?.totalScore === 1 &&
      shown.some((x) => x.isCorrect === true) && shown.every((x) => typeof x.answer === "string"), { showResults: r.body?.showResults, total: r.body?.submission?.totalScore });

    r = await api(`/answers/assignment/${A}`, { token: student.token });
    check("Answer read-back never carries marks, even after release", marksIn(r.body).length === 0, marksIn(r.body));

    // ── 4. The average only counts released results ────────────────────────
    section("4. One result released, another still in its window");
    // A second test: one assignment per student per test.
    const test2 = await Test.create({ ...test.toObject(), _id: undefined, title: `ZZ Release 2 ${MARK}`, createdAt: undefined, updatedAt: undefined });
    bin.tests.push(test2._id);
    const second = await assign(1, 60, test2);
    await sitAndHandIn(second, ["3", "5"]); // 0/2, window still open
    r = await api("/assignments/student?limit=50", { token: student.token });
    check("Dashboard average still 50 -- the unreleased 0% is not counted (it would make it 25)",
      r.body?.stats?.averagePercent === 50 && r.body?.stats?.gradedCount === 1, r.body?.stats);
    const secondCard = (r.body?.assignments || []).find((x) => String(x._id) === String(second._id));
    check("…and its card shows no score", secondCard?.resultsReleased === false && secondCard?.scorePercent === null, secondCard && { released: secondCard.resultsReleased, pct: secondCard.scorePercent });
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
