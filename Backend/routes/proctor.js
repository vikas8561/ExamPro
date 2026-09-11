const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { authenticateToken, requireRole } = require("../middleware/auth");
const ProctorSession = require("../models/ProctorSession");
const ProctorSetting = require("../models/ProctorSetting");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const policyService = require("../services/proctorPolicy");

/**
 * The referee.
 *
 * The browser reports what it sees; every decision about what that means is
 * made here. A student can edit the exam page all they like — the violation
 * count they can reach is only a display copy of the number held on the server.
 */

/** Trim free text coming from the browser so nothing oversized reaches the DB. */
const clean = (value, max = 300) =>
  typeof value === "string" ? value.slice(0, max) : "";

/** Shape a session for the browser. Never leaks the OTP or another user's data. */
function serializeSession(session) {
  return {
    sessionId: session._id,
    status: session.status,
    policy: session.policy,
    violationCount: session.violationCount,
    permissions: session.permissions,
    bypassGranted: session.bypass?.used === true,
    bypassScope: session.bypass?.scope || [],
    terminatedReason: session.terminatedReason,
  };
}

/**
 * Load the caller's own active session. Sessions are always looked up by
 * session id *and* user id, so one student can never touch another's.
 */
async function loadOwnSession(req) {
  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== "string" || sessionId.length !== 24) {
    return null;
  }
  return ProctorSession.findOne({ _id: sessionId, userId: req.user.userId });
}

// ───────────────────────── Session lifecycle ─────────────────────────

/**
 * Open a proctoring session, or resume the one already running.
 *
 * Resuming matters: a student who refreshes mid-exam must come back to the same
 * session with the same violation count, otherwise refreshing would be a free
 * way to wipe the slate.
 */
router.post("/session/start", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, testKind, environment } = req.body || {};
    const userId = req.user.userId;

    if (!assignmentId || typeof assignmentId !== "string" || assignmentId.length !== 24) {
      return res.status(400).json({ message: "Valid assignmentId is required" });
    }

    // The assignment must belong to the caller. This is what stops a student
    // opening a proctoring session against somebody else's exam.
    const assignment = await Assignment.findOne({ _id: assignmentId, userId });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.status === "Completed") {
      return res.status(400).json({ message: "This test has already been submitted" });
    }
    if (assignment.status === "Cancelled") {
      return res.status(400).json({ message: "This test has been cancelled" });
    }

    const test = await Test.findById(assignment.testId).select(
      "type allowedTabSwitches isPracticeTest practiceTestSettings"
    );
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const policy = policyService.getPolicyForTest(test);

    const env = environment || {};
    const environmentDoc = {
      browser: clean(env.browser, 120),
      isBrave: env.isBrave === true,
      platform: clean(env.platform, 120),
      keyboardLockSupported: env.keyboardLockSupported === true,
      secondMonitor: ["yes", "no", "unknown"].includes(env.secondMonitor)
        ? env.secondMonitor
        : "unknown",
    };

    // Resume an existing session rather than handing out a fresh counter.
    const existing = await ProctorSession.findOne({
      userId,
      assignmentId,
      status: "active",
    });

    if (existing) {
      existing.lastHeartbeatAt = new Date();
      existing.environment = environmentDoc;
      // Rules are refreshed on resume so an admin's correction takes effect,
      // but the violation count deliberately carries over.
      existing.policy = policy;
      await existing.save();
      return res.json({ ...serializeSession(existing), resumed: true });
    }

    // A session that was already terminated must not be reopened by reloading.
    const terminated = await ProctorSession.findOne({
      userId,
      assignmentId,
      status: "terminated",
    });
    if (terminated) {
      return res.status(403).json({
        message: "This attempt was ended by the proctoring system and cannot be resumed.",
        terminatedReason: terminated.terminatedReason,
      });
    }

    const session = await ProctorSession.create({
      userId,
      assignmentId,
      testId: assignment.testId,
      testKind: testKind === "coding" ? "coding" : "assigned",
      policy,
      environment: environmentDoc,
      // Carry forward anything already recorded on the assignment, so a student
      // who reloads after the session document expired does not start clean.
      violationCount: assignment.tabViolationCount || 0,
      lastHeartbeatAt: new Date(),
    });

    // The carried-forward count may already be over the limit — that is exactly
    // what happens if a student reloads to escape a cancellation. Rule on it
    // here rather than waiting for them to commit one more violation.
    const carriedVerdict = policyService.decide(policy, session.violationCount);
    if (carriedVerdict.action === "terminate") {
      session.status = "terminated";
      session.terminatedReason = "Violation limit was already exceeded on a previous attempt";
      session.endedAt = new Date();
      await session.save();

      return res.status(403).json({
        message: "This attempt was ended by the proctoring system and cannot be resumed.",
        terminatedReason: session.terminatedReason,
      });
    }

    return res.json({ ...serializeSession(session), resumed: false });
  } catch (error) {
    next(error);
  }
});

