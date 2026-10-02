/**
 * Regression: a student cannot step away from a proctored exam without it
 * showing on the record.
 *
 * Two ways used to leave no trace:
 *   - POST /proctor/session/end worked mid-exam, without handing in. Proctoring
 *     stopped, and a fresh session could be opened later as if nothing happened.
 *   - Reopening a closed exam tab resumed the session and reset its "last seen"
 *     clock without a word, so close tab -> look things up -> reopen was free.
 *
 * Now ending a session waits for the hand-in, and every away-gap (beyond the
 * normal reload grace) is written to the violation log for the reviewer --
 * including a page that stayed open but went silent, which the heartbeat route
 * claimed to charge but in fact neither charged nor recorded. By
 * Vikas's decision (2026-10-02) such gaps are recorded only, never charged: a
 * browser crash looks the same and must not end anyone's exam. The test below
 * uses an allowance of ZERO violations, so a gap that was charged would end the
 * attempt and fail the check.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `gap-${Date.now()}`;
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
      title: `ZZ Gap ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 0, // a single charged violation ends the attempt
      sebEnabled: false, createdBy: admin.user._id,
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
    const reopen = (who) => api("/proctor/session/start", { token: who.s.token, method: "POST", body: { assignmentId: who.A, testKind: "assigned", environment: {} } });
    const lastSeen = (who, msAgo) => ProctorSession.updateOne({ _id: who.sessionId }, { $set: { lastHeartbeatAt: new Date(Date.now() - msAgo) } });
    const gaps = async (who) => {
      const sessions = await ProctorSession.find({ assignmentId: who.a._id }).sort({ createdAt: 1 }).lean();
      const all = sessions.flatMap((x) => x.violations || []);
      return {
        sessions,
        recorded: all.filter((v) => v.violationType === "heartbeat_lost"),
        charged: sessions.reduce((sum, x) => sum + (x.violationCount || 0), 0),
      };
    };

    // ── 1. Closed the tab for three minutes, then reopened ─────────────────
    section("1. Exam tab closed for 3 minutes, then reopened");
    const away = await sit("away");
    await lastSeen(away, 3 * MIN);
    let r = await reopen(away);
    check("Reopening resumes the same session (200, resumed)", r.status === 200 && r.body?.resumed === true && String(r.body?.sessionId) === String(away.sessionId), r.body);
    let g = await gaps(away);
    check("The absence is on the record", g.recorded.length === 1 && /away for 3m/.test(g.recorded[0].details), g.recorded);
    check("…marked as not counted (weight 0)", g.recorded[0]?.weight === 0 && /not counted/.test(g.recorded[0]?.details), g.recorded[0]);
    check("…and it was not charged: count 0, attempt still running despite an allowance of 0",
      g.charged === 0 && g.sessions[0].status === "active" && (await Assignment.findById(away.a._id).lean()).status === "In Progress",
      { charged: g.charged, status: g.sessions[0].status });

    // ── 2. An ordinary reload ──────────────────────────────────────────────
    section("2. Ordinary reload (back within the heartbeat grace)");
    const reload = await sit("reload");
    await lastSeen(reload, 5 * 1000);
    await reopen(reload);
    g = await gaps(reload);
    check("Nothing recorded for a 5-second reload", g.recorded.length === 0, g.recorded);

    // ── 3. Switching proctoring off mid-exam ───────────────────────────────
    section("3. Ending the proctoring session mid-exam");
    const quitter = await sit("quitter");
    r = await api("/proctor/session/end", { token: quitter.s.token, method: "POST", body: { sessionId: quitter.sessionId } });
    check("Refused while the attempt is running (409 attempt_in_progress)", r.status === 409 && r.body?.code === "attempt_in_progress", r);
    check("…the session is still active", (await ProctorSession.findById(quitter.sessionId).lean()).status === "active");
    r = await api("/answers", { token: quitter.s.token, method: "POST", body: { assignmentId: quitter.A, questionId: q0, selectedOption: "4" } });
    check("…and the exam carries on normally (autosave 200)", r.status === 200, r.status);

    r = await api("/test-submissions", { token: quitter.s.token, method: "POST", body: { assignmentId: quitter.A, timeSpent: 60, responses: [{ questionId: q0, selectedOption: "4" }] } });
    check("Hand-in (201)", r.status === 201, r.status);
    r = await api("/proctor/session/end", { token: quitter.s.token, method: "POST", body: { sessionId: quitter.sessionId } });
    check("After hand-in, the page's own end call still succeeds (200, ended)", r.status === 200 && r.body?.status === "ended", r.body);

    const expired = await sit("expired");
    await Assignment.updateOne({ _id: expired.a._id }, { $set: { startedAt: new Date(Date.now() - 31 * MIN) } });
    r = await api("/proctor/session/end", { token: expired.s.token, method: "POST", body: { sessionId: expired.sessionId } });
    check("Once the time is up, ending is allowed (200)", r.status === 200 && r.body?.status === "ended", r.body);

    // ── 4. A session that ended some other way, reopened later ─────────────
    section("4. A new session after an earlier one stopped (e.g. expired on a long window)");
    const restart = await sit("restart");
    await ProctorSession.updateOne({ _id: restart.sessionId }, { $set: { status: "ended", endedAt: new Date(Date.now() - 4 * MIN), lastHeartbeatAt: new Date(Date.now() - 4 * MIN) } });
    r = await reopen(restart);
    check("A new session opens (200, not resumed)", r.status === 200 && r.body?.resumed === false && String(r.body?.sessionId) !== String(restart.sessionId), r.body);
    g = await gaps(restart);
    const fresh = g.sessions.find((x) => String(x._id) === String(r.body?.sessionId));
    check("The gap since the old session is on the new session's record, not counted",
      (fresh?.violations || []).some((v) => v.violationType === "heartbeat_lost" && v.weight === 0 && /restarted/.test(v.details)) && fresh?.violationCount === 0,
      fresh?.violations);

    // ── 5. A page that went silent while open is still charged ─────────────
    section("5. A page that stays open but goes silent (it used to leave no record at all)");
    const silent = await sit("silent");
    await lastSeen(silent, 30 * 1000);
    r = await api("/proctor/session/heartbeat", { token: silent.s.token, method: "POST", body: { sessionId: silent.sessionId } });
    g = await gaps(silent);
    check("The silence is on the record, not counted, and the exam carries on",
      r.body?.action === "continue" && g.recorded.some((v) => v.weight === 0 && /stopped reporting while open/.test(v.details)) && g.charged === 0,
      { action: r.body?.action, recorded: g.recorded, charged: g.charged });

    // ── 6. The reviewer sees it ────────────────────────────────────────────
    section("6. What the reviewer sees");
    r = await api("/test-submissions", { token: away.s.token, method: "POST", body: { assignmentId: away.A, timeSpent: 60, responses: [{ questionId: q0, selectedOption: "4" }] } });
    const sub = await TestSubmission.findOne({ assignmentId: away.a._id }).lean();
    check("The handed-in paper's log carries the absence, and the attempt was not cancelled",
      r.status === 201 && (sub?.tabViolations || []).some((v) => v.violationType === "heartbeat_lost" && /away for 3m/.test(v.details)) && sub?.cancelledDueToViolation === false,
      { status: r.status, log: sub?.tabViolations, cancelled: sub?.cancelledDueToViolation });
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
