/**
 * Regression: a late auto-submit finishes the attempt, but is graded from the
 * answers saved in time -- never from the answers it carries.
 *
 * `autoSubmit` is a flag the browser supplies. It widened the late-submit
 * allowance from 5 seconds to 5 minutes, and the answers in the request were
 * graded as sent: anyone could keep working for five minutes after the end,
 * change their answers, and hand in with the flag set.
 *
 * Now, past the 5-second allowance, an auto-submit (inside the grace window)
 * still finishes the attempt at once, but grades what the server held when
 * time ran out -- the same mark the expiry sweep would give.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `lateauto-${Date.now()}`;
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
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");

  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const mcq = await Test.create({
      title: `ZZ LateAuto MCQ ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "mcq", text: "3+3?", options: [{ text: "5" }, { text: "6" }], answer: "6", points: 1 },
      ],
    });
    const theory = await Test.create({
      title: `ZZ LateAuto theory ${MARK}`, type: "theory", status: "Active", timeLimit: 30,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [{ kind: "theory", text: "Explain recursion.", points: 5 }],
    });
    bin.tests.push(mcq._id, theory._id);

    async function sit(label, test) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN),
      });
      bin.assignments.push(a._id);
      const A = String(a._id);
      await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} } });
      return { s, a, A, test };
    }
    const q = (who, i) => String(who.test.questions[i]._id);
    const save = (who, i, body) => api("/answers", { token: who.s.token, method: "POST", body: { assignmentId: who.A, questionId: q(who, i), textAnswer: "", ...body } });
    const handIn = (who, responses, extra = {}) => api("/test-submissions", {
      token: who.s.token, method: "POST", body: { assignmentId: who.A, timeSpent: 1800, responses, ...extra },
    });
    const bothRight = (who) => [{ questionId: q(who, 0), selectedOption: "4" }, { questionId: q(who, 1), selectedOption: "6" }];
    const clockAt = (who, msPastEnd) =>
      Assignment.updateOne({ _id: who.a._id }, { $set: { startedAt: new Date(Date.now() - 30 * MIN - msPastEnd) } });
    const stored = async (who) => {
      const sub = await TestSubmission.findOne({ assignmentId: who.a._id, userId: who.s.user._id }).lean();
      const asg = await Assignment.findById(who.a._id).lean();
      return { sub, asg, pick: (i) => (sub?.responses || []).find((r) => String(r.questionId) === q(who, i)) };
    };

    // ── 1. The exploit ─────────────────────────────────────────────────────
    section("1. Answer wrongly in time, change answers after the end, hand in with autoSubmit");
    const cheat = await sit("cheat", mcq);
    await save(cheat, 0, { selectedOption: "3" });     // in time, wrong
    await clockAt(cheat, 2 * MIN);                      // two minutes after the end
    let r = await handIn(cheat, bothRight(cheat), { autoSubmit: true });
    check("The late auto-submit is accepted (201) -- the attempt is finished at once", r.status === 201, r);
    check("…graded from the answers saved in time, not the request (answersFrom 'saved')", r.body?.answersFrom === "saved", r.body?.answersFrom);
    let st = await stored(cheat);
    check("Score 0 -- the 2 marks the late answers claimed are not awarded",
      st.sub.totalScore === 0 && st.asg.autoScore === 0, { stored: st.sub.totalScore, autoScore: st.asg.autoScore });
    check("The stored answers are the in-time ones: '3', and the second unanswered",
      st.pick(0)?.selectedOption === "3" && !st.pick(1)?.selectedOption, [st.pick(0)?.selectedOption, st.pick(1)?.selectedOption]);
    check("Attempt Completed and proctoring session closed",
      st.asg.status === "Completed" && (await ProctorSession.findOne({ assignmentId: cheat.a._id }).lean())?.status === "ended");
    r = await handIn(cheat, bothRight(cheat), { autoSubmit: true });
    check("A retry of the same late auto-submit changes nothing", r.status !== 201 && (await stored(cheat)).sub.totalScore === 0, r.status);

    // ── 2. Honest cases are unaffected ─────────────────────────────────────
    section("2. Honest hand-ins");
    const onTime = await sit("ontime", mcq);
    r = await handIn(onTime, bothRight(onTime));
    check("On time: graded from the request (2/2, answersFrom 'request')",
      r.status === 201 && (await stored(onTime)).sub?.totalScore === 2 && r.body?.answersFrom === "request", r.body);

    const inFlight = await sit("inflight", mcq);
    await clockAt(inFlight, 2 * 1000); // 2s after the end: the request was in flight at the bell
    r = await handIn(inFlight, bothRight(inFlight), { autoSubmit: true });
    check("Auto-submit 2 seconds after the end: taken as sent (2/2) -- nothing was autosaved, nothing is lost",
      r.status === 201 && (await stored(inFlight)).sub?.totalScore === 2 && r.body?.answersFrom === "request", r.body);

    const honestLate = await sit("honestlate", mcq);
    await save(honestLate, 0, { selectedOption: "4" });
    await save(honestLate, 1, { selectedOption: "6" });
    await clockAt(honestLate, 90 * 1000); // retry landing 90s late
    r = await handIn(honestLate, bothRight(honestLate), { autoSubmit: true });
    check("Honest page whose auto-submit retry lands 90s late: keeps everything it saved (2/2)",
      r.status === 201 && (await stored(honestLate)).sub?.totalScore === 2 && r.body?.answersFrom === "saved", r.body);

    // ── 3. A written answer ────────────────────────────────────────────────
    section("3. A written answer edited after the end");
    const essay = await sit("essay", theory);
    await save(essay, 0, { textAnswer: "Recursion is a function calling itself." });
    await clockAt(essay, 3 * MIN);
    r = await handIn(essay, [{ questionId: q(essay, 0), textAnswer: "Recursion is a function calling itself, with a base case, a recursive case, a stack, ..." }], { autoSubmit: true });
    st = await stored(essay);
    check("Late auto-submit stores the essay as it stood at the end, not the extended one",
      r.status === 201 && st.pick(0)?.textAnswer === "Recursion is a function calling itself.", st.pick(0)?.textAnswer);

    // ── 4. Without the flag, and past the grace window ─────────────────────
    section("4. Late manual hand-in, and past the grace window");
    const manual = await sit("manual", mcq);
    await save(manual, 0, { selectedOption: "4" });
    await clockAt(manual, 2 * MIN);
    r = await handIn(manual, bothRight(manual));
    check("A late MANUAL hand-in is still refused (400 attempt_expired)", r.status === 400 && r.body?.code === "attempt_expired", r);
    check("…and the attempt is untouched (still In Progress)", (await stored(manual)).asg.status === "In Progress");

    const tooLate = await sit("toolate", mcq);
    await save(tooLate, 0, { selectedOption: "4" });
    await clockAt(tooLate, 6 * MIN);
    r = await handIn(tooLate, bothRight(tooLate), { autoSubmit: true });
    check("Auto-submit past the 5-minute grace window: refused (400) -- the sweep owns it", r.status === 400 && r.body?.code === "attempt_expired", r);

    // ── 5. A late auto-submit and the sweep give the same mark ─────────────
    section("5. Late auto-submit vs the sweep, same saved answers");
    await clockAt(manual, 6 * MIN);
    await sweepExpiredAttempts();
    const viaSweep = await stored(tooLate);
    const viaSweepManual = await stored(manual);
    check("The sweep finalises the past-grace attempts from saved answers (1/2 each)",
      viaSweep.asg.status === "Completed" && viaSweep.sub.totalScore === 1 && viaSweepManual.sub.totalScore === 1,
      { tooLate: viaSweep.sub?.totalScore, manual: viaSweepManual.sub?.totalScore });

    const twin = await sit("twin", mcq);
    await save(twin, 0, { selectedOption: "4" });
    await clockAt(twin, 2 * MIN);
    r = await handIn(twin, bothRight(twin), { autoSubmit: true });
    check("The same saved answers handed in by a late auto-submit get the same mark as the sweep (1/2)",
      (await stored(twin)).sub?.totalScore === viaSweep.sub.totalScore, { autoSubmit: (await stored(twin)).sub?.totalScore, sweep: viaSweep.sub.totalScore });
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