/**
 * "Still here." Sent every few seconds.
 *
 * This is what catches the things a page cannot report about itself: closing
 * the tab, killing the page's JavaScript, pausing it in devtools, or cutting
 * the network so violation reports never arrive. Going quiet is itself treated
 * as a violation, so silencing the reporting no longer helps.
 */
router.post("/session/heartbeat", authenticateToken, async (req, res, next) => {
  try {
    const session = await loadOwnSession(req);
    if (!session) {
      return res.status(404).json({ message: "Proctoring session not found" });
    }

    if (session.status !== "active") {
      return res.json({
        action: session.status === "terminated" ? "terminate" : "ended",
        status: session.status,
        terminatedReason: session.terminatedReason,
      });
    }

    const graceMs = session.policy?.heartbeatGraceMs || policyService.HEARTBEAT_GRACE_MS;
    const silentFor = Date.now() - new Date(session.lastHeartbeatAt).getTime();

    session.lastHeartbeatAt = new Date();

    // The browser went quiet and has now come back. Charge it once for the gap.
    if (silentFor > graceMs && session.policy?.enabled) {
      session.heartbeatLostCount += 1;
      await session.save();

      return applyViolation(
        session,
        "heartbeat_lost",
        `Proctoring stopped reporting for ${Math.round(silentFor / 1000)} seconds`,
        res,
        next
      );
    }

    await session.save();

    return res.json({
      action: "continue",
      status: session.status,
      count: session.violationCount,
      limit: session.policy?.allowedViolations ?? -1,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Report violations. The server counts them and returns the verdict.
 *
 * The browser sends what it observed and does whatever it is told: carry on,
 * show a warning, or submit the test. It never reaches this conclusion itself.
 */
router.post("/session/event", authenticateToken, async (req, res, next) => {
  try {
    const session = await loadOwnSession(req);
    if (!session) {
      return res.status(404).json({ message: "Proctoring session not found" });
    }

    if (session.status !== "active") {
      return res.json({
        action: session.status === "terminated" ? "terminate" : "ended",
        status: session.status,
        count: session.violationCount,
        limit: session.policy?.allowedViolations ?? -1,
        terminatedReason: session.terminatedReason,
      });
    }

    const events = Array.isArray(req.body?.events)
      ? req.body.events
      : [{ violationType: req.body?.violationType, details: req.body?.details }];

    session.lastHeartbeatAt = new Date();

    const policy = session.policy || {};
    const dedupeWindow = policy.dedupeWindowMs || 3000;
    const now = Date.now();
    let charged = false;

    for (const event of events.slice(0, 20)) {
      const violationType = clean(event?.violationType, 60);
      if (!policyService.isKnownViolationType(violationType)) continue;

      // One action can fire several browser events, and not always the same
      // one: a tab switch makes the browser fire both `visibilitychange` and
      // `blur`, which arrive as `tab_switch` and `window_blur` together.
      // De-duplicating on the group rather than the exact type means the
      // student is charged once for the act, not once per signal that spotted
      // it.
      const dedupeKey = policyService.groupOf(violationType);
      const lastSeen = session.lastViolationByType?.get(dedupeKey);
      if (lastSeen && now - new Date(lastSeen).getTime() < dedupeWindow) {
        continue;
      }
      session.lastViolationByType.set(dedupeKey, new Date());

      const weight = policyService.weightOf(policy, violationType);
      session.violations.push({
        timestamp: new Date(),
        violationType,
        details: clean(event?.details, 300),
        weight,
      });
      session.violationCount += weight;
      if (weight > 0) charged = true;
    }

    // Nothing new was actually charged — acknowledge without interrupting.
    if (!charged) {
      await session.save();
      return res.json({
        action: "continue",
        count: session.violationCount,
        limit: policy.allowedViolations ?? -1,
      });
    }

    const last = session.violations[session.violations.length - 1];
    return applyViolation(session, last.violationType, last.details, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * Reach a verdict, persist it, and mirror it onto the assignment so the record
 * survives even if the browser never comes back to submit.
 */
async function applyViolation(session, violationType, details, res, next) {
  try {
    const policy = session.policy || {};
    const verdict = policyService.decide(policy, session.violationCount);

    if (verdict.action === "terminate") {
      session.status = "terminated";
      session.terminatedReason = `Violation limit exceeded (${violationType})`;
      session.endedAt = new Date();
    }

    await session.save();

    // Keep the assignment in step, so a student who closes the laptop rather
    // than submitting still has the violations on record.
    await Assignment.updateOne(
      { _id: session.assignmentId, userId: session.userId },
      {
        $set: {
          tabViolationCount: session.violationCount,
          lastViolationAt: new Date(),
          ...(verdict.action === "terminate" ? { cancelledDueToViolation: true } : {}),
        },
      }
    ).catch(() => {
      // Mirroring is best effort; the session document remains authoritative.
    });

    return res.json({
      action: verdict.action,
      count: verdict.count,
      limit: verdict.limit,
      final: verdict.final === true,
      violationType,
      details,
      terminatedReason: session.terminatedReason || null,
    });
  } catch (error) {
    next(error);
  }
}

/** Record which permissions were granted. Text only — no media is ever read. */
router.post("/session/permissions", authenticateToken, async (req, res, next) => {
  try {
    const session = await loadOwnSession(req);
    if (!session) {
      return res.status(404).json({ message: "Proctoring session not found" });
    }

    const granted = req.body?.permissions || {};
    session.permissions = {
      screen: granted.screen === true,
      camera: granted.camera === true,
      microphone: granted.microphone === true,
      location: granted.location === true,
    };
    session.lastHeartbeatAt = new Date();
    await session.save();

    return res.json({ ok: true, permissions: session.permissions });
  } catch (error) {
    next(error);
  }
});

/** Close the session on a normal submit. */
router.post("/session/end", authenticateToken, async (req, res, next) => {
  try {
    const session = await loadOwnSession(req);
    if (!session) {
      return res.status(404).json({ message: "Proctoring session not found" });
    }

    if (session.status === "active") {
      session.status = "ended";
      session.endedAt = new Date();
      await session.save();
    }

    return res.json({ ok: true, status: session.status });
  } catch (error) {
    next(error);
  }
});

// ───────────────────────── The global bypass OTP ─────────────────────────

// Safety net on top of the per-session attempt limit below, in case someone
// tries to spread guesses across many sessions.
const bypassLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { message: "Too many bypass attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Waive the camera, microphone and location requirements for a student whose
 * hardware is genuinely broken.
 *
 * It waives those three and nothing else: fullscreen, tab switching, keyboard,
 * clipboard and devtools rules all stay fully active, and the fact that a
 * bypass was used is recorded on the submission for the reviewer to see.
 */
router.post("/session/bypass", authenticateToken, bypassLimiter, async (req, res, next) => {
  try {
    const session = await loadOwnSession(req);
    if (!session) {
      return res.status(404).json({ message: "Proctoring session not found" });
    }
    if (session.status !== "active") {
      return res.status(400).json({ message: "This proctoring session is no longer active" });
    }

    if (session.bypass?.lockedUntil && session.bypass.lockedUntil > new Date()) {
      const waitSeconds = Math.ceil((session.bypass.lockedUntil - new Date()) / 1000);
      return res.status(429).json({
        message: `Too many incorrect codes. Please wait ${waitSeconds} seconds.`,
      });
    }

    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
    const valid = await ProctorSetting.verifyOtp(otp);

    if (!valid) {
      session.bypass.failedAttempts = (session.bypass.failedAttempts || 0) + 1;
      if (session.bypass.failedAttempts >= 5) {
        session.bypass.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
        session.bypass.failedAttempts = 0;
      }
      await session.save();
      return res.status(400).json({ message: "Invalid code" });
    }

    const scope = session.policy?.bypassablePermissions?.length
      ? session.policy.bypassablePermissions
      : policyService.BYPASSABLE_PERMISSIONS;

    session.bypass.used = true;
    session.bypass.usedAt = new Date();
    session.bypass.scope = scope;
    session.bypass.failedAttempts = 0;
    session.bypass.lockedUntil = null;
    await session.save();

    return res.json({ granted: true, scope });
  } catch (error) {
    next(error);
  }
});

// ───────────────────────── Admin settings ─────────────────────────

/** Show the current global bypass code. Admin only — never sent to a student. */
router.get(
  "/settings/otp",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const settings = await ProctorSetting.getSettings();
      return res.json({
        otp: settings.bypassOtp,
        updatedAt: settings.bypassOtpUpdatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/** Replace the global bypass code with a new random one. Admin only. */
router.post(
  "/settings/otp/rotate",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const settings = await ProctorSetting.rotateOtp(req.user.userId);
      return res.json({
        otp: settings.bypassOtp,
        updatedAt: settings.bypassOtpUpdatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
