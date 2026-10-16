/**
 * Regression: one act is charged once, and the warning names what was charged.
 *
 * Reported 2026-10-16: one violation brought two "Continue" dialogs. Part of it
 * was the page (see Frontend/scripts/exam-input-scenarios.mjs); part was here.
 * Leaving the exam usually takes fullscreen with it, and the two signals arrive
 * a second or more apart -- fullscreen at once, the tab switch once the page has
 * stayed hidden for 1.5s. They were two groups, so two charges and two warnings.
 * They are now linked (services/proctorPolicy.linkedGroupsOf): whichever is
 * charged first, the other is recorded at weight 0 for LINKED_ACT_WINDOW_MS.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const { LINKED_ACT_WINDOW_MS } = require("../../services/proctorPolicy");

const MARK = `linked-${Date.now()}`;
const MIN = 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const ProctorSession = require("../../models/ProctorSession");
  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const test = await Test.create({
      title: `ZZ LinkedActs ${MARK}`, type: "mcq", status: "Active", timeLimit: 60,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 }],
    });
    bin.tests.push(test._id);

    let seq = 0;
    async function sitting(label) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 120,
        deadline: new Date(startTime.getTime() + 120 * MIN),
      });
      bin.assignments.push(a._id);
      await api(`/assignments/${a._id}/start`, { token: s.token, method: "POST", body: {} });
      const r = await api("/proctor/session/start", {
        token: s.token, method: "POST", body: { assignmentId: String(a._id), testKind: "assigned", environment: {} },
      });
      const sessionId = r.body?.sessionId;
      const send = (...types) =>
        api("/proctor/session/event", {
          token: s.token, method: "POST",
          body: { sessionId, events: types.map((violationType) => ({ id: `${MARK}-${++seq}`, violationType, details: violationType })) },
        });
      return { sessionId, send, a };
    }

    section("1. Fullscreen lost, then the tab switch 1.5s later (one swipe / one tab change)");
    const one = await sitting("swipe");
    let r = await one.send("fullscreen_exit");
    check("fullscreen_exit: warned, count 1", r.body?.action === "warn" && r.body?.count === 1, r.body);
    await sleep(1500);
    r = await one.send("tab_switch");
    check("tab_switch for the same act: NOT a second warning (was: warn, count 2)", r.body?.action === "continue" && r.body?.count === 1, r.body);
    check("…but it is recorded for the reviewer", (r.body?.recorded || []).some((e) => e.violationType === "tab_switch"), r.body);

    section("2. The reverse order: tab switch first, fullscreen after");
    const two = await sitting("reverse");
    r = await two.send("tab_switch");
    check("tab_switch: warned, count 1", r.body?.action === "warn" && r.body?.count === 1, r.body);
    await sleep(800);
    r = await two.send("fullscreen_exit");
    check("fullscreen_exit for the same act: not charged", r.body?.action === "continue" && r.body?.count === 1, r.body);

    section("3. Both in one batch");
    const three = await sitting("batch");
    r = await three.send("tab_switch", "fullscreen_exit");
    check("One charge for the pair", r.body?.count === 1, r.body);
    const stored = await ProctorSession.findById(three.sessionId).lean();
    check("Both are on the record, one at weight 0",
      stored.violations.filter((v) => ["tab_switch", "fullscreen_exit"].includes(v.violationType)).map((v) => v.weight).sort().join() === "0,1",
      stored.violations);

    section("4. The warning names what was charged, not the last event in the batch");
    const four = await sitting("naming");
    r = await four.send("fullscreen_exit", "window_blur");
    check("Warning is about fullscreen_exit (was: window_blur, weight 0)", r.body?.violationType === "fullscreen_exit", r.body);

    section("5. Separate acts are still separate");
    const five = await sitting("separate");
    await five.send("fullscreen_exit");
    await sleep(LINKED_ACT_WINDOW_MS + 300);
    r = await five.send("tab_switch");
    check(`A tab switch more than ${LINKED_ACT_WINDOW_MS / 1000}s later is charged (count 2)`, r.body?.action === "warn" && r.body?.count === 2, r.body);
    r = await five.send("paste_attempt");
    check("Unlinked violations are untouched by the rule (paste charged, count 3)", r.body?.count === 3, r.body);

    section("6. Right-click stays free");
    const six = await sitting("rightclick");
    r = await six.send("context_menu");
    check("context_menu (code editor only now): recorded, never charged", r.body?.action === "continue" && r.body?.count === 0, r.body);
  } finally {
    await Promise.all([
      Test.deleteMany({ _id: { $in: bin.tests } }),
      Assignment.deleteMany({ _id: { $in: bin.assignments } }),
      ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (error) => {
  console.error(error);
  await disconnect().catch(() => {});
  process.exit(1);
});
