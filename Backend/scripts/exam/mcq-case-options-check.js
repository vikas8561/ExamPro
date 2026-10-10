/**
 * Regression: MCQ options that differ only in case are different answers.
 *
 * A question like `print("hello".upper())` with options hello / HELLO / Hello /
 * Error was graded correctly (exact comparison), but the review page matched
 * options with toLowerCase(), so A, B and C were ALL shown as "Your Choice" and
 * ALL as "Correct Key". It now resolves the saved answer and the key to one
 * option each, exactly as the grader does.
 *
 * The related authoring holes are closed too, and checked here:
 *   - two options reading the same (exactly, or apart from spacing) made both
 *     "correct" -- now refused by the API, editor and JSON upload;
 *   - an answer matching no option (left behind when the correct option's text
 *     was edited) marked every student wrong -- now refused.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const path = require("path");
const { pathToFileURL } = require("url");
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const backendRule = require("../../services/mcqOptions");

const MARK = `mcqcase-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 600)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

const CASE_OPTIONS = ["hello", "HELLO", "Hello", "Error"];

(async () => {
  const frontend = await import(pathToFileURL(path.resolve(__dirname, "../../../Frontend/src/utils/mcqOption.js")).href);

  // ── 0. The rule itself, and that both copies agree ──────────────────────
  section("0. mcqOptionsError: backend and frontend copies agree");
  const cases = [
    [CASE_OPTIONS, "HELLO", null],
    [["a", "b"], "a", null],
    [["x", "x", "y"], "x", "same"],
    [["5", "5 ", "6"], "5", "same"],
    [[" a", "a"], "a", "same"],
    [["hello", "HELLO"], "HELLO ", "does not exactly match"],
    [["hello", "HELLO"], "hEllo", "does not exactly match"],
    [["a", ""], "a", "empty"],
    [["a", "   "], "a", "empty"],
    [["a", "b"], "", "no correct answer"],
    [["a"], "a", "at least 2"],
    [[{ text: "Yes" }, { text: "yes" }], "yes", null],
  ];
  for (const [options, answer, expect] of cases) {
    const b = backendRule.mcqOptionsError(options, answer);
    const f = frontend.mcqOptionsError(options, answer);
    const ok = b === f && (expect === null ? b === null : typeof b === "string" && b.includes(expect));
    check(`${JSON.stringify(options)} / ${JSON.stringify(answer)} -> ${expect ?? "ok"}`, ok, { backend: b, frontend: f });
  }

  section("0b. findOptionIndex resolves case-distinct options to exactly one");
  const opts = CASE_OPTIONS.map((text) => ({ text }));
  check("'HELLO' -> B only", frontend.findOptionIndex(opts, "HELLO") === 1);
  check("'hello' -> A only", frontend.findOptionIndex(opts, "hello") === 0);
  check("'Hello' -> C only", frontend.findOptionIndex(opts, "Hello") === 2);
  check("'hEllO' -> none", frontend.findOptionIndex(opts, "hEllO") === -1);

  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const mcq = (options, answer) => ({ kind: "mcq", text: "What is the output of print('hello'.upper())?", points: 1, options: options.map((text) => ({ text })), answer });
    const create = (questions) => api("/tests", {
      token: admin.token, method: "POST",
      body: { title: `ZZ MCQ case ${MARK}`, subject: "Python", type: "mcq", timeLimit: 30, allowedTabSwitches: 100, sebEnabled: false, questions },
    });
    const keep = (r) => { const id = r.body?._id || r.body?.test?._id; if (id) bin.tests.push(id); return id; };

    // ── 1. The API refuses ambiguous questions ─────────────────────────────
    section("1. Creating and editing tests");
    let r = await create([mcq(CASE_OPTIONS, "HELLO")]);
    const testId = keep(r);
    check("hello / HELLO / Hello / Error with answer HELLO is accepted", r.status === 201 && testId, { status: r.status, body: r.body });

    for (const [label, options, answer] of [
      ["exact duplicate options", ["x", "x", "y"], "x"],
      ["options differing only in spacing", ["5", "5 ", "6"], "5"],
      ["answer differing from its option in case", CASE_OPTIONS, "HELLo"],
      ["answer with a trailing space", CASE_OPTIONS, "HELLO "],
      ["a blank option", ["a", "  "], "a"],
    ]) {
      r = await create([{ kind: "theory", text: "warm-up", points: 1 }, mcq(options, answer)]);
      keep(r);
      check(`Refused: ${label} (400, names Question 2)`, r.status === 400 && /Question 2:/.test(r.body?.message || ""), { status: r.status, body: r.body });
    }

    const before = await Test.findById(testId).lean();
    r = await api(`/tests/${testId}`, {
      token: admin.token, method: "PUT",
      body: { questions: [{ ...mcq(["hello", "hello", "Hello", "Error"], "hello"), _id: String(before.questions[0]._id) }] },
    });
    const afterBad = await Test.findById(testId).lean();
    check("Edit introducing duplicate options is refused (400) and changes nothing",
      r.status === 400 && JSON.stringify(afterBad.questions) === JSON.stringify(before.questions), { status: r.status, body: r.body });

    r = await api(`/tests/${testId}`, {
      token: admin.token, method: "PUT",
      body: { questions: [{ ...mcq(CASE_OPTIONS, "HELLO"), _id: String(before.questions[0]._id) }] },
    });
    check("A valid edit still saves (200)", r.status === 200, { status: r.status, body: r.body });

    // ── 2. Grading and the review page ─────────────────────────────────────
    section("2. Students pick each case variant; grading and review agree");
    const test = await Test.findById(testId).lean();
    await Test.updateOne({ _id: testId }, { $set: { status: "Active" } });
    const qid = String(test.questions[0]._id);

    for (const [pick, idx, correct] of [["HELLO", 1, true], ["hello", 0, false], ["Hello", 2, false]]) {
      const s = await makeUser("Student", `pick-${pick}`, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId, userId: s.user._id, status: "Assigned", startTime, duration: 30,
        deadline: new Date(startTime.getTime() + 30 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      r = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: { assignmentId: A, timeSpent: 60, responses: [{ questionId: qid, selectedOption: pick }] },
      });
      const sub = await TestSubmission.findOne({ assignmentId: a._id }).lean();
      check(`'${pick}': graded ${correct ? "correct (1/1)" : "wrong (0/1)"}`,
        r.status === 201 && sub?.totalScore === (correct ? 1 : 0) && sub?.responses?.[0]?.isCorrect === correct,
        { status: r.status, total: sub?.totalScore });

      // What the reviewer (mentor/admin) sees: ViewCompletedTest resolves the
      // saved answer and the key to one option each.
      const view = await api(`/test-submissions/assignment/${A}`, { token: admin.token });
      const q = view.body?.test?.questions?.find((x) => String(x._id) === qid);
      const list = (q?.options || []).map((o) => ({ text: typeof o === "string" ? o : o.text }));
      const selected = list.map((_, i) => i === frontend.findOptionIndex(list, q?.selectedOption));
      const keyed = list.map((_, i) => i === frontend.findOptionIndex(list, q?.answer));
      check(`'${pick}': review marks only option ${"ABCD"[idx]} as "Your Choice" and only B as "Correct Key"`,
        view.status === 200 && selected.filter(Boolean).length === 1 && selected[idx] && keyed.filter(Boolean).length === 1 && keyed[1],
        { status: view.status, selected, keyed, selectedOption: q?.selectedOption, answer: q?.answer });
    }
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
