/**
 * Verification: "MCQ + Coding" (type "mixed") tests, end to end.
 *
 * Covers who may author one, what a mixed paper may contain, and a full sitting
 * the way TakeTest.jsx drives it: MCQ answers marked by option, coding answers
 * marked by Judge0 via /api/coding/submit, then the final submit and the
 * expired-attempt sweep.
 *
 * Needs the API running (EXAM_API, default http://localhost:4000/api), a
 * reachable Judge0 that runs Python, and MONGODB_URI pointing at the same
 * database as the API. It creates and deletes its own records.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { grantSession, revokeSessions } = require("../lib/testAuth");

const API = process.env.EXAM_API || "http://localhost:4000/api";
const MARK = `mixed-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log(`  PASS  ${l}`); };
const fail = (l, d) => { failed++; console.log(`  FAIL  ${l}\n        ${d}`); };
const check = (c, l, d) => (c ? pass(l) : fail(l, d));

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const SUM_OK = "a, b = map(int, input().split())\nprint(a + b)";
// Right for positive inputs only, so it passes exactly one of the two hidden cases.
const SUM_PARTIAL = "a, b = map(int, input().split())\nprint(abs(a) + abs(b))";

// Options go over the wire as { text } objects, as CreateTest.jsx sends them.
const mcq = (text, options, answer, points) => ({ kind: "mcq", text, options: options.map((o) => ({ text: o })), answer, points });
const PAPER = () => [
  mcq("binary search complexity", ["O(n)", "O(log n)"], "O(log n)", 2),
  mcq("LIFO structure", ["Queue", "Stack"], "Stack", 1),
  mcq("left blank", ["x", "y"], "x", 1),
  {
    kind: "coding", text: "sum two numbers", points: 5, language: "python",
    visibleTestCases: [{ input: "1 2", output: "3" }],
    // Per-case `marks` are deliberately uneven: services/grading.js ignores them
    // and splits `points` evenly, which section 2 pins down.
    hiddenTestCases: [{ input: "40 2", output: "42", marks: 2 }, { input: "-4 1", output: "-3", marks: 3 }],
  },
  {
    kind: "coding", text: "never submitted to the judge", points: 4, language: "python",
    visibleTestCases: [{ input: "1", output: "1" }],
    hiddenTestCases: [{ input: "7", output: "7", marks: 4 }],
  },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../../models/User");
  const Mentor = require("../../models/Mentor");
  const Subject = require("../../models/Subject");
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const { finalizeAttempt } = require("../../services/expiredAttempts");
  const bin = { users: [], mentors: [], subjects: [], tests: [], assignments: [] };

  const sign = async (principal, role) => {
    const token = jwt.sign({ userId: principal._id, email: principal.email, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await grantSession({ _id: principal._id, role }, token);
    return token;
  };

  let seq = 0;
  const mkStudent = async () => {
    const u = await new User({ name: `ZZ s${seq} ${MARK}`, email: `${MARK}-s${seq++}@verify.invalid`, password: "x", role: "Student" }).save();
    bin.users.push(u._id);
    return { user: u, token: await sign(u, "Student") };
  };
  const adminId = new mongoose.Types.ObjectId();
  const adminToken = await sign({ _id: adminId, email: `${MARK}-admin@verify.invalid` }, "Admin");
  bin.users.push(adminId);

  const subject = async (name) => {
    const s = await Subject.create({ name: `${name} ${MARK}`, createdBy: adminId });
    bin.subjects.push(s._id);
    return s;
  };
  const mkMentor = async (subjects) => {
    const m = await Mentor.create({ name: `ZZ mentor ${MARK}`, email: `${MARK}-m${seq++}@verify.invalid`, password: "x", subjects: subjects.map((s) => s._id) });
    bin.mentors.push(m._id);
    return { mentor: m, token: await sign(m, "Mentor") };
  };

  const createTest = (token, extra) => api("/tests", {
    token, method: "POST",
    body: { title: `ZZ ${MARK} ${seq++}`, type: "mixed", timeLimit: 60, allowedTabSwitches: 100, questions: PAPER(), ...extra },
  });
  const track = (r) => { if (r.body?._id) bin.tests.push(r.body._id); return r; };

  /** Assign a stored test to a fresh student, open proctoring, start it. */
  const sitDown = async (testId) => {
    const s = await mkStudent();
    const a = await Assignment.create({
      testId, userId: s.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 240, mentorId: null,
    });
    bin.assignments.push(a._id);
    await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: String(a._id), testKind: "assigned" } });
    const started = await api(`/assignments/${a._id}/start`, { token: s.token, method: "POST" });
    return { s, a, started, served: started.body?.test?.questions || [] };
  };
  const stored = (a) => TestSubmission.findOne({ assignmentId: a._id }).lean();
  const byText = (list, text) => list.find((q) => q.text === text);

  try {
    const dsa = await subject("DSA");
    const interview = await subject("Interview Preparation");
    const web = await subject("Web Development");

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 1. Authoring rules ════\n");
    {
      const r = track(await createTest(adminToken, { subject: web.name }));
      check(r.status === 201 && r.body?.type === "mixed", "admin creates an MCQ + Coding test", `${r.status}: ${JSON.stringify(r.body?.message)}`);
      check(r.body?.questions?.map((q) => q.kind).join() === "mcq,mcq,mcq,coding,coding", "both kinds are stored, in order", JSON.stringify(r.body?.questions?.map((q) => q.kind)));

      const withTheory = await createTest(adminToken, { questions: [...PAPER(), { kind: "theory", text: "essay", points: 5 }] });
      track(withTheory);
      check(withTheory.status === 400, "a theory question is rejected on a mixed test", `${withTheory.status}: ${JSON.stringify(withTheory.body?.message)}`);

      const dsaMentor = await mkMentor([dsa]);
      const r1 = track(await createTest(dsaMentor.token, { subject: dsa.name }));
      check(r1.status === 201, "a DSA mentor can create one", `${r1.status}: ${JSON.stringify(r1.body?.message)}`);

      const ipMentor = await mkMentor([interview]);
      const r2 = track(await createTest(ipMentor.token, { subject: interview.name }));
      check(r2.status === 201, "an Interview Preparation mentor can create one", `${r2.status}: ${JSON.stringify(r2.body?.message)}`);
      const r2c = track(await createTest(ipMentor.token, { subject: interview.name, type: "coding", questions: [PAPER()[3]] }));
      check(r2c.status === 201, "...and a Coding Only test too", `${r2c.status}: ${JSON.stringify(r2c.body?.message)}`);

      const webMentor = await mkMentor([web]);
      const r3 = track(await createTest(webMentor.token, { subject: web.name }));
      check(r3.status === 403, "a Web Development mentor cannot create one", `${r3.status}: ${JSON.stringify(r3.body?.message)}`);
      const r3c = track(await createTest(webMentor.token, { subject: web.name, type: "coding", questions: [PAPER()[3]] }));
      check(r3c.status === 403, "...or a Coding Only test", `${r3c.status}: ${JSON.stringify(r3c.body?.message)}`);
      const r3m = track(await createTest(webMentor.token, { subject: web.name, type: "mcq", questions: PAPER().slice(0, 2) }));
      check(r3m.status === 201, "...and can still create an MCQ test", `${r3m.status}: ${JSON.stringify(r3m.body?.message)}`);

      // Editing
      const id = r1.body._id;
      const full = await api(`/tests/${id}`, { token: dsaMentor.token });
      const kept = full.body.questions.map((q) => ({ ...q, options: q.options }));
      const addTheory = await api(`/tests/${id}`, {
        token: dsaMentor.token, method: "PUT",
        body: { questions: [...kept, { kind: "theory", text: "essay", points: 5 }] },
      });
      check(addTheory.status === 400, "an edit that adds a theory question is rejected (type not resent)", `${addTheory.status}: ${JSON.stringify(addTheory.body?.message)}`);
      const edit = await api(`/tests/${id}`, {
        token: dsaMentor.token, method: "PUT",
        body: { type: "mixed", title: "ZZ edited", questions: kept },
      });
      const sameIds = edit.body?.questions?.map((q) => String(q._id)).join() === full.body.questions.map((q) => String(q._id)).join();
      check(edit.status === 200 && sameIds, "a plain edit succeeds and keeps every question id", `${edit.status}: ${JSON.stringify(edit.body?.message)}`);

      const flip = await api(`/tests/${r3m.body._id}`, { token: webMentor.token, method: "PUT", body: { type: "mixed" } });
      check(flip.status === 403, "a Web Development mentor cannot switch their test to mixed", `${flip.status}: ${JSON.stringify(flip.body?.message)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. A full sitting, the way TakeTest.jsx drives it ════\n");
    {
      const created = track(await createTest(adminToken, { subject: dsa.name }));
      const { s, a, started, served } = await sitDown(created.body._id);
      check(started.status === 200 && served.length === 5, "the paper is served with all five questions", `${started.status}, ${served.length} questions: ${JSON.stringify(started.body?.message)}`);

      const leaks = served.filter((q) => q.answer || q.hiddenTestCases?.length || q.expectedAnswer);
      check(leaks.length === 0, "no answers or hidden test cases reach the student", JSON.stringify(leaks));
      check(served.filter((q) => q.kind === "coding").every((q) => q.visibleTestCases?.length === 1), "coding questions still show their visible cases", "missing visible cases");

      const bs = byText(served, "binary search complexity");
      const lifo = byText(served, "LIFO structure");
      const sum = byText(served, "sum two numbers");
      const unsubmitted = byText(served, "never submitted to the judge");

      // Autosave as the student works: an MCQ pick and a coding draft.
      const save1 = await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(bs._id), selectedOption: "O(log n)", textAnswer: null } });
      const save2 = await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(unsubmitted._id), selectedOption: null, textAnswer: "print(input())", language: "python" } });
      check(save1.status < 300 && save2.status < 300, "autosave accepts both an MCQ pick and a coding draft", `${save1.status} / ${save2.status}`);

      // Judge0: first a partial attempt, then a full one -- best wins.
      const judge = (code) => api("/coding/submit", {
        token: s.token, method: "POST",
        body: { assignmentId: String(a._id), testId: created.body._id, questionId: String(sum._id), sourceCode: code, language: "python" },
      });
      const partial = await judge(SUM_PARTIAL);
      check(partial.status === 200, "Judge0 grades a coding answer on a mixed test", `${partial.status}: ${JSON.stringify(partial.body?.message || partial.body)}`);
      let sub = await stored(a);
      let sumRow = sub?.responses?.find((r) => String(r.questionId) === String(sum._id));
      check(sumRow?.autoGraded && sumRow?.points === 2.5, "1 of 2 hidden cases passed: half of the 5 points (2.5)", JSON.stringify({ points: sumRow?.points, autoGraded: sumRow?.autoGraded }));

      const full = await judge(SUM_OK);
      sub = await stored(a);
      sumRow = sub?.responses?.find((r) => String(r.questionId) === String(sum._id));
      check(full.status === 200 && sumRow?.points === 5 && sumRow?.isCorrect, "a correct answer earns all 5", JSON.stringify({ status: full.status, points: sumRow?.points, isCorrect: sumRow?.isCorrect }));

      // Typing on after grading must not cost the mark.
      await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(sum._id), selectedOption: null, textAnswer: "# still tinkering", language: "python" } });
      sub = await stored(a);
      sumRow = sub?.responses?.find((r) => String(r.questionId) === String(sum._id));
      check(sumRow?.points === 5 && sumRow?.textAnswer === SUM_OK, "autosave after grading keeps the Judge0 mark and graded source", JSON.stringify({ points: sumRow?.points, textAnswer: sumRow?.textAnswer }));

      // Final submit, exactly TakeTest's payload: option text for MCQ, textAnswer
      // for coding, and no language field at all.
      const answers = {
        [bs._id]: { selectedOption: "O(log n)" },
        [lifo._id]: { selectedOption: "Queue" },
        [sum._id]: { textAnswer: "# still tinkering" },
        [unsubmitted._id]: { textAnswer: "print(input())" },
      };
      const r = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id),
          responses: served.map((q) => ({ questionId: String(q._id), selectedOption: undefined, textAnswer: undefined, ...answers[q._id] })),
          timeSpent: 120,
        },
      });
      check(r.status === 201, "final submit accepted", `${r.status}: ${JSON.stringify(r.body?.message)}`);
      sub = await stored(a);
      const row = (q) => sub.responses.find((x) => String(x.questionId) === String(q._id));
      const blank = byText(served, "left blank");

      check(row(bs).points === 2 && row(bs).isCorrect, "correct MCQ: +2", JSON.stringify(row(bs)));
      check(row(lifo).points === 0 && !row(lifo).isCorrect, "wrong MCQ with no negative marking: 0", JSON.stringify(row(lifo)));
      check(row(blank).points === 0, "blank MCQ: 0", JSON.stringify(row(blank)));
      check(row(sum).points === 5 && row(sum).autoGraded, "coding keeps its Judge0 mark (5)", JSON.stringify(row(sum)));
      check(row(sum).language === "python", "coding keeps its language though TakeTest sends none", `${row(sum).language}`);
      check(row(unsubmitted).points === 0 && row(unsubmitted).textAnswer === "print(input())", "coding never judged: 0, code kept for the mentor", JSON.stringify(row(unsubmitted)));
      // Every question is worth its `points`: MCQ 2+1+1 = 4, coding 5+4 = 9.
      check(sub.totalScore === 7 && sub.maxScore === 13, "total 7 / 13 (2 MCQ + 5 coding, out of 4 MCQ + 9 coding points)", `${sub.totalScore}/${sub.maxScore}`);

      const asg = await Assignment.findById(a._id).lean();
      check(asg.status === "Completed" && asg.autoScore === 7, "assignment is Completed with the same score", `${asg.status}, ${asg.autoScore}`);

      const review = await api(`/test-submissions/assignment/${a._id}`, { token: adminToken });
      check(review.status === 200, "the admin can open the submission for review", `${review.status}: ${JSON.stringify(review.body?.message)}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. Negative marking applies to MCQs only ════\n");
    {
      const created = track(await createTest(adminToken, { subject: dsa.name, negativeMarkingPercent: 0.25 }));
      const { s, a, served } = await sitDown(created.body._id);
      const sum = byText(served, "sum two numbers");
      await api("/coding/submit", {
        token: s.token, method: "POST",
        body: { assignmentId: String(a._id), testId: created.body._id, questionId: String(sum._id), sourceCode: "print('nope')", language: "python" },
      });
      const picks = { "binary search complexity": "O(n)", "LIFO structure": "Stack" };
      await api("/test-submissions", {
        token: s.token, method: "POST",
        body: { assignmentId: String(a._id), timeSpent: 60, responses: served.map((q) => ({ questionId: String(q._id), selectedOption: picks[q.text], textAnswer: q.text === "sum two numbers" ? "print('nope')" : undefined })) },
      });
      const sub = await stored(a);
      const row = (text) => sub.responses.find((x) => String(x.questionId) === String(byText(served, text)._id));
      check(row("binary search complexity").points === -0.5, "wrong 2-mark MCQ at 25%: -0.5", `${row("binary search complexity").points}`);
      check(row("LIFO structure").points === 1, "right 1-mark MCQ: +1", `${row("LIFO structure").points}`);
      check(row("left blank").points === 0, "blank MCQ is never penalised", `${row("left blank").points}`);
      check(row("sum two numbers").points === 0, "failed coding answer: 0, never negative", `${row("sum two numbers").points}`);
      check(sub.totalScore === 0.5, "total 0.5", `${sub.totalScore}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. An abandoned mixed attempt, finalised by the sweep ════\n");
    {
      const created = track(await createTest(adminToken, { subject: dsa.name }));
      const { s, a, served } = await sitDown(created.body._id);
      const bs = byText(served, "binary search complexity");
      const sum = byText(served, "sum two numbers");
      await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(bs._id), selectedOption: "O(log n)", textAnswer: null } });
      await api("/coding/submit", {
        token: s.token, method: "POST",
        body: { assignmentId: String(a._id), testId: created.body._id, questionId: String(sum._id), sourceCode: SUM_PARTIAL, language: "python" },
      });
      const test = await Test.findById(created.body._id);
      const assignment = await Assignment.findById(a._id);
      await finalizeAttempt(assignment, test);
      const sub = await stored(a);
      const asg = await Assignment.findById(a._id).lean();
      check(asg.status === "Completed", "the sweep completes the attempt", asg.status);
      check(sub?.totalScore === 4.5 && sub?.maxScore === 13, "autosaved MCQ (2) and Judge0 partial (2.5) both count: 4.5 / 13", `${sub?.totalScore}/${sub?.maxScore}`);
    }
  } catch (e) {
    fail("script crashed", e.stack || String(e));
  } finally {
    await Promise.all([
      User.deleteMany({ _id: { $in: bin.users } }), Mentor.deleteMany({ _id: { $in: bin.mentors } }),
      Subject.deleteMany({ _id: { $in: bin.subjects } }), Test.deleteMany({ _id: { $in: bin.tests } }),
      Assignment.deleteMany({ _id: { $in: bin.assignments } }),
      TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } }),
      ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } }),
      revokeSessions([...bin.users, ...bin.mentors]),
    ]);
    await mongoose.disconnect();
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
