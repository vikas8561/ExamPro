/**
 * Verification: editing a test must not throw away its students' answers.
 *
 * Student responses are matched to questions by `_id` and nothing else. The
 * admin edit form used to drop `_id`, so every save minted brand new question
 * ids and orphaned every answer ever given to that test -- finished papers
 * rendered as "Not answered" throughout, and the re-grade that runs after an
 * edit matched nothing.
 *
 * The property that matters is a fixed point: an edit that does not touch the
 * marking must leave every score and every answer exactly as it found them.
 * An edit that DOES change an answer key must re-grade correctly.
 *
 * Needs the API running on :4000 and MONGODB_URI set, like the other scripts.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { grantSession, revokeSessions } = require("../lib/testAuth");

const API = "http://localhost:4000/api";
const MARK = `edit-${Date.now()}`;

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

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../../models/User");
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { users: [], tests: [], assignments: [] };

  const mkUser = async (name, role) => {
    const u = new User({
      name: `ZZ ${name} ${MARK}`, email: `${MARK}-${name}@verify.invalid`,
      password: "x", role,
    });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await grantSession(u, token);
    bin.users.push(u._id);
    return { user: u, token };
  };

  const questionIds = async (testId) =>
    (await Test.findById(testId).select("questions").lean()).questions.map((q) => String(q._id));

  /** The questions as the fixed edit form would send them back: `_id` included. */
  const asEditPayload = (test) => test.questions.map((q) => ({
    _id: String(q._id),
    kind: q.kind,
    text: q.text,
    points: q.points,
    ...(q.kind === "mcq" ? { options: q.options.map((o) => ({ text: o.text })), answer: q.answer } : {}),
    ...(q.kind === "theory" ? { expectedAnswer: q.expectedAnswer || "" } : {}),
  }));

  try {
    const admin = await mkUser("admin", "Admin");
    const student = await mkUser("student", "Student");

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ Setup: a student sits and submits a real paper ════\n");

    const created = await api("/tests", {
      token: admin.token, method: "POST",
      body: {
        title: `ZZ Edit ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
        negativeMarkingPercent: 0.5,
        questions: [
          { kind: "mcq", text: "answered right", options: [{ text: "right-0" }, { text: "wrong-0" }], answer: "right-0", points: 2 },
          { kind: "mcq", text: "answered wrong", options: [{ text: "right-1" }, { text: "wrong-1" }], answer: "right-1", points: 2 },
          { kind: "mcq", text: "left blank", options: [{ text: "right-2" }, { text: "wrong-2" }], answer: "right-2", points: 2 },
          { kind: "theory", text: "explain recursion", expectedAnswer: "MODEL", points: 5 },
        ],
      },
    });
    const testId = created.body._id;
    bin.tests.push(testId);
    await Test.updateOne({ _id: testId }, { $set: { status: "Active" } });

    let test = await Test.findById(testId);
    const originalIds = await questionIds(testId);

    const assignment = await Assignment.create({
      testId, userId: student.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 120, mentorId: null,
    });
    bin.assignments.push(assignment._id);

    await api("/proctor/session/start", {
      token: student.token, method: "POST",
      body: { assignmentId: String(assignment._id), testKind: "assigned" },
    });
    await api(`/assignments/${assignment._id}/start`, { token: student.token, method: "POST" });

    const q = test.questions;
    const submitted = await api("/test-submissions", {
      token: student.token, method: "POST",
      body: {
        assignmentId: String(assignment._id),
        responses: [
          { questionId: String(q[0]._id), selectedOption: "right-0", textAnswer: null },
          { questionId: String(q[1]._id), selectedOption: "wrong-1", textAnswer: null },
          { questionId: String(q[2]._id), selectedOption: null, textAnswer: null },
          { questionId: String(q[3]._id), selectedOption: null, textAnswer: "my essay" },
        ],
        timeSpent: 60,
      },
    });

    const readScore = async () => {
      const s = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
      return {
        totalScore: s.totalScore, maxScore: s.maxScore,
        points: s.responses.map((r) => r.points),
        answers: s.responses.map((r) => r.selectedOption ?? r.textAnswer),
        orphans: s.responses.filter((r) => !test.questions.id(r.questionId)).length,
      };
    };

    const before = await readScore();
    // right +2, wrong -(2 x 0.5) = -1, blank 0, theory 0 pending. Max 2+2+2+5.
    check(submitted.status === 201, "the paper was submitted", `status ${submitted.status}`);
    check(before.totalScore === 1 && before.maxScore === 11,
      "baseline score is 1 out of 11 (+2, -1, blank 0, theory pending)",
      `got ${before.totalScore}/${before.maxScore}, points ${before.points}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 1. An edit that changes no marking changes no marks ════\n");

    const edited = asEditPayload(test);
    edited[0].text = "answered right (reworded)";
    let put = await api(`/tests/${testId}`, {
      token: admin.token, method: "PUT",
      body: { title: "ZZ Edit renamed", questions: edited },
    });
    check(put.status === 200, "the edit was accepted", `status ${put.status}: ${JSON.stringify(put.body)}`);

    const idsAfter = await questionIds(testId);
    check(JSON.stringify(idsAfter) === JSON.stringify(originalIds),
      "every question kept its id",
      `before ${JSON.stringify(originalIds)}\n        after  ${JSON.stringify(idsAfter)}`);

    test = await Test.findById(testId);
    const after = await readScore();
    check(after.orphans === 0, "no student response was orphaned", `${after.orphans} orphaned`);
    check(after.totalScore === before.totalScore && after.maxScore === before.maxScore,
      "the score is untouched by the edit",
      `was ${before.totalScore}/${before.maxScore}, now ${after.totalScore}/${after.maxScore}`);
    check(JSON.stringify(after.points) === JSON.stringify(before.points),
      "every per-question mark is untouched",
      `was ${JSON.stringify(before.points)}, now ${JSON.stringify(after.points)}`);
    check(JSON.stringify(after.answers) === JSON.stringify(before.answers),
      "the student's answers are still there",
      `was ${JSON.stringify(before.answers)}, now ${JSON.stringify(after.answers)}`);
    check(test.questions[0].text === "answered right (reworded)",
      "the edit itself actually took effect", `text is "${test.questions[0].text}"`);

    // The review screen is where the orphaning used to show up as "Not answered".
    const review = await api(`/test-submissions/assignment/${assignment._id}`, { token: admin.token });
    const merged = review.body?.test?.questions || [];
    const answeredRows = merged.filter((row) => row.selectedOption || row.textAnswer).length;
    check(merged.length === 4 && answeredRows === 3,
      "the review screen still shows all 4 questions and all 3 given answers",
      `${merged.length} rows, ${answeredRows} of an expected 3 carry an answer`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. An edit that DOES change the answer key re-grades ════\n");

    const rekeyed = asEditPayload(test);
    rekeyed[1].answer = "wrong-1"; // what the student actually picked
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: rekeyed } });
    test = await Test.findById(testId);
    const regraded = await readScore();

    check(JSON.stringify(await questionIds(testId)) === JSON.stringify(originalIds),
      "ids still preserved through the re-key", "ids changed");
    check(regraded.totalScore === 4,
      "the student now scores 4: the -1 penalty became +2",
      `got ${regraded.totalScore}, points ${JSON.stringify(regraded.points)}`);
    check(regraded.points[2] === 0,
      "the unanswered question is still worth 0, not a negative-marking penalty",
      `blank scored ${regraded.points[2]}`);
    check(regraded.points[3] === 0 && regraded.maxScore === 11,
      "the theory answer still awaits the mentor, and maxScore is unchanged",
      `theory ${regraded.points[3]}, max ${regraded.maxScore}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. Adding, removing and reordering questions ════\n");

    const withExtra = asEditPayload(test);
    withExtra.push({ kind: "mcq", text: "brand new", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 3 });
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: withExtra } });
    let ids = await questionIds(testId);
    check(ids.length === 5 && JSON.stringify(ids.slice(0, 4)) === JSON.stringify(originalIds),
      "adding a question keeps the existing four ids and mints one new id",
      `got ${JSON.stringify(ids)}`);
    check(!originalIds.includes(ids[4]), "the new question got an id of its own", `new id ${ids[4]}`);

    test = await Test.findById(testId);
    const reordered = asEditPayload(test).reverse();
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: reordered } });
    ids = await questionIds(testId);
    check(JSON.stringify(ids) === JSON.stringify(reordered.map((x) => x._id)),
      "reordering moves the ids with their questions",
      `got ${JSON.stringify(ids)}`);

    test = await Test.findById(testId);
    const trimmed = asEditPayload(test).filter((x) => x.text !== "brand new");
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: trimmed } });
    ids = await questionIds(testId);
    check(ids.length === 4 && JSON.stringify([...ids].sort()) === JSON.stringify([...originalIds].sort()),
      "deleting a question leaves the other four ids alone",
      `got ${JSON.stringify(ids)}`);

    const survived = await readScore();
    check(survived.totalScore === 4,
      "the student's score survived all three structural edits",
      `got ${survived.totalScore}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. Ids that must NOT be honoured ════\n");

    test = await Test.findById(testId);
    const idsBeforeCopy = await questionIds(testId);
    const collide = asEditPayload(test);
    collide.push({ ...collide[0], text: "a duplicate of Q1" }); // same _id twice
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: collide } });
    ids = await questionIds(testId);
    check(new Set(ids).size === ids.length,
      "a duplicated _id does not produce two questions sharing one id",
      `got ${JSON.stringify(ids)}`);
    check(JSON.stringify(ids.slice(0, idsBeforeCopy.length)) === JSON.stringify(idsBeforeCopy),
      "the originals keep their ids",
      `before ${JSON.stringify(idsBeforeCopy)}\n        after  ${JSON.stringify(ids)}`);
    check(ids.length === idsBeforeCopy.length + 1 && !idsBeforeCopy.includes(ids[ids.length - 1]),
      "the copy is a new question with a fresh id of its own",
      `got ${JSON.stringify(ids)}`);

    test = await Test.findById(testId);
    const forged = asEditPayload(test).filter((x) => x.text !== "a duplicate of Q1");
    const foreignId = String(new mongoose.Types.ObjectId());
    forged[0]._id = foreignId;
    await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body: { questions: forged } });
    ids = await questionIds(testId);
    check(!ids.includes(foreignId),
      "an id that does not belong to this test is ignored, not adopted",
      `the foreign id ${foreignId} was accepted`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 5. Creating a test ignores any id the client supplies ════\n");

    const plantedId = String(new mongoose.Types.ObjectId());
    const madeUp = await api("/tests", {
      token: admin.token, method: "POST",
      body: {
        title: `ZZ Planted ${MARK}`, type: "mcq", timeLimit: 10, allowedTabSwitches: 0,
        questions: [{ _id: plantedId, kind: "mcq", text: "x", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 1 }],
      },
    });
    bin.tests.push(madeUp.body._id);
    const plantedIds = await questionIds(madeUp.body._id);
    check(!plantedIds.includes(plantedId),
      "a client-supplied _id on create is discarded",
      `the planted id ${plantedId} was used`);

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
