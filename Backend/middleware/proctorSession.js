const ProctorSession = require("../models/ProctorSession");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const policyService = require("../services/proctorPolicy");

/**
 * The lock on the door.
 *
 * Before this existed, every proctoring rule lived in the student's browser and
 * the server checked nothing — so a student could skip the exam page entirely,
 * fetch the questions with a direct API call, and post their answers back with
 * nothing but a login token. Fullscreen, tab detection, keyboard blocking: all
 * of it bypassed in one request.
 *
 * These middlewares make the server verify that a real proctoring session was
 * opened and is running before it hands out questions or accepts answers.
 *
 * Two strengths, used deliberately:
 *
 *   requireProctorSession  hard 403. For endpoints that accept answers.
 *   attachProctorStatus    sets req.proctor and lets the route decide. Used
 *                          where blocking outright would break a legitimate
 *                          page load, so the route withholds question content
 *                          instead of failing.
 */

/** Pull the assignment id from wherever the route happens to keep it. */
function findAssignmentId(req) {
  const candidate =
    req.body?.assignmentId ||
    req.params?.assignmentId ||
    req.params?.id ||
    req.query?.assignmentId;

  return typeof candidate === "string" && candidate.length === 24 ? candidate : null;
}

/**
 * Work out whether this request is allowed to see questions or save answers.
 *
 * Returns `{ required, ok, reason }`. `required: false` means proctoring does
 * not apply here at all — an admin or mentor is asking, or it is a practice
 * test — and the request proceeds untouched.
 */
async function resolveProctorStatus(req, { allowTerminated = false } = {}) {
  const role = String(req.user?.role || "").toLowerCase();

  // Admins and mentors author and review tests; proctoring is not about them.
  if (role === "admin" || role === "mentor") {
    return { required: false, ok: true, reason: "privileged_role" };
  }

  const assignmentId = findAssignmentId(req);
  if (!assignmentId) {
    // No assignment in the request means this is not an exam route in the sense
    // we guard. Let the route's own validation deal with it.
    return { required: false, ok: true, reason: "no_assignment" };
  }

  const assignment = await Assignment.findById(assignmentId)
    .select("userId testId status")
    .lean();

  if (!assignment) {
    return { required: false, ok: true, reason: "assignment_not_found" };
  }

  // Not the caller's exam — the route's own ownership check will reject it.
  if (String(assignment.userId) !== String(req.user.userId)) {
    return { required: false, ok: true, reason: "not_owner" };
  }

  const test = await Test.findById(assignment.testId)
    .select("type isPracticeTest practiceTestSettings allowedTabSwitches")
    .lean();

  // Practice tests and DSA practice are deliberately unproctored and must keep
  // working exactly as they did before.
  if (!policyService.isProctoredTest(test)) {
    return { required: false, ok: true, reason: "unproctored_test" };
  }

  const session = await ProctorSession.findOne({
    userId: req.user.userId,
    assignmentId,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!session) {
    return { required: true, ok: false, reason: "no_session", assignmentId };
  }

  if (session.status === "terminated") {
    // A terminated session must still be able to submit: that submit *is* the
    // auto-submit the termination triggered. It must not be able to fetch fresh
    // questions or keep saving answers.
    return {
      required: true,
      ok: allowTerminated,
      reason: "terminated",
      session,
      assignmentId,
    };
  }

  if (session.status === "ended") {
    return {
      required: true,
      ok: allowTerminated,
      reason: "ended",
      session,
      assignmentId,
    };
  }

  return { required: true, ok: true, reason: "active", session, assignmentId };
}

/**
 * Hard guard. Refuses the request unless proctoring was properly started.
 *
 * Note what is deliberately NOT checked here: how recently the browser last
 * checked in. A student whose wifi drops for ten seconds while they press
 * Submit must not lose their work — the missed heartbeat is already recorded as
 * a violation by the referee, which is the right place to penalise it.
 */
function requireProctorSession(options = {}) {
  const { allowTerminated = false } = options;

  return async function guard(req, res, next) {
    try {
      const status = await resolveProctorStatus(req, { allowTerminated });
      req.proctor = status;

      if (!status.required || status.ok) {
        return next();
      }

      const message =
        status.reason === "terminated"
          ? "This attempt was ended by the proctoring system."
          : "This test must be taken with proctoring active. Please start the test from your assignments page.";

      return res.status(403).json({
        message,
        proctoringRequired: true,
        reason: status.reason,
      });
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Soft guard. Records the verdict on `req.proctor` and always calls next().
 *
 * Used on routes that a page legitimately calls before the exam has started —
 * to show the title, the instructions and the timer. Those routes stay working;
 * they just leave the question content out until proctoring is live.
 */
function attachProctorStatus(options = {}) {
  const { allowTerminated = false } = options;

  return async function attach(req, res, next) {
    try {
      req.proctor = await resolveProctorStatus(req, { allowTerminated });
    } catch (error) {
      // Never let this break a page load. Fail closed on content instead: no
      // verdict means questions are withheld, but the request still succeeds.
      req.proctor = { required: true, ok: false, reason: "lookup_failed" };
    }
    return next();
  };
}

/**
 * The same question, asked by test id instead of assignment id.
 *
 * `GET /api/tests/:id` is the other route that hands a student real question
 * content, and it carries no assignment in the request. Rather than trust the
 * caller to tell us which attempt it belongs to, we look for any live session
 * this student holds against this test.
 */
async function resolveProctorStatusForTest(req, testId) {
  const role = String(req.user?.role || "").toLowerCase();
  if (role === "admin" || role === "mentor") {
    return { required: false, ok: true, reason: "privileged_role" };
  }

  const test = await Test.findById(testId)
    .select("type isPracticeTest practiceTestSettings")
    .lean();

  if (!policyService.isProctoredTest(test)) {
    return { required: false, ok: true, reason: "unproctored_test" };
  }

  const session = await ProctorSession.findOne({
    userId: req.user.userId,
    testId,
    status: "active",
  }).lean();

  return session
    ? { required: true, ok: true, reason: "active", session }
    : { required: true, ok: false, reason: "no_session" };
}

/**
 * Should question content be included in this response?
 *
 * Used by routes that return a test body. When proctoring applies and is not
 * live, the response keeps its shape but arrives with an empty question list,
 * so nothing downstream crashes on a missing field.
 */
function mayServeQuestions(req) {
  const status = req.proctor;
  if (!status) return true;
  return !status.required || status.ok === true;
}

module.exports = {
  requireProctorSession,
  attachProctorStatus,
  resolveProctorStatus,
  resolveProctorStatusForTest,
  mayServeQuestions,
};
