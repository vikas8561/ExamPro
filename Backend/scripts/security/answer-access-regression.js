/**
 * The other half of the audit: prove the security fixes did not break the
 * legitimate flows they tightened.
 */

// Runs against a local API and database only -- see scripts/lib/examHarness.js.
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const mongoose = require("mongoose");

const MARK = `reg-${Date.now()}`;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ""}`); }
};

const SECRET = ["answer", "answers", "expectedAnswer", "hiddenTestCases"];
const exposes = (payload) => {
  const hits = new Set();
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n)) {
      const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (SECRET.includes(k) && !empty) hits.add(k);
      walk(v);
    }
  };
  walk(payload);
  return [...hits];
};

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const Subject = require("../../models/Subject");

  const bin = { users: [], tests: [], assignments: [], subjects: [] };
  const mkUser = (name, role) => makeUser(role, name, { mark: MARK });

  try {
    const student = await mkUser("student", "Student");
    const admin = await mkUser("admin", "Admin");

    // A mentor only counts as a reviewer for a test they conduct, in a subject
    // they teach, for a student in their batch (routes/tests.js and
    // routes/testSubmissions.js). The mentor here authored this test in their
    // own subject, which is the case these checks are about; an unrelated
    // mentor is refused by design, and this used to fail with a 403 because
    // the fixture built exactly that.
    const subject = await Subject.create({ name: `ZZ Reg subject ${MARK}`, createdBy: admin.user._id });
    bin.subjects.push(subject._id);
    const mentor = await makeUser("Mentor", "mentor", { mark: MARK, subjects: [subject._id] });

    const test = await Test.create({
      title: `ZZ Reg ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
      subject: subject.name, status: "Active", createdBy: mentor.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "theory", text: "Explain.", expectedAnswer: "MODEL", points: 5 },
      ],
    });
    bin.tests.push(test._id);

    console.log("\n── Reviewers must still see everything ──\n");

    let r = await api(`/tests/${test._id}`, { token: admin.token });
    check("Admin still gets full question data", r.status === 200 && exposes(r.body).includes("answer"),
      `status ${r.status}, fields ${JSON.stringify(exposes(r.body))}`);

    r = await api(`/tests/${test._id}`, { token: mentor.token });
    check("Mentor still gets full question data", r.status === 200 && exposes(r.body).includes("answer"),
      `status ${r.status}, fields ${JSON.stringify(exposes(r.body))}`);

    console.log("\n── A finished attempt, after the deadline ──\n");

    // An attempt that is genuinely over: completed, deadline long past.
    const done = await Assignment.create({
      testId: test._id, userId: student.user._id, status: "Completed",
      startTime: new Date(Date.now() - 7200000), startedAt: new Date(Date.now() - 7200000),
      duration: 30, deadline: new Date(Date.now() - 3600000), mentorId: mentor.user._id,
    });
    bin.assignments.push(done._id);
    await TestSubmission.create({
      assignmentId: done._id, testId: test._id, userId: student.user._id,
      responses: [{ questionId: test.questions[0]._id, selectedOption: "4", isCorrect: true, points: 1 }],
      totalScore: 1, maxScore: 6, isFinalized: true, submittedAt: new Date(Date.now() - 3700000),
    });

    r = await api(`/test-submissions/assignment/${done._id}`, { token: student.token });
    check("Student CAN review their finished paper after the deadline",
      r.status === 200 && r.body?.showResults === true, `status ${r.status}, showResults ${r.body?.showResults}`);
    check("  ...and sees the correct answer in that review",
      exposes(r.body).includes("answer"), `fields ${JSON.stringify(exposes(r.body))}`);
    check("  ...but NOT the hidden test cases",
      !exposes(r.body).includes("hiddenTestCases"), `fields ${JSON.stringify(exposes(r.body))}`);

    r = await api(`/test-submissions/assignment/${done._id}`, { token: mentor.token });
    check("The assigned mentor can review it immediately", r.status === 200 && r.body?.showResults === true,
      `status ${r.status}, showResults ${r.body?.showResults}`);

    console.log("\n── An attempt still in progress ──\n");

    // assignments has a unique index on (testId, userId), so the in-progress
    // case needs its own test rather than a second assignment on the same one.
    const liveTest = await Test.create({
      title: `ZZ Reg Live ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
      status: "Active", createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "theory", text: "Explain.", expectedAnswer: "MODEL", points: 5 },
      ],
    });
    bin.tests.push(liveTest._id);

    const live = await Assignment.create({
      testId: liveTest._id, userId: student.user._id, status: "In Progress",
      startTime: new Date(Date.now() - 60000), startedAt: new Date(),
      duration: 120, mentorId: null,
    });
    bin.assignments.push(live._id);

    const started = await api("/proctor/session/start", {
      token: student.token, method: "POST",
      body: { assignmentId: String(live._id), testKind: "assigned" },
    });
    check("Proctoring still starts normally", started.status === 200 && !!started.body?.sessionId,
      `status ${started.status}`);

    r = await api(`/assignments/${live._id}`, { token: student.token });
    check("Student still receives the question paper during the exam",
      r.status === 200 && (r.body?.testId?.questions || []).length === 2,
      `status ${r.status}, ${r.body?.testId?.questions?.length} questions`);
    check("  ...with the options they need to answer",
      (r.body?.testId?.questions?.[0]?.options || []).length === 2,
      `${r.body?.testId?.questions?.[0]?.options?.length} options`);
    check("  ...and no answer fields", exposes(r.body).length === 0,
      `fields ${JSON.stringify(exposes(r.body))}`);

    r = await api(`/tests/${liveTest._id}`, { token: student.token });
    check("Student can still fetch the test body mid-exam",
      r.status === 200 && (r.body?.questions || []).length === 2, `status ${r.status}`);

    r = await api("/answers", {
      token: student.token, method: "POST",
      body: { assignmentId: String(live._id), questionId: String(liveTest.questions[0]._id), selectedOption: "4" },
    });
    check("Student can still save an answer", r.status === 200, `status ${r.status}`);
  } catch (err) {
    fail++;
    console.log("HARNESS ERROR:", err.stack);
  } finally {
    const Test = require("../../models/Test");
    const Assignment = require("../../models/Assignment");
    const TestSubmission = require("../../models/TestSubmission");
    const ProctorSession = require("../../models/ProctorSession");
    await TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } });
    await ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } });
    await Assignment.deleteMany({ _id: { $in: bin.assignments } });
    await Test.deleteMany({ _id: { $in: bin.tests } });
    await require("../../models/Subject").deleteMany({ _id: { $in: bin.subjects } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})();
