/**
 * Regression: students were charged proctoring violations for things they did
 * not do.
 *
 *   - A violation report the browser resent after losing the reply (a timeout on
 *     a slow connection) was charged a second time once the dedupe window had
 *     passed. Reports now carry an id, and a repeated id is ignored.
 *   - The browser now reports, at weight 0, three things that used to arrive as
 *     charged violations: the page out of view for under 1.5s
 *     (tab_switch_brief), the screen sleeping or locking after a long idle
 *     stretch (screen_idle_off), and a camera or microphone dropping out while
 *     its permission stayed granted (media_device_lost). They must never cost
 *     anything -- including on a session opened before they existed, whose
 *     frozen rulebook does not list them -- and must survive the hand-in, whose
 *     violation log validates types against an enum.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `fp-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 500)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

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
      title: `ZZ FalsePositive ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 3, sebEnabled: false, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 }],
    });
    bin.tests.push(test._id);
    const q0 = String(test.questions[0]._id);

    async function sit(label) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      const opened = await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      return { s, a, A, sessionId: opened.body?.sessionId };
    }
    const send = (who, events) =>
      api("/proctor/session/event", { token: who.s.token, method: "POST", body: { sessionId: who.sessionId, events } });
    const session = (who) => ProctorSession.findById(who.sessionId).lean();
    // Moves the dedupe window out of the way, as if the resend came much later.
    const forgetDedupe = (who) => ProctorSession.updateOne({ _id: who.sessionId }, { $set: { lastViolationByType: {} } });

    // ── 1. A resent batch ──────────────────────────────────────────────────
    section("1. A report resent after its reply was lost");
    const resend = await sit("resend");
    const batch = [{ id: "evt-fullscreen-1", violationType: "fullscreen_exit", details: "Left fullscreen mode" }];
    let r = await send(resend, batch);
    check("First delivery is charged (warn, count 1)", r.body?.action === "warn" && r.body?.count === 1, r.body);
    await forgetDedupe(resend);
    r = await send(resend, batch);
    let s = await session(resend);
    check("The same id again is not charged again (count stays 1)", s.violationCount === 1 && s.violations.length === 1, { count: s.violationCount, violations: s.violations });
    await forgetDedupe(resend);
    r = await send(resend, [{ id: "evt-fullscreen-2", violationType: "fullscreen_exit", details: "Left fullscreen mode" }]);
    check("A genuinely new event is still charged (count 2)", r.body?.count === 2, r.body);
    await forgetDedupe(resend);
    r = await send(resend, [{ violationType: "fullscreen_exit", details: "from an older page with no ids" }]);
    check("Reports without ids, from pages loaded before this change, still count (3)", r.body?.count === 3, r.body);

    // ── 2. The recorded-only types ─────────────────────────────────────────
    section("2. Signals that do not show the student did anything");
    const benign = await sit("benign");
    for (const [type, details] of [
      ["tab_switch_brief", "The exam was out of view for 0.6s"],
      ["screen_idle_off", "The screen turned off or locked after 3 min with no activity"],
      ["media_device_lost", "The camera stopped and could not be reopened (NotReadableError)."],
    ]) {
      r = await send(benign, [{ id: `evt-${type}`, violationType: type, details }]);
      check(`${type}: accepted, not charged, exam continues`, r.status === 200 && r.body?.action === "continue" && r.body?.count === 0, r.body);
    }
    s = await session(benign);
    check("All three are on the record at weight 0", s.violations.length === 3 && s.violations.every((v) => v.weight === 0), s.violations);

    section("3. A brief flicker does not swallow a real tab switch right after it");
    const flicker = await sit("flicker");
    r = await send(flicker, [
      { id: "f1", violationType: "tab_switch_brief", details: "The exam was out of view for 0.4s" },
      { id: "f2", violationType: "tab_switch", details: "Switched away from the exam tab" },
    ]);
    check("The tab switch is charged (count 1)", r.body?.count === 1 && r.body?.violationType === "tab_switch", r.body);

    section("4. A session opened before these types existed");
    const old = await sit("old");
    const frozen = { ...(await session(old)).policy };
    const weights = { ...frozen.violationWeights };
    delete weights.tab_switch_brief; delete weights.screen_idle_off; delete weights.media_device_lost;
    await ProctorSession.updateOne({ _id: old.sessionId }, { $set: { "policy.violationWeights": weights } });
    r = await send(old, [{ id: "o1", violationType: "tab_switch_brief", details: "0.5s" }, { id: "o2", violationType: "media_device_lost", details: "mic" }]);
    check("Its frozen rulebook does not list them, and they still cost nothing", r.body?.action === "continue" && r.body?.count === 0, r.body);

    // ── 5. Hand-in ─────────────────────────────────────────────────────────
    section("5. Hand-in keeps the whole record");
    r = await api("/test-submissions", { token: benign.s.token, method: "POST", body: { assignmentId: benign.A, timeSpent: 60, responses: [{ questionId: q0, selectedOption: "4" }] } });
    const sub = await TestSubmission.findOne({ assignmentId: benign.a._id }).lean();
    const types = (sub?.tabViolations || []).map((v) => v.violationType);
    check("Submitted (201), not cancelled",
      r.status === 201 && sub?.cancelledDueToViolation === false, { status: r.status, body: r.body });
    check("The paper's log carries all three new types",
      ["tab_switch_brief", "screen_idle_off", "media_device_lost"].every((t) => types.includes(t)), types);
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
