/**
 * Regression: the exam countdown must end exactly when the server ends the
 * attempt.
 *
 * Both exam pages counted down startTime + duration -- the availability window.
 * The server ends an attempt at the EARLIER of that window and startedAt + the
 * test's time limit (services/attemptWindow.js). With a 30-minute test open for
 * two hours, the student was shown two hours; at 30 minutes the server refused
 * their submit and the sweep finalised the paper from autosaves.
 *
 * The server now sends `attemptEndsAt` and `serverNow`, and the pages count
 * down to that. This drives the real API and checks that every party agrees on
 * the end instant: /start, the resume path, the 30-second backstop
 * (check-expiration), the submit route and the expiry sweep. It also feeds the
 * real responses through the frontend's own clock code (Frontend/src/utils/
 * examClock.js), so the number a student would actually see is what is tested.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const path = require("path");
const { pathToFileURL } = require("url");
const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `clock-${Date.now()}`;
const MIN = 60 * 1000;
const SLACK_S = 5; // request latency allowance when comparing "now"-based figures

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);
const near = (a, b, tol = SLACK_S) => typeof a === "number" && Math.abs(a - b) <= tol;
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");

  // The frontend's countdown code, loaded as-is.
  const clockModule = pathToFileURL(path.resolve(__dirname, "../../../Frontend/src/utils/examClock.js")).href;
  const { examClock, secondsLeft } = await import(clockModule);
  const studentSees = (payload, assignment, timeLimit) => secondsLeft(examClock(payload, assignment, timeLimit));

  const bin = { tests: [], assignments: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });
    const TIME_LIMIT = 30;

    const test = await Test.create({
      title: `ZZ Clock ${MARK}`, type: "mcq", status: "Active", timeLimit: TIME_LIMIT,
      allowedTabSwitches: 100, sebEnabled: false, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 }],
    });
    bin.tests.push(test._id);
    const qId = String(test.questions[0]._id);

    /** A student with an assignment whose window opened `openedAgoMin` ago and lasts `duration`. */
    async function seat(label, { openedAgoMin, duration }) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - openedAgoMin * MIN);
      const a = await Assignment.create({
        testId: test._id, userId: s.user._id, status: "Assigned", startTime, duration,
        deadline: new Date(startTime.getTime() + duration * MIN),
      });
      bin.assignments.push(a._id);
      return { s, a, A: String(a._id) };
    }
    const begin = async ({ s, A }) => {
      const started = await api(`/assignments/${A}/start`, { token: s.token, method: "POST", body: {} });
      const session = await api("/proctor/session/start", {
        token: s.token, method: "POST", body: { assignmentId: A, testKind: "assigned", environment: {} },
      });
      return { started, session };
    };
    /** Pretend the student started `agoMs` ago. */
    const startedAgo = (a, agoMs) =>
      Assignment.updateOne({ _id: a._id }, { $set: { startedAt: new Date(Date.now() - agoMs) } });

    // ── 1. The reported bug ────────────────────────────────────────────────
    section("1. 30-minute test, 120-minute window, started as the window opens");
    {
      const seated = await seat("longwindow", { openedAgoMin: 1, duration: 120 });
      const { started, session } = await begin(seated);
      check("Start 200 and proctor session 200", started.status === 200 && session.status === 200, { started: started.status, session: session.status });

      const db = await Assignment.findById(seated.a._id).lean();
      const expectedEnd = new Date(db.startedAt).getTime() + TIME_LIMIT * MIN;

      check("/start sends attemptEndsAt = startedAt + 30 min (not the window end)",
        Date.parse(started.body?.attemptEndsAt) === expectedEnd,
        { attemptEndsAt: started.body?.attemptEndsAt, expected: new Date(expectedEnd).toISOString() });
      check(`/start timeRemaining is ~30:00 (got ${fmt(started.body?.timeRemaining ?? 0)})`,
        near(started.body?.timeRemaining, TIME_LIMIT * 60), started.body?.timeRemaining);
      check("/start sends the server's clock (serverNow)", Number.isFinite(Date.parse(started.body?.serverNow)), started.body?.serverNow);

      const shown = studentSees(started.body, started.body.assignment, started.body.test?.timeLimit);
      const oldFormula = Math.floor((Date.parse(db.startTime) + db.duration * MIN - Date.now()) / 1000);
      check(`The exam page would show ~30:00 (shows ${fmt(shown)}; old code showed ${fmt(oldFormula)})`,
        near(shown, TIME_LIMIT * 60) && oldFormula > 100 * 60, { shown, oldFormula });

      const resumed = await api(`/assignments/${seated.A}`, { token: seated.s.token });
      check("Resume (GET /assignments/:id) sends the same attemptEndsAt",
        Date.parse(resumed.body?.attemptEndsAt) === expectedEnd, resumed.body?.attemptEndsAt);
      check("…and the page would show ~30:00 after a refresh",
        near(studentSees(resumed.body, resumed.body, resumed.body?.testId?.timeLimit), TIME_LIMIT * 60));

      const again = await api(`/assignments/${seated.A}/start`, { token: seated.s.token, method: "POST", body: {} });
      check("Start again (already-in-progress branch) agrees",
        again.body?.alreadyStarted === true && Date.parse(again.body?.attemptEndsAt) === expectedEnd &&
        near(again.body?.timeRemaining, TIME_LIMIT * 60), { alreadyStarted: again.body?.alreadyStarted, timeRemaining: again.body?.timeRemaining });

      const ce = await api(`/assignments/check-expiration/${seated.A}`, { token: seated.s.token });
      check("check-expiration backstop: 200 and the same attemptEndsAt (resyncs the page)",
        ce.status === 200 && Date.parse(ce.body?.attemptEndsAt) === expectedEnd, ce);

      // Ten seconds before the end, the paper is still accepted.
      await startedAgo(seated.a, TIME_LIMIT * MIN - 20 * 1000);
      const late = await api(`/assignments/${seated.A}`, { token: seated.s.token });
      const lateShown = studentSees(late.body, late.body, late.body?.testId?.timeLimit);
      check(`With 20s left the page shows ~0:20 (shows ${fmt(lateShown)})`, near(lateShown, 20), lateShown);
      const ok = await api("/test-submissions", {
        token: seated.s.token, method: "POST",
        body: { assignmentId: seated.A, responses: [{ questionId: qId, selectedOption: "4" }], timeSpent: 60 },
      });
      check("Submit with time still on the clock is accepted (201)", ok.status === 201, ok);
    }

    // ── 2. The moment the countdown hits zero, the server agrees ───────────
    section("2. Past startedAt + 30 min while the window is still open for 90 more");
    {
      const seated = await seat("expired", { openedAgoMin: 31, duration: 120 });
      await begin(seated);
      // The page autosaves an MCQ the moment it is picked, while time remains.
      await api("/answers", { token: seated.s.token, method: "POST", body: { assignmentId: seated.A, questionId: qId, selectedOption: "4" } });
      await startedAgo(seated.a, TIME_LIMIT * MIN + 10 * 1000); // 10s past the end

      const view = await api(`/assignments/${seated.A}`, { token: seated.s.token });
      check("GET /assignments/:id: remainingSeconds 0 and expired", view.body?.remainingSeconds === 0 && view.body?.expired === true,
        { remainingSeconds: view.body?.remainingSeconds, expired: view.body?.expired });
      check("The page would show 0:00 (old code: ~89 minutes)", studentSees(view.body, view.body, TIME_LIMIT) === 0);

      const ce = await api(`/assignments/check-expiration/${seated.A}`, { token: seated.s.token });
      check("check-expiration now fires at the time limit: 400 attempt_expired (it used to say 'still active')",
        ce.status === 400 && ce.body?.code === "attempt_expired", ce);

      const manual = await api("/test-submissions", {
        token: seated.s.token, method: "POST",
        body: { assignmentId: seated.A, responses: [{ questionId: qId, selectedOption: "4" }], timeSpent: 60 },
      });
      check("A manual submit after the end is refused (400 attempt_expired)", manual.status === 400 && manual.body?.code === "attempt_expired", manual);

      const auto = await api("/test-submissions", {
        token: seated.s.token, method: "POST",
        body: { assignmentId: seated.A, responses: [{ questionId: qId, selectedOption: "4" }], timeSpent: 60, autoSubmit: true },
      });
      const autoStored = await TestSubmission.findOne({ assignmentId: seated.a._id }).lean();
      check("The page's own auto-submit at 0:00 lands (201), graded from the answer saved in time",
        auto.status === 201 && autoStored?.totalScore === 1 && auto.body?.answersFrom === "saved", { status: auto.status, stored: autoStored?.totalScore, answersFrom: auto.body?.answersFrom });
    }

    // ── 3. The sweep and the countdown end the same attempts ───────────────
    section("3. Expiry sweep agrees with the countdown");
    {
      const abandoned = await seat("abandoned", { openedAgoMin: 40, duration: 120 });
      await begin(abandoned);
      await api("/answers", { token: abandoned.s.token, method: "POST", body: { assignmentId: abandoned.A, questionId: qId, selectedOption: "4" } });
      await startedAgo(abandoned.a, TIME_LIMIT * MIN + 6 * MIN); // past the 5-min grace

      const running = await seat("running", { openedAgoMin: 40, duration: 120 });
      await begin(running);

      const runView = await api(`/assignments/${running.A}`, { token: running.s.token });
      const runShown = studentSees(runView.body, runView.body, TIME_LIMIT);

      await sweepExpiredAttempts();
      const a1 = await Assignment.findById(abandoned.a._id).lean();
      const a2 = await Assignment.findById(running.a._id).lean();
      check("Sweep finalised the attempt whose countdown ended (graded from autosave)",
        a1.status === "Completed" && a1.autoScore === 1, { status: a1.status, autoScore: a1.autoScore });
      check(`Sweep left alone the attempt whose countdown shows ${fmt(runShown)}`,
        a2.status === "In Progress" && near(runShown, TIME_LIMIT * 60), { status: a2.status, runShown });
    }

    // ── 4. When the window closes first, it still wins ─────────────────────
    section("4. Started late: 20 minutes of window left on a 30-minute test");
    {
      const seated = await seat("latestart", { openedAgoMin: 100, duration: 120 });
      const { started } = await begin(seated);
      const db = await Assignment.findById(seated.a._id).lean();
      check("attemptEndsAt is the window's end, not startedAt + 30",
        Date.parse(started.body?.attemptEndsAt) === new Date(db.deadline).getTime(), started.body?.attemptEndsAt);
      const shown = studentSees(started.body, started.body.assignment, TIME_LIMIT);
      check(`The page shows ~20:00 (shows ${fmt(shown)})`, near(shown, 20 * 60), shown);
    }

    // ── 5. The common case is unchanged ────────────────────────────────────
    section("5. duration == time limit, started 5 minutes late");
    {
      const seated = await seat("equal", { openedAgoMin: 5, duration: TIME_LIMIT });
      const { started } = await begin(seated);
      const shown = studentSees(started.body, started.body.assignment, TIME_LIMIT);
      check(`The page shows ~25:00, exactly as before the fix (shows ${fmt(shown)})`, near(shown, 25 * 60), shown);
      check("timeRemaining agrees", near(started.body?.timeRemaining, 25 * 60), started.body?.timeRemaining);
    }

    // ── 6. A wrong laptop clock ────────────────────────────────────────────
    section("6. A student's laptop clock 15 minutes fast");
    {
      const seated = await seat("skewed", { openedAgoMin: 1, duration: 120 });
      const { started } = await begin(seated);
      const realNow = Date.now;
      const skew = 15 * MIN;
      Date.now = () => realNow() + skew; // the browser's clock is wrong...
      let shown;
      try { shown = studentSees(started.body, started.body.assignment, TIME_LIMIT); } finally { Date.now = realNow; }
      check(`…and the page still shows ~30:00 (shows ${fmt(shown)})`, near(shown, TIME_LIMIT * 60), shown);
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
