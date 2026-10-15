/**
 * Verification: editing a test must never cost its students their answers.
 *
 * Two rules, checked separately:
 *
 *   1. Once a test has started -- its start time has passed, or anyone has
 *      started or submitted it -- it cannot be edited at all (routes/tests.js,
 *      PUT /tests/:id, 2026-10-10). Every kind of edit is refused, and the
 *      paper, its question ids, the student's answers and their score are left
 *      exactly as they were.
 *
 *   2. Before then, edits are allowed, and student responses are matched to
 *      questions by `_id` and nothing else. The admin edit form used to drop
 *      `_id`, so every save minted brand new question ids; an edit must keep
 *      every existing id, give new questions fresh ones, and never adopt an id
 *      the client made up.
 *
 * Re-grading after an answer-key change used to be checked here too. The edit
 * lock makes that path unreachable through the API -- a key can no longer
 * change under answers that already exist -- so it is no longer checked.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const mongoose = require("mongoose");
const MARK = `edit-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (label) => { passed++; console.log(`  PASS  ${label}`); };
const fail = (label, detail) => { failed++; console.log(`  FAIL  ${label}\n        ${detail}`); };
const check = (cond, label, detail) => (cond ? pass(label) : fail(label, detail));

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { users: [], tests: [], assignments: [] };

  const mkUser = (name, role) => makeUser(role, name, { mark: MARK });

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
    console.log("\n════ 1. A test that has been sat cannot be edited ════\n");

    const snapshot = async () => JSON.stringify((await Test.findById(testId).lean()).questions);
    const paperBefore = await snapshot();

    const attempt = async (label, mutate, extra = {}) => {
      const body = { questions: mutate(asEditPayload(test)), ...extra };
      const put = await api(`/tests/${testId}`, { token: admin.token, method: "PUT", body });
      check(put.status === 400 && /already started and cannot be edited/.test(put.body?.message || ""),
        `${label}: refused (400)`, `status ${put.status}: ${JSON.stringify(put.body)}`);
    };

    await attempt("rewording a question", (qs) => { qs[0].text = "answered right (reworded)"; return qs; }, { title: "ZZ Edit renamed" });
    await attempt("changing an answer key", (qs) => { qs[1].answer = "wrong-1"; return qs; });
    await attempt("changing a question's marks", (qs) => { qs[0].points = 10; return qs; });
    await attempt("adding a question", (qs) => [...qs, { kind: "mcq", text: "brand new", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 3 }]);
    await attempt("removing a question", (qs) => qs.slice(1));
    await attempt("reordering the questions", (qs) => qs.reverse());

    check(await snapshot() === paperBefore, "the paper is exactly as it was", "the questions changed");
    check(JSON.stringify(await questionIds(testId)) === JSON.stringify(originalIds), "every question kept its id", "ids changed");
    check((await Test.findById(testId).lean()).title === `ZZ Edit ${MARK}`, "the title is unchanged", "the title changed");

    const after = await readScore();
    check(after.orphans === 0, "no student response was orphaned", `${after.orphans} orphaned`);
    check(JSON.stringify(after) === JSON.stringify(before),
      "the score, every per-question mark and every answer are untouched",
      `was ${JSON.stringify(before)}\n        now ${JSON.stringify(after)}`);

    // The review screen is where an orphaned answer would show as "Not answered".
    const review = await api(`/test-submissions/assignment/${assignment._id}`, { token: admin.token });
    const merged = review.body?.test?.questions || [];
    const answeredRows = merged.filter((row) => row.selectedOption || row.textAnswer).length;
    check(merged.length === 4 && answeredRows === 3,
      "the review screen still shows all 4 questions and all 3 given answers",
      `${merged.length} rows, ${answeredRows} of an expected 3 carry an answer`);

    // A start time that has passed locks the test even before anyone opens it.
    const scheduled = await api("/tests", {
      token: admin.token, method: "POST",
      body: {
        title: `ZZ Scheduled ${MARK}`, type: "mcq", timeLimit: 30, allowedTabSwitches: 0,
        questions: [{ kind: "mcq", text: "q", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 1 }],
      },
    });
    bin.tests.push(scheduled.body._id);
    const lapsed = await Assignment.create({
      testId: scheduled.body._id, userId: student.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 30, mentorId: null,
    });
    bin.assignments.push(lapsed._id);
    const lapsedTest = await Test.findById(scheduled.body._id);
    const lapsedPut = await api(`/tests/${scheduled.body._id}`, {
      token: admin.token, method: "PUT", body: { questions: asEditPayload(lapsedTest).map((x) => ({ ...x, text: "changed" })) },
    });
    check(lapsedPut.status === 400, "a test whose start time has passed is locked even if nobody has opened it", `status ${lapsedPut.status}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. Before it starts, an edit keeps every question id ════\n");

    // A separate test nobody has been assigned yet, so editing is allowed.
    const draft = await api("/tests", {
      token: admin.token, method: "POST",
      body: {
        title: `ZZ Draft ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 0,
        questions: [
          { kind: "mcq", text: "one", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 1 },
          { kind: "mcq", text: "two", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 1 },
          { kind: "mcq", text: "three", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 1 },
          { kind: "theory", text: "four", expectedAnswer: "M", points: 2 },
        ],
      },
    });
    const draftId = draft.body._id;
    bin.tests.push(draftId);
    const draftIds = await questionIds(draftId);
    test = await Test.findById(draftId);
    const reworded = asEditPayload(test);
    reworded[0].text = "one (reworded)";
    const draftPut = await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: reworded } });
    check(draftPut.status === 200, "an edit before the test starts is accepted", `status ${draftPut.status}: ${JSON.stringify(draftPut.body)}`);
    check(JSON.stringify(await questionIds(draftId)) === JSON.stringify(draftIds), "every question kept its id", "ids changed");
    check((await Test.findById(draftId)).questions[0].text === "one (reworded)", "the edit itself actually took effect", "text unchanged");

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. Adding, removing and reordering questions before the start ════\n");

    test = await Test.findById(draftId);
    const withExtra = asEditPayload(test);
    withExtra.push({ kind: "mcq", text: "brand new", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 3 });
    await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: withExtra } });
    let ids = await questionIds(draftId);
    check(ids.length === 5 && JSON.stringify(ids.slice(0, 4)) === JSON.stringify(draftIds),
      "adding a question keeps the existing four ids and mints one new id",
      `got ${JSON.stringify(ids)}`);
    check(!draftIds.includes(ids[4]), "the new question got an id of its own", `new id ${ids[4]}`);

    test = await Test.findById(draftId);
    const reordered = asEditPayload(test).reverse();
    await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: reordered } });
    ids = await questionIds(draftId);
    check(JSON.stringify(ids) === JSON.stringify(reordered.map((x) => x._id)),
      "reordering moves the ids with their questions",
      `got ${JSON.stringify(ids)}`);

    test = await Test.findById(draftId);
    const trimmed = asEditPayload(test).filter((x) => x.text !== "brand new");
    await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: trimmed } });
    ids = await questionIds(draftId);
    check(ids.length === 4 && JSON.stringify([...ids].sort()) === JSON.stringify([...draftIds].sort()),
      "deleting a question leaves the other four ids alone",
      `got ${JSON.stringify(ids)}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. Ids that must NOT be honoured ════\n");

    test = await Test.findById(draftId);
    const idsBeforeCopy = await questionIds(draftId);
    const collide = asEditPayload(test);
    collide.push({ ...collide[0], text: "a duplicate of Q1" }); // same _id twice
    await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: collide } });
    ids = await questionIds(draftId);
    check(new Set(ids).size === ids.length,
      "a duplicated _id does not produce two questions sharing one id",
      `got ${JSON.stringify(ids)}`);
    check(JSON.stringify(ids.slice(0, idsBeforeCopy.length)) === JSON.stringify(idsBeforeCopy),
      "the originals keep their ids",
      `before ${JSON.stringify(idsBeforeCopy)}\n        after  ${JSON.stringify(ids)}`);
    check(ids.length === idsBeforeCopy.length + 1 && !idsBeforeCopy.includes(ids[ids.length - 1]),
      "the copy is a new question with a fresh id of its own",
      `got ${JSON.stringify(ids)}`);

    test = await Test.findById(draftId);
    const forged = asEditPayload(test).filter((x) => x.text !== "a duplicate of Q1");
    const foreignId = String(new mongoose.Types.ObjectId());
    forged[0]._id = foreignId;
    await api(`/tests/${draftId}`, { token: admin.token, method: "PUT", body: { questions: forged } });
    ids = await questionIds(draftId);
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
      mongoose.model("Test").deleteMany({ _id: { $in: bin.tests } }),
      mongoose.model("Assignment").deleteMany({ _id: { $in: bin.assignments } }),
      mongoose.model("TestSubmission").deleteMany({ assignmentId: { $in: bin.assignments } }),
      mongoose.model("ProctorSession").deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await disconnect();
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
