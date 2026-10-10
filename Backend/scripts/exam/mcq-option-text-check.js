/**
 * Regression: MCQ options containing "<" are saved, restored and graded
 * exactly as written.
 *
 * TakeTest's autosave used to "strip HTML" from the chosen option's text via
 * innerHTML: `vector<int>` was saved as `vector`, `#include <stdio.h>` as
 * `#include `. Nothing matched on reload, so the choice vanished; the expiry
 * sweep, which grades from autosaves, marked it wrong. The page now sends the
 * text untouched, and answers already saved the old way are read back as the
 * one option they came from (services/legacyMcqText.js) -- never guessed when
 * two options stripped to the same text.
 *
 * Drives the real API, the expiry sweep and the re-grade a test edit triggers,
 * and runs the frontend's own restore code (Frontend/src/utils/mcqOption.js)
 * against what the server stored.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const path = require("path");
const { pathToFileURL } = require("url");
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const { legacyStrippedText, canonicalOption } = require("../../services/legacyMcqText");
const fixture = require("./fixtures/legacy-mcq-strip.json");

const MARK = `mcqtext-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 600)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

(async () => {
  // ── 0. The backend's copy of the old stripping matches a real browser ────
  section("0. Backend reproduction of the old stripping (real-browser ground truth)");
  const differ = fixture.cases.filter(([input, browser]) => legacyStrippedText(input) !== browser);
  check(`All ${fixture.cases.length} browser cases reproduced`, differ.length === 0, differ);

  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");
  const { findOptionIndex } = await import(pathToFileURL(path.resolve(__dirname, "../../../Frontend/src/utils/mcqOption.js")).href);

  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });

    // Each correct answer contains "<". q1's two vector options strip to the
    // same text, so an old autosave of q1 is genuinely unrecoverable.
    const Q = [
      { text: "Which declares a vector of ints?", options: ["vector<int>", "vector<char>", "list<int>"], answer: "vector<int>" },
      { text: "Which header gives printf?", options: ["#include <stdio.h>", "using namespace std;", "import stdio"], answer: "#include <stdio.h>" },
      { text: "Which is true when a=1, b=2?", options: ["a < b", "a > b"], answer: "a < b" },
      { text: "Which type maps names to lists?", options: ["Map<String, List<Integer>>", "Map<String, Integer>"], answer: "Map<String, List<Integer>>" },
    ];
    const test = await Test.create({
      title: `ZZ MCQ text ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: Q.map((q) => ({ kind: "mcq", text: q.text, options: q.options.map((text) => ({ text })), answer: q.answer, points: 1 })),
    });
    bin.tests.push(test._id);
    const ids = test.questions.map((q) => String(q._id));

    async function sit(label) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 30,
        deadline: new Date(startTime.getTime() + 30 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      return { s, a, A };
    }
    const autosave = (who, A, i, selectedOption) => api("/answers", {
      token: who.s.token, method: "POST", body: { assignmentId: A, questionId: ids[i], selectedOption, textAnswer: "" },
    });
    const abandonAndSweep = async (who) => {
      await Assignment.updateOne({ _id: who.a._id }, { $set: { startedAt: new Date(Date.now() - 36 * MIN), deadline: new Date(Date.now() - 6 * MIN) } });
      await sweepExpiredAttempts();
    };
    const stored = async (who) => {
      const sub = await TestSubmission.findOne({ assignmentId: who.a._id }).lean();
      const asg = await Assignment.findById(who.a._id).lean();
      const byQ = ids.map((id) => (sub?.responses || []).find((r) => String(r.questionId) === id));
      return { sub, asg, byQ };
    };

    // ── 1. The fixed page: autosave keeps the text, the sweep marks it right ─
    section("1. Fixed page: answers autosaved exactly, attempt finalised by the sweep");
    const fresh = await sit("fresh");
    for (let i = 0; i < Q.length; i++) {
      const r = await autosave(fresh, fresh.A, i, Q[i].answer);
      if (r.status !== 200) check(`autosave ${i}`, false, r);
    }
    let st = await stored(fresh);
    check("Autosave stored every option's text exactly",
      st.byQ.every((r, i) => r?.selectedOption === Q[i].answer), st.byQ.map((r) => r?.selectedOption));
    check("Frontend restore finds every answer again (no vanished choices)",
      st.byQ.every((r, i) => findOptionIndex(test.questions[i].options, r?.selectedOption) === Q[i].options.indexOf(Q[i].answer)));
    await abandonAndSweep(fresh);
    st = await stored(fresh);
    check("Sweep marks all 4 correct (4/4)", st.asg.status === "Completed" && st.sub.totalScore === 4 && st.asg.autoScore === 4,
      { status: st.asg.status, total: st.sub.totalScore, autoScore: st.asg.autoScore });

    // ── 2. Answers the OLD page saved, still in a running attempt ──────────
    section("2. Old-page autosaves (student mid-exam when the fix ships), finalised by the sweep");
    const legacy = await sit("legacy");
    const oldPageSent = Q.map((q) => legacyStrippedText(q.answer));
    check("What the old page sent: 'vector', '#include ', 'a < b', 'Map>'",
      JSON.stringify(oldPageSent) === JSON.stringify(["vector", "#include ", "a < b", "Map>"]), oldPageSent);
    for (let i = 0; i < Q.length; i++) await autosave(legacy, legacy.A, i, oldPageSent[i]);

    st = await stored(legacy);
    const restored = st.byQ.map((r, i) => findOptionIndex(test.questions[i].options, r?.selectedOption));
    check("Reload restores the 3 recoverable choices; the ambiguous one is left for the student to re-pick",
      JSON.stringify(restored) === JSON.stringify([-1, 0, 0, 0]), restored);

    await abandonAndSweep(legacy);
    st = await stored(legacy);
    check("Sweep marks the 3 recoverable answers correct (3/4; the old code gave 1/4)",
      st.sub.totalScore === 3 && st.asg.autoScore === 3, { total: st.sub.totalScore, autoScore: st.asg.autoScore });
    check("…and stores them as the real option text, so the review highlights the right option",
      st.byQ[1].selectedOption === Q[1].answer && st.byQ[3].selectedOption === Q[3].answer,
      st.byQ.map((r) => r.selectedOption));
    check("The ambiguous 'vector' is not guessed: stays as saved, marked wrong",
      st.byQ[0].selectedOption === "vector" && st.byQ[0].isCorrect === false && st.byQ[0].points === 0, st.byQ[0]);

    // ── 3. Hand-in from the fixed page ─────────────────────────────────────
    section("3. Fixed page: normal hand-in");
    const handed = await sit("handin");
    let r = await api("/test-submissions", {
      token: handed.s.token, method: "POST",
      body: { assignmentId: handed.A, timeSpent: 60, responses: Q.map((q, i) => ({ questionId: ids[i], selectedOption: q.answer })) },
    });
    st = await stored(handed);
    check("Hand-in 201 and 4/4", r.status === 201 && st.sub?.totalScore === 4, { status: r.status, total: st.sub?.totalScore });

    const wrong = await sit("wrongpicks");
    r = await api("/test-submissions", {
      token: wrong.s.token, method: "POST",
      body: { assignmentId: wrong.A, timeSpent: 60, responses: Q.map((q, i) => ({ questionId: ids[i], selectedOption: q.options[1] })) },
    });
    st = await stored(wrong);
    check("Wrong options are still wrong (0/4) -- mapping never upgrades a real choice", r.status === 201 && st.sub?.totalScore === 0, st.sub?.totalScore);

    // ── 4. A paper finalised with stripped answers before the fix ──────────
    section("4. Historical paper marked wrong by the old sweep, repaired by a re-grade");
    const old = await sit("historical");
    await TestSubmission.create({
      assignmentId: old.a._id, testId: test._id, userId: old.s.user._id, isFinalized: true, mentorReviewed: true, reviewStatus: "Reviewed",
      totalScore: 1, maxScore: 4,
      responses: Q.map((q, i) => ({ questionId: ids[i], selectedOption: oldPageSent[i], isCorrect: i === 2, points: i === 2 ? 1 : 0, autoGraded: true })),
    });
    await Assignment.updateOne({ _id: old.a._id }, { $set: { status: "Completed", completedAt: new Date(), autoScore: 1 } });

    // An admin edit to the test triggers the re-grade (routes/tests.js).
    const current = await Test.findById(test._id).lean();
    r = await api(`/tests/${test._id}`, {
      token: admin.token, method: "PUT",
      body: { instructions: "edited", questions: current.questions.map((q) => ({ ...q, _id: String(q._id) })) },
    });
    check("Admin edits the test (200)", r.status === 200, r.status);
    st = await stored(old);
    check("Re-grade: the stored total rises from 1 to 3", st.sub.totalScore === 3, st.sub.totalScore);
    check("…with the recoverable answers stored as their real option text",
      st.byQ[1].selectedOption === Q[1].answer && st.byQ[3].selectedOption === Q[3].answer && st.byQ[0].selectedOption === "vector",
      st.byQ.map((x) => x.selectedOption));
    st = await stored(fresh);
    check("Re-grade leaves correctly saved papers exactly as they were (4/4)", st.sub.totalScore === 4, st.sub.totalScore);

    // ── 5. canonicalOption edges ───────────────────────────────────────────
    section("5. The mapping only ever resolves to one option");
    const q = { options: [{ text: "x" }, { text: "x<y" }, { text: "a<b>c</b>" }, { text: "a<i>c</i>" }] };
    check("Exact text always wins ('x' stays 'x' though 'x<y' also strips to it)", canonicalOption(q, "x") === "x");
    check("Two options stripping to the same text ('ac'): not resolved", canonicalOption(q, "ac") === "ac");
    check("Non-string and blank answers pass through", canonicalOption(q, null) === null && canonicalOption(q, "") === "");
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
