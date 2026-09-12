/**
 * Verification: a test that runs out of time gets submitted and marked, even
 * when the student's browser is not there to do it.
 *
 * Three things were wrong before:
 *
 *   1. Nothing on the server ever finalised an abandoned attempt. A closed
 *      laptop left it at "In Progress" with no score forever, and the answers
 *      already autosaved against it were never graded or shown to anyone.
 *   2. The exam page's 30-second backstop matched on the message text of the
 *      expiry reply -- and on a string no reply ever contained -- so the net
 *      meant to catch a drifting local timer never fired once.
 *   3. `autoSubmit` is a flag the browser supplies, and it skipped the deadline
 *      check completely, so anyone could submit an attempt hours late with it.
 *
 * Needs the API running on :4000 and MONGODB_URI set, like the other scripts.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const API = "http://localhost:4000/api";
const MARK = `auto-${Date.now()}`;

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
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");
  const { attemptEndsAt, isAttemptExpired, SUBMISSION_GRACE_MS } = require("../../services/attemptWindow");

  const bin = { users: [], tests: [], assignments: [] };

  const mkUser = async (n) => {
    const u = new User({ name: `ZZ ${n} ${MARK}`, email: `${MARK}-${n}@verify.invalid`, password: "x", role: "Student" });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    u.activeSessions = [token];
    await u.save();
    bin.users.push(u._id);
    return { user: u, token };
  };

  /**
   * A student starts an exam, answers two of three questions, and then vanishes.
   * `expiredMinutesAgo` backdates both clocks so the attempt is already over.
   */
  const abandonedAttempt = async (name, { expiredMinutesAgo }) => {
    const s = await mkUser(name);
    const test = await Test.create({
      title: `ZZ Auto ${MARK} ${name}`, type: "mcq", timeLimit: 30, status: "Active",
      createdBy: s.user._id, negativeMarkingPercent: 0.5,
      questions: [
        { kind: "mcq", text: "right", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 2 },
        { kind: "mcq", text: "wrong", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 2 },
        { kind: "mcq", text: "never reached", options: [{ text: "a" }, { text: "b" }], answer: "a", points: 2 },
      ],
    });
    bin.tests.push(test._id);

    const a = await Assignment.create({
      testId: test._id, userId: s.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 240, mentorId: null,
    });
    bin.assignments.push(a._id);

    await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: String(a._id), testKind: "assigned" } });
    await api(`/assignments/${a._id}/start`, { token: s.token, method: "POST" });

    // Two answers autosave; the third is never reached.
    await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(test.questions[0]._id), selectedOption: "a" } });
    await api("/answers", { token: s.token, method: "POST", body: { assignmentId: String(a._id), questionId: String(test.questions[1]._id), selectedOption: "b" } });

    // The browser goes away and both clocks run out.
    const gone = new Date(Date.now() - expiredMinutesAgo * 60000);
    await Assignment.updateOne({ _id: a._id }, {
      $set: { startedAt: new Date(gone.getTime() - 30 * 60000), startTime: new Date(gone.getTime() - 60 * 60000), deadline: gone },
    });

    return { s, test, a };
  };

  try {
    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 1. The server finalises an attempt nobody submitted ════\n");

    const gone = await abandonedAttempt("gone", { expiredMinutesAgo: 60 });

    let asg = await Assignment.findById(gone.a._id).lean();
    check(asg.status === "In Progress" && asg.autoScore == null,
      "before the sweep the attempt is stuck at In Progress with no score",
      `status ${asg.status}, autoScore ${asg.autoScore}`);

    const result = await sweepExpiredAttempts();
    check(result.finalized >= 1, "the sweep finalised it", JSON.stringify(result));

    asg = await Assignment.findById(gone.a._id).lean();
    let sub = await TestSubmission.findOne({ assignmentId: gone.a._id }).lean();

    check(asg.status === "Completed", "the assignment is Completed", `status ${asg.status}`);
    check(asg.completedAt instanceof Date, "it has a completion time", `completedAt ${asg.completedAt}`);
    check(sub?.isFinalized === true, "the submission is finalised", `isFinalized ${sub?.isFinalized}`);
    check(sub?.autoSubmit === true, "it is recorded as an auto-submit", `autoSubmit ${sub?.autoSubmit}`);

    // One right (+2), one wrong (-(2 x 0.5) = -1), one never answered (0). Max 6.
    check(sub?.totalScore === 1 && sub?.maxScore === 6,
      "the autosaved answers were marked correctly: 1 out of 6",
      `got ${sub?.totalScore}/${sub?.maxScore}, points ${JSON.stringify((sub?.responses || []).map(r => r.points))}`);
    check(asg.autoScore === sub?.totalScore,
      "the assignment carries the same score as the submission",
      `autoScore ${asg.autoScore} vs totalScore ${sub?.totalScore}`);

    const blank = (sub?.responses || []).find((r) => String(r.questionId) === String(gone.test.questions[2]._id));
    check(blank && blank.points === 0 && !blank.selectedOption,
      "the question never reached scores 0, with no negative-marking penalty",
      `got ${JSON.stringify(blank)}`);
    check((sub?.responses || []).length === 3,
      "every question has a response row, answered or not",
      `${(sub?.responses || []).length} rows`);

    const session = await ProctorSession.findOne({ assignmentId: gone.a._id }).lean();
    check(!session || session.status !== "active",
      "the proctoring session was closed out so the attempt cannot be reopened",
      `session status ${session?.status}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. The sweep is idempotent and leaves live attempts alone ════\n");

    const second = await sweepExpiredAttempts();
    const afterTwice = await TestSubmission.findOne({ assignmentId: gone.a._id }).lean();
    check(afterTwice.totalScore === 1 && String(afterTwice.submittedAt) === String(sub.submittedAt),
      "running the sweep again does not touch an already-finalised attempt",
      `finalised ${second.finalized} again; score now ${afterTwice.totalScore}`);

    const fresh = await abandonedAttempt("fresh", { expiredMinutesAgo: 1 });
    await sweepExpiredAttempts();
    const freshAsg = await Assignment.findById(fresh.a._id).lean();
    check(freshAsg.status === "In Progress",
      "an attempt only 1 minute past time is left alone -- the browser still owns it",
      `status ${freshAsg.status}`);

    const live = await abandonedAttempt("live", { expiredMinutesAgo: 0 });
    await Assignment.updateOne({ _id: live.a._id }, {
      $set: { startedAt: new Date(), startTime: new Date(Date.now() - 60000), deadline: new Date(Date.now() + 3600e3) },
    });
    await sweepExpiredAttempts();
    const liveAsg = await Assignment.findById(live.a._id).lean();
    check(liveAsg.status === "In Progress", "an exam still in progress is never swept", `status ${liveAsg.status}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. The exam page's backstop can actually detect expiry ════\n");

    const stuck = await abandonedAttempt("backstop", { expiredMinutesAgo: 60 });
    const chk = await api(`/assignments/check-expiration/${stuck.a._id}`, { token: stuck.s.token });
    check(chk.status === 400, "check-expiration reports the attempt as over", `status ${chk.status}`);
    check(chk.body?.code === "attempt_expired",
      "it returns the stable code the page keys its backstop off",
      `got ${JSON.stringify(chk.body)}`);
    check(!String(chk.body?.message || "").includes("Test time has expired"),
      "and the old prose match would still have failed -- which is why it is gone",
      "the old string now matches, so this test no longer proves anything");

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. autoSubmit no longer bypasses the deadline ════\n");

    const late = await abandonedAttempt("late", { expiredMinutesAgo: 120 });
    const cheeky = await api("/test-submissions", {
      token: late.s.token, method: "POST",
      body: {
        assignmentId: String(late.a._id),
        responses: [{ questionId: String(late.test.questions[0]._id), selectedOption: "a" }],
        timeSpent: 60, autoSubmit: true,
      },
    });
    check(cheeky.status === 400,
      "an auto-submit 2 hours late is refused",
      `status ${cheeky.status}: ${JSON.stringify(cheeky.body?.message)}`);
    check(cheeky.body?.code === "attempt_expired", "and says why, in a stable code", JSON.stringify(cheeky.body));

    // Inside the grace window it must still land -- that is the whole point.
    const justOver = await abandonedAttempt("justover", { expiredMinutesAgo: 0 });
    await Assignment.updateOne({ _id: justOver.a._id }, {
      $set: { startedAt: new Date(Date.now() - 31 * 60000), startTime: new Date(Date.now() - 62 * 60000), deadline: new Date(Date.now() - 30000) },
    });
    const onTime = await api("/test-submissions", {
      token: justOver.s.token, method: "POST",
      body: {
        assignmentId: String(justOver.a._id),
        responses: [{ questionId: String(justOver.test.questions[0]._id), selectedOption: "a" }],
        timeSpent: 1800, autoSubmit: true,
      },
    });
    check(onTime.status === 201,
      "an auto-submit 30 seconds late still lands, inside the grace window",
      `status ${onTime.status}: ${JSON.stringify(onTime.body?.message)}`);

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 5. Both clocks agree between the submit route and the sweep ════\n");

    const a5 = { startTime: new Date(Date.now() - 3600e3), duration: 30, startedAt: new Date(Date.now() - 600e3), deadline: null };
    check(isAttemptExpired(a5, { timeLimit: 120 }) === false,
      "an attempt is live while EITHER clock is open (test clock here)",
      `ends at ${attemptEndsAt(a5, { timeLimit: 120 })}`);
    check(isAttemptExpired({ ...a5, startedAt: new Date(Date.now() - 8 * 3600e3) }, { timeLimit: 30 }) === true,
      "and over only once BOTH have closed", "still reported live");
    check(SUBMISSION_GRACE_MS === 5 * 60 * 1000, "the grace window is 5 minutes", `${SUBMISSION_GRACE_MS}ms`);

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
