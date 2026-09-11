/**
 * Verification: per-student question shuffling, and the marking that has to
 * survive it.
 *
 * The feature reorders the questions on their way out to each student. The one
 * thing that must never change is the score, so the centrepiece of this script
 * is case 5: two students sitting the same shuffled exam, served the questions
 * in demonstrably different orders, submitting the same answers keyed by
 * question id -- and getting identical marks.
 *
 * Needs the API running on :4000 and MONGODB_URI set, like the security audit.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const API = "http://localhost:4000/api";
const MARK = `shuf-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (label) => { passed++; console.log(`  PASS  ${label}`); };
const fail = (label, detail) => { failed++; console.log(`  FAIL  ${label}\n        ${detail}`); };
const check = (cond, label, detail) => (cond ? pass(label) : fail(label, detail));

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const idsOf = (questions) => (questions || []).map((q) => String(q._id));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../../models/User");
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { users: [], tests: [], assignments: [] };

  const mkUser = async (name) => {
    const u = new User({
      name: `ZZ ${name} ${MARK}`, email: `${MARK}-${name}@verify.invalid`,
      password: "x", role: "Student",
    });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    u.activeSessions = [token];
    await u.save();
    bin.users.push(u._id);
    return { user: u, token };
  };

  // Ten MCQs, so that two independent shuffles colliding by chance is a 1-in-10!
  // event rather than a coin toss -- this script must not be flaky.
  const mcqQuestions = Array.from({ length: 10 }, (_, i) => ({
    kind: "mcq",
    text: `Q${i + 1}: which letter is "${String.fromCharCode(65 + i)}"?`,
    options: [{ text: `right-${i}` }, { text: `wrong-${i}` }],
    answer: `right-${i}`,
    points: 2,
  }));

  const mkTest = async (title, { shuffleQuestions, negativeMarkingPercent = 0, questions = mcqQuestions, owner }) => {
    const t = await Test.create({
      title: `ZZ ${title} ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
      status: "Active", createdBy: owner, shuffleQuestions, negativeMarkingPercent,
      questions,
    });
    bin.tests.push(t._id);
    return t;
  };

  const mkAssignment = async (testId, userId) => {
    const a = await Assignment.create({
      testId, userId, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 120, mentorId: null,
    });
    bin.assignments.push(a._id);
    return a;
  };

  /** Start proctoring then the exam, and hand back the paper as served. */
  const sitDown = async (assignment, student) => {
    await api("/proctor/session/start", {
      token: student.token, method: "POST",
      body: { assignmentId: String(assignment._id), testKind: "assigned" },
    });
    const r = await api(`/assignments/${assignment._id}/start`, { token: student.token, method: "POST" });
    return r.body?.test?.questions || [];
  };

  try {
    const alice = await mkUser("alice");
    const bob = await mkUser("bob");

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 1. Shuffling off: order is exactly canonical ════\n");

    const plainTest = await mkTest("plain", { shuffleQuestions: false, owner: alice.user._id });
    const plainAssignment = await mkAssignment(plainTest._id, alice.user._id);
    const plainPaper = await sitDown(plainAssignment, alice);

    check(
      JSON.stringify(idsOf(plainPaper)) === JSON.stringify(idsOf(plainTest.questions)),
      "shuffleQuestions:false serves the canonical order",
      `got ${JSON.stringify(idsOf(plainPaper))}`
    );

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. Shuffling on: different students, different orders ════\n");

    const shuffled = await mkTest("shuffled", {
      shuffleQuestions: true, owner: alice.user._id, negativeMarkingPercent: 0.5,
    });
    const aliceAssignment = await mkAssignment(shuffled._id, alice.user._id);
    const bobAssignment = await mkAssignment(shuffled._id, bob.user._id);

    const alicePaper = await sitDown(aliceAssignment, alice);
    const bobPaper = await sitDown(bobAssignment, bob);

    const aliceIds = idsOf(alicePaper);
    const bobIds = idsOf(bobPaper);
    const canonicalIds = idsOf(shuffled.questions);

    check(aliceIds.length === canonicalIds.length && bobIds.length === canonicalIds.length,
      "both students get the full paper -- no question dropped or duplicated",
      `alice ${aliceIds.length}, bob ${bobIds.length}, expected ${canonicalIds.length}`);

    check(new Set(aliceIds).size === aliceIds.length && new Set(bobIds).size === bobIds.length,
      "no question appears twice",
      `alice unique ${new Set(aliceIds).size}, bob unique ${new Set(bobIds).size}`);

    check(JSON.stringify([...aliceIds].sort()) === JSON.stringify([...canonicalIds].sort()) &&
          JSON.stringify([...bobIds].sort()) === JSON.stringify([...canonicalIds].sort()),
      "both students get the same SET of questions",
      "the served ids do not match the test's ids");

    check(JSON.stringify(aliceIds) !== JSON.stringify(bobIds),
      "the two students are served different orders",
      `both got ${JSON.stringify(aliceIds)}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. The order is stable -- a refresh must not reshuffle ════\n");

    const aliceRestart = await sitDown(aliceAssignment, alice);
    check(JSON.stringify(idsOf(aliceRestart)) === JSON.stringify(aliceIds),
      "POST /start again returns the identical order",
      `was ${JSON.stringify(aliceIds)}\n        now ${JSON.stringify(idsOf(aliceRestart))}`);

    const aliceReload = await api(`/assignments/${aliceAssignment._id}`, { token: alice.token });
    check(JSON.stringify(idsOf(aliceReload.body?.testId?.questions)) === JSON.stringify(aliceIds),
      "GET /assignments/:id (the resume path) returns the identical order",
      `now ${JSON.stringify(idsOf(aliceReload.body?.testId?.questions))}`);

    const aliceViaTest = await api(`/tests/${shuffled._id}`, { token: alice.token });
    check(JSON.stringify(idsOf(aliceViaTest.body?.questions)) === JSON.stringify(aliceIds),
      "GET /tests/:id (the coding-exam path) returns the identical order",
      `now ${JSON.stringify(idsOf(aliceViaTest.body?.questions))}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. The permutation is not handed to the student ════\n");

    check(aliceReload.body?.questionOrder === undefined,
      "GET /assignments/:id does not return questionOrder to a student",
      `got ${JSON.stringify(aliceReload.body?.questionOrder)}`);

    const stored = await Assignment.findById(aliceAssignment._id).select("questionOrder").lean();
    check(JSON.stringify((stored.questionOrder || []).map(String)) === JSON.stringify(aliceIds),
      "the order IS persisted server-side, matching what was served",
      `stored ${JSON.stringify((stored.questionOrder || []).map(String))}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 5. MARKING: same answers, different orders, same score ════\n");

    // Answer questions 0,1,2 right and 3,4 wrong -- by question id, which is how
    // the real client submits. With negative marking at 50% on 2-point questions:
    //   3 correct x 2 = 6,  2 wrong x -1 = -2,  total 4 out of a max of 20.
    const answerFor = (questionId) => {
      const q = shuffled.questions.id(questionId);
      const index = shuffled.questions.findIndex((x) => String(x._id) === String(questionId));
      if (index > 4) return { questionId: String(questionId), selectedOption: null, textAnswer: null };
      return {
        questionId: String(questionId),
        selectedOption: index <= 2 ? q.answer : q.options[1].text,
        textAnswer: null,
      };
    };

    // Each student submits in the order THEY saw, which is the realistic case:
    // the client maps over its own (shuffled) question array.
    const submit = async (assignment, student, servedIds) => {
      const r = await api("/test-submissions", {
        token: student.token, method: "POST",
        body: {
          assignmentId: String(assignment._id),
          responses: servedIds.map(answerFor),
          timeSpent: 60,
        },
      });
      return r;
    };

    const aliceResult = await submit(aliceAssignment, alice, aliceIds);
    const bobResult = await submit(bobAssignment, bob, bobIds);

    const score = (r) => r.body?.submission || r.body || {};
    const a = score(aliceResult), b = score(bobResult);

    check(aliceResult.status === 201 || aliceResult.status === 200,
      "alice's submission was accepted", `status ${aliceResult.status}: ${JSON.stringify(aliceResult.body)}`);

    // The submission stores totalScore/maxScore but no counts, so tally the
    // marked responses rather than assert on fields that do not exist.
    const tally = (submission) => {
      const responses = submission?.responses || [];
      const answered = responses.filter((x) => x.selectedOption !== null && x.selectedOption !== undefined);
      return {
        correct: answered.filter((x) => x.isCorrect).length,
        incorrect: answered.filter((x) => !x.isCorrect).length,
        blank: responses.length - answered.length,
        awarded: responses.reduce((sum, x) => sum + (x.points || 0), 0),
      };
    };
    const ta = tally(a), tb = tally(b);

    for (const field of ["totalScore", "maxScore"]) {
      check(a[field] === b[field],
        `${field} is identical for both students despite different orders`,
        `alice ${JSON.stringify(a[field])} vs bob ${JSON.stringify(b[field])}`);
    }
    for (const field of ["correct", "incorrect", "blank", "awarded"]) {
      check(ta[field] === tb[field],
        `${field} count is identical for both students despite different orders`,
        `alice ${ta[field]} vs bob ${tb[field]}`);
    }

    // 3 correct x 2 = 6; 2 wrong x -(2 x 0.5) = -2; 5 unanswered = 0. Max 10 x 2 = 20.
    check(a.totalScore === 4 && a.maxScore === 20,
      "the score is arithmetically right, negative marking included (6 - 2 = 4, max 20)",
      `got totalScore=${a.totalScore}, maxScore=${a.maxScore}`);
    check(ta.correct === 3 && ta.incorrect === 2 && ta.blank === 5,
      "3 correct, 2 incorrect and 5 unanswered were marked as such",
      `got ${JSON.stringify(ta)}`);
    check(ta.awarded === a.totalScore,
      "the per-question marks sum to the stored total",
      `responses sum to ${ta.awarded} but totalScore is ${a.totalScore}`);

    // Every stored response must sit against the right question, whichever
    // order it was answered in.
    const aliceSub = await TestSubmission.findOne({ assignmentId: aliceAssignment._id }).lean();
    const misfiled = (aliceSub?.responses || []).filter((resp) => {
      const q = shuffled.questions.id(resp.questionId);
      if (!q) return true;
      if (resp.selectedOption === null || resp.selectedOption === undefined) return false;
      return resp.isCorrect !== (resp.selectedOption === q.answer);
    });
    check(misfiled.length === 0,
      "every stored response is filed against the question it actually answers",
      `${misfiled.length} misfiled: ${JSON.stringify(misfiled.slice(0, 2))}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 6. Mixed paper: theory and coding still mark as before ════\n");

    const mixed = await mkTest("mixed", {
      shuffleQuestions: true, owner: alice.user._id,
      questions: [
        ...mcqQuestions.slice(0, 3),
        { kind: "theory", text: "Explain recursion.", expectedAnswer: "MODEL", points: 5 },
        {
          kind: "coding", text: "Sum two numbers.", points: 5, language: "python",
          visibleTestCases: [{ input: "1 2", output: "3" }],
          hiddenTestCases: [{ input: "40 2", output: "42", marks: 7 }],
        },
      ],
    });
    const mixedAssignment = await mkAssignment(mixed._id, bob.user._id);
    const mixedPaper = await sitDown(mixedAssignment, bob);

    check(mixedPaper.length === 5, "the mixed paper is served whole", `got ${mixedPaper.length}`);
    check(mixedPaper.every((q) => q.answer === undefined && q.expectedAnswer === undefined && q.hiddenTestCases === undefined),
      "the shuffled paper still carries no answers, model answers or hidden test cases",
      "a secret field survived sanitisation");

    const mixedIds = idsOf(mixedPaper);
    const mixedSubmit = await api("/test-submissions", {
      token: bob.token, method: "POST",
      body: {
        assignmentId: String(mixedAssignment._id),
        responses: mixedIds.map((id) => {
          const q = mixed.questions.id(id);
          if (q.kind === "mcq") return { questionId: id, selectedOption: q.answer, textAnswer: null };
          return { questionId: id, selectedOption: null, textAnswer: "some work", language: "python" };
        }),
        timeSpent: 60,
      },
    });
    const m = mixedSubmit.body?.submission || mixedSubmit.body || {};

    // 3 MCQs x 2 points = 6, theory 5, coding scored from its hidden marks (7).
    check(m.maxScore === 18, "maxScore uses hidden-test-case marks for coding (6 + 5 + 7)", `got ${m.maxScore}`);
    check(m.totalScore === 6, "only the MCQs auto-score; theory and coding await the mentor", `got ${m.totalScore}`);

    const mixedStored = await TestSubmission.findOne({ assignmentId: mixedAssignment._id }).lean();
    const theoryId = String(mixed.questions.find((q) => q.kind === "theory")._id);
    const theoryResp = (mixedStored?.responses || []).find((r) => String(r.questionId) === theoryId);
    check(theoryResp && theoryResp.points === 0 && theoryResp.textAnswer === "some work",
      "the theory answer is stored against the theory question, unscored",
      `got ${JSON.stringify(theoryResp)}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 7. Results merge correctly after a shuffled sitting ════\n");

    const results = await api(`/test-submissions/assignment/${mixedAssignment._id}`, { token: bob.token });
    const merged = results.body?.questions || results.body?.test?.questions || [];
    const mismatched = merged.filter((q) => {
      if (q.kind !== "mcq") return false;
      const canonical = mixed.questions.id(q._id);
      return canonical && q.selectedOption && q.selectedOption !== canonical.answer;
    });
    check(merged.length > 0 && mismatched.length === 0,
      "each result row carries the answer that belongs to its own question",
      `${merged.length} rows, ${mismatched.length} mismatched`);

  } catch (error) {
    fail("script crashed", error.stack || String(error));
  } finally {
    await Promise.all([
      mongoose.model("User").deleteMany({ _id: { $in: bin.users } }),
      mongoose.model("Test").deleteMany({ _id: { $in: bin.tests } }),
      mongoose.model("Assignment").deleteMany({ _id: { $in: bin.assignments } }),
      mongoose.model("TestSubmission").deleteMany({ assignmentId: { $in: bin.assignments } }),
      mongoose.model("ProctorSession").deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await mongoose.disconnect();
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
