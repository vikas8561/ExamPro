const ProctorSession = require("../models/ProctorSession");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const policyService = require("../services/proctorPolicy");
const browserRequirement = require("../services/browserRequirement");

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
async function resolveProctorStatus(
  req,
  { allowTerminated = false, assignmentId: explicitId = null, checkDisplay = false } = {}
) {
  const role = String(req.user?.role || "").toLowerCase();

  // Admins and mentors author and review tests; proctoring is not about them.
  if (role === "admin" || role === "mentor") {
    return { required: false, ok: true, reason: "privileged_role" };
  }

  // A caller that has already resolved the assignment (the coding routes accept
  // a testId instead of an assignmentId) passes it explicitly, so the check
  // cannot be skipped just because the request body named it differently.
  const assignmentId = explicitId ? String(explicitId) : findAssignmentId(req);
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

  // Not the caller's exam. This used to return `required: false, ok: true` and
  // leave the refusal to the route -- but the submit route never refused, so any
  // student could finalise another student's live attempt with their own
  // answers. A guard that waves a stranger through is not a guard; refuse here,
  // whatever the route does.
  if (String(assignment.userId) !== String(req.user.userId)) {
    return { required: true, ok: false, reason: "not_owner", assignmentId };
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

  const sebReason = sebFailureReason(session, { allowStale: allowTerminated });
  if (sebReason) {
    return { required: true, ok: false, reason: sebReason, session, assignmentId };
  }

  const displayReason = checkDisplay ? displayFailureReason(session, req) : null;
  if (displayReason) {
    return { required: true, ok: false, reason: displayReason, session, assignmentId };
  }

  return { required: true, ok: true, reason: "active", session, assignmentId };
}

/**
 * Is the external-monitor rule stopping this request? A reason string, or null.
 *
 * Asked only by the routes that hand out the question paper -- never by the
 * ones that save answers or hand the paper in. The rule is that an exam cannot
 * *start* with a second monitor attached; once it is running, the exam page
 * pauses itself when one appears, and refusing autosave or submit on top of
 * that would only risk losing work the student did legitimately.
 *
 * Two checks, both against the session the rule was frozen into:
 *   - this request comes from a browser the rule allows (a session opened in
 *     Chrome cannot have its paper fetched from Firefox), and
 *   - the page's last display report said one screen.
 */
function displayFailureReason(session, req) {
  if (session?.display?.enforced !== true) return null;

  const identity = browserRequirement.identifyBrowser(req.headers || {});
  const rule = session.policy?.requireBrowser || {};
  const verdict = browserRequirement.checkBrowser(identity, {
    allowedFamilies: Array.isArray(rule.families) ? rule.families : undefined,
    minMajor: Number.isFinite(rule.minMajor) ? rule.minMajor : undefined,
  });
  if (!verdict.ok) return verdict.code;

  if (session.display.state === "multiple") return "external_display";
  if (session.display.state !== "single") return "display_unverified";
  return null;
}

/**
 * Is Safe Exam Browser missing from a session that was opened under it?
 *
 * Returns a reason string when the request must be refused, or `null` when the
 * session is fine. This is where SEB is actually enforced — everything else is
 * detection and bookkeeping.
 *
 * The freshness half matters more than it looks. Checking only `verified` would
 * make the whole feature bypassable in one move: sit the gate inside SEB, copy
 * the login token and session id out into an ordinary browser, and stop sending
 * heartbeats. Nothing else in this file looks at heartbeat age, and no background
 * job reaps quiet sessions, so `verified` would stay true until the session's TTL
 * expired two days later.
 *
 * Being blocked here is recoverable and meant to be: the moment SEB checks in
 * again the referee refreshes `verifiedAt` and the next request goes through.
 *
 * `allowStale` is passed by the submit route, and only the submit route. If a
 * student's SEB crashes near the end of a paper, refusing their submission would
 * cost them work they did legitimately inside the lockdown, which is the outcome
 * this whole system exists to avoid. So a session that *was* verified may always
 * hand in, even if SEB is no longer answering.
 *
 * A session that was NEVER verified gets no such latitude: that is a student who
 * never opened SEB at all, and letting them submit would let answers composed
 * outside the lockdown in through the one door left open.
 */
function sebFailureReason(session, { allowStale = false } = {}) {
  const seb = session?.seb;
  if (!seb || seb.required !== true) return null;

  // SEB was required but has never existed for this student's operating system.
  // They are running the ordinary browser-based proctoring instead, which is
  // recorded on their submission for the reviewer.
  if (seb.fallbackReason) return null;

  if (seb.verified !== true) return "seb_required";
  if (allowStale) return null;
  if (!policyService.isSebProofFresh(seb)) return "seb_stale";
  return null;
}

/**
 * The reply for a request the proctoring rules refuse: `{ status, body }`.
 *
 * Shared by the guard below and by routes that run the same check themselves
 * (routes/coding.js), so a refusal reads the same wherever it comes from.
 */
function proctorRefusal(status) {
  // Someone else's attempt is an access problem, not a proctoring one.
  // Answered without `proctoringRequired`, so the exam page does not offer
  // a "start proctoring" or "reopen in SEB" screen that could never help.
  if (status.reason === "not_owner") {
    return {
      status: 403,
      body: { message: "This assignment does not belong to you.", reason: "not_owner", code: "not_owner" },
    };
  }

  // Stable `reason` codes, not message text: the frontend used to match on
  // wording and matched the wrong string. See routes/assignments.js.
  const MESSAGES = {
    terminated: "This attempt was ended by the proctoring system.",
    ended: "This attempt has already been handed in.",
    seb_required:
      "This test must be taken in Safe Exam Browser. Please start it again from your assignments page.",
    seb_stale:
      "Safe Exam Browser has stopped responding. Return to the exam window in Safe Exam Browser to continue.",
    external_display: browserRequirement.DISPLAY_MESSAGES.multiple,
    display_unverified: browserRequirement.DISPLAY_MESSAGES.unverified,
    browser_unsupported: "This test can only be taken in Google Chrome or Microsoft Edge.",
    browser_outdated: "Update Google Chrome or Microsoft Edge to the latest version to take this test.",
    browser_mobile: "This test needs a laptop or desktop computer with Google Chrome or Microsoft Edge.",
  };

  return {
    status: 403,
    body: {
      message:
        MESSAGES[status.reason] ||
        "This test must be taken with proctoring active. Please start the test from your assignments page.",
      proctoringRequired: true,
      // Lets the exam page show a "reopen in Safe Exam Browser" screen rather
      // than a generic proctoring error.
      sebRequired: status.reason === "seb_required" || status.reason === "seb_stale",
      reason: status.reason,
      code: status.reason,
    },
  };
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

      const refusal = proctorRefusal(status);
      return res.status(refusal.status).json(refusal.body);
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
  // Defaults to checking the display rule: every route using this guard is one
  // that serves the question paper.
  const { allowTerminated = false, checkDisplay = true } = options;

  return async function attach(req, res, next) {
    try {
      req.proctor = await resolveProctorStatus(req, { allowTerminated, checkDisplay });
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

  if (!session) {
    return { required: true, ok: false, reason: "no_session" };
  }

  const sebReason = sebFailureReason(session);
  if (sebReason) {
    return { required: true, ok: false, reason: sebReason, session };
  }

  // GET /api/tests/:id serves the paper, so the display rule applies here too.
  const displayReason = displayFailureReason(session, req);
  if (displayReason) {
    return { required: true, ok: false, reason: displayReason, session };
  }

  return { required: true, ok: true, reason: "active", session };
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
  sebFailureReason,
  displayFailureReason,
  requireProctorSession,
  attachProctorStatus,
  resolveProctorStatus,
  resolveProctorStatusForTest,
  mayServeQuestions,
  proctorRefusal,
};
