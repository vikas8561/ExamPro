const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const { authenticateToken, requireRole } = require("../middleware/auth");
const ProctorSession = require("../models/ProctorSession");
const ProctorSetting = require("../models/ProctorSetting");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const policyService = require("../services/proctorPolicy");
const sebVerify = require("../services/sebVerify");
const { buildSebConfig, computeConfigKey, optionsFor } = require("../services/sebConfig");

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
    // What the browser needs to render the right screen. No keys, ever — only
    // whether this attempt is running under SEB and, if not, why that was allowed.
    seb: {
      required: session.seb?.required === true,
      verified: session.seb?.verified === true,
      fallbackReason: session.seb?.fallbackReason || null,
    },
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

// ───────────────────────── Safe Exam Browser ─────────────────────────

/**
 * The SEB settings are read on every heartbeat — five seconds apart, for every
 * student sitting an exam — so they are memoised briefly. The same trick as the
 * session lookup in middleware/auth.js, and for the same reason.
 *
 * A stale read is harmless: the worst case is that an admin's change to the
 * global switch takes a few seconds to reach a running exam, and `seb.required`
 * is frozen per session anyway.
 */
const SEB_CONFIG_CACHE_MS = 15000;
let sebConfigCache = { value: null, at: 0 };

async function loadSebConfig() {
  if (sebConfigCache.value && Date.now() - sebConfigCache.at < SEB_CONFIG_CACHE_MS) {
    return sebConfigCache.value;
  }
  const value = await ProctorSetting.getSebConfig();
  sebConfigCache = { value, at: Date.now() };
  return value;
}

/** Drop the memo so an admin's change is visible immediately after they save. */
function invalidateSebConfigCache() {
  sebConfigCache = { value: null, at: 0 };
}

/**
 * The Config Key this deployment expects, as a one-item key list.
 *
 * Nothing is configured by hand. SEB derives the Config Key from the settings in
 * the config file it loaded, and this server wrote that file, so it can derive
 * the same value — the same on Windows, macOS and every SEB version. That is the
 * reason this uses the Config Key and not the Browser Exam Key, which would have
 * to be read out of SEB's Configuration Tool on each platform separately and
 * re-read at every SEB release.
 *
 * Memoised because it only depends on two origins that do not change while the
 * process is alive.
 */
const configKeyCache = new Map();

function sebKeysFor(req, sebConfig) {
  const options = optionsFor(req, sebConfig);
  if (!options.appOrigin) return [];

  // Every input to the config must appear here. A value that changes the file
  // but not this key would leave the server verifying against a Config Key for a
  // configuration no student is running — and the only symptom would be that
  // everyone suddenly fails verification.
  const cacheKey = [
    options.appOrigin,
    options.apiOrigin,
    options.urlFilter,
    options.quitPasswordHash,
  ].join("|");
  if (!configKeyCache.has(cacheKey)) {
    configKeyCache.set(cacheKey, computeConfigKey(options));
  }
  return [{ label: "Config Key", key: configKeyCache.get(cacheKey) }];
}

/**
 * Work out where this request stands with Safe Exam Browser.
 *
 * Verification hashes the Config Key against the exam URL **the server stored**
 * for this attempt — never a URL the browser reported. Accepting a
 * client-supplied URL would undo the whole point of the per-attempt nonce:
 * anyone holding a hash harvested for some other URL could simply claim that
 * URL back.
 */
async function resolveSebState({ req, assignment, test, sebConfig }) {
  const state = {
    required: false,
    verified: false,
    version: "",
    platform: "",
    matchedKeyLabel: "",
    fallbackReason: null,
    examUrl: "",
  };

  // Practice tests are unproctored, so SEB never applies to them.
  if (!sebConfig.required || !policyService.isProctoredTest(test)) {
    return state;
  }

  state.required = true;
  state.platform = sebVerify.detectOsFromUserAgent(req.headers["user-agent"]);

  const reported = (req.body && req.body.environment && req.body.environment.seb) || {};
  state.version = clean(reported.version, 40);
  state.examUrl = assignment.sebLaunch?.examUrl || "";

  const result = sebVerify.verifyKeyHash({
    examUrl: state.examUrl,
    candidateHash: reported.configKeyHash,
    keys: sebKeysFor(req, sebConfig),
  });

  if (result.ok) {
    state.verified = true;
    state.matchedKeyLabel = result.matchedLabel;
    return state;
  }

  // A student sitting inside SEB who fails this check sees only "Safe Exam
  // Browser required", which tells whoever is helping them nothing at all. There
  // are two quite different causes and this separates them at a glance: a URL
  // that does not match what the key was hashed against, or a key that genuinely
  // differs. Neither value is secret — both are derived from the config file any
  // student can download.
  const keys = sebKeysFor(req, sebConfig);
  console.warn("SEB verification failed:", {
    reason: result.reason,
    sebVersion: state.version || "(none reported)",
    platform: state.platform,
    urlTheServerHashedAgainst: state.examUrl || "(no launch recorded for this attempt)",
    urlTheBrowserWasOn: clean(reported.pageUrl, 300) || "(not reported)",
    urlsMatch: Boolean(state.examUrl) && state.examUrl === reported.pageUrl,
    hashFromSeb: reported.configKeyHash
      ? String(reported.configKeyHash).slice(0, 16) + "…"
      : "(SEB sent no Config Key)",
    hashExpected: keys.length
      ? sebVerify.computeExpectedHash(state.examUrl, keys[0].key).slice(0, 16) + "…"
      : "(no key — is FRONTEND_URL set?)",
    configKey: keys.length ? keys[0].key.slice(0, 16) + "…" : "(none)",
  });

  // SEB was required and could not be proved. On an operating system SEB has
  // never shipped for there is nothing the student could have done, so the exam
  // falls back to the ordinary browser-based proctoring and says so on the
  // record. Everywhere else this stays unverified and the session guard blocks.
  if (!sebVerify.sebAvailableForOs(state.platform)) {
    state.fallbackReason = "os_unsupported";
  }

  return state;
}

/**
 * What does this exam expect of the student's machine?
 *
 * Read-only, and deliberately so: the exam page has to know whether Safe Exam
 * Browser is required *before* it can decide whether to show the launch screen,
 * and opening a session to find out would be destructive. Creating a session
 * carries forward the assignment's violation count and can immediately terminate
 * the attempt, so a student who merely opened the page on a machine that cannot
 * run SEB could lose an exam they never started.
 */
router.get("/policy", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.query || {};
    if (!assignmentId || typeof assignmentId !== "string" || assignmentId.length !== 24) {
      return res.status(400).json({ message: "Valid assignmentId is required" });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      userId: req.user.userId,
    }).select("testId");
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const test = await Test.findById(assignment.testId).select(
      "type isPracticeTest practiceTestSettings"
    );
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const sebConfig = await loadSebConfig();
    const os = sebVerify.detectOsFromUserAgent(req.headers["user-agent"]);
    const available = sebVerify.sebAvailableForOs(os);

    return res.json({
      sebRequired: sebConfig.required && policyService.isProctoredTest(test),
      sebAvailableForOs: available,
      os,
      minVersion: os === "macos" ? sebConfig.minVersions.macos : sebConfig.minVersions.windows,
    });
  } catch (error) {
    next(error);
  }
});

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

    const sebConfig = await loadSebConfig();
    const sebState = await resolveSebState({ req, assignment, test, sebConfig });

    if (existing) {
      existing.lastHeartbeatAt = new Date();
      existing.environment = environmentDoc;

      // Sessions opened before SEB support was deployed have no `seb` block at
      // all. They are live exams and must resume, not crash.
      if (!existing.seb) existing.seb = {};

      // `required` is frozen at creation and never raised here. An admin
      // switching SEB on system-wide in the middle of an exam session must not
      // lock out a student already sitting the paper — they have no way to
      // restart inside SEB without losing their work. Lowering it is safe and
      // happens naturally, because a session created while the switch was off
      // simply carries `required: false`.
      if (sebState.verified) {
        existing.seb.verified = true;
        existing.seb.verifiedAt = new Date();
        existing.seb.version = sebState.version || existing.seb.version;
        existing.seb.platform = sebState.platform || existing.seb.platform;
        existing.seb.matchedKeyLabel = sebState.matchedKeyLabel || existing.seb.matchedKeyLabel;
        existing.seb.examUrl = sebState.examUrl || existing.seb.examUrl;
      }

      // Evidence is append-only. A student who reloads the exam in an ordinary
      // browser must not be able to erase the record of how it started.
      if (!existing.seb.fallbackReason && sebState.fallbackReason) {
        existing.seb.fallbackReason = sebState.fallbackReason;
      }

      // The rules are refreshed on resume so an admin's correction takes effect,
      // but the violation count deliberately carries over.
      //
      // The SEB half of the policy follows the SESSION, not this one request: an
      // SEB session that reloads without proof must stay on the SEB rulebook and
      // be blocked by the session guard, rather than quietly reverting to the
      // browser rulebook and asking for a screen share SEB cannot provide.
      existing.policy = policyService.applySebPolicy(policyService.getPolicyForTest(test), {
        required: existing.seb.required === true,
        verified: existing.seb.verified === true,
        fallbackReason: existing.seb.fallbackReason,
      });

      await existing.save();
      return res.json({ ...serializeSession(existing), resumed: true });
    }

    const policy = policyService.applySebPolicy(
      policyService.getPolicyForTest(test),
      sebState
    );

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
      seb: {
        required: sebState.required,
        verified: sebState.verified,
        verifiedAt: sebState.verified ? new Date() : null,
        version: sebState.version,
        platform: sebState.platform,
        matchedKeyLabel: sebState.matchedKeyLabel,
        fallbackReason: sebState.fallbackReason,
        examUrl: sebState.examUrl,
      },
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

    // Safe Exam Browser re-proves itself on every check-in.
    //
    // Verifying only once, when the session opens, would not gate anything: a
    // student could pass the gate inside SEB, copy their login token and session
    // id into an ordinary browser, and keep submitting answers for the rest of
    // the exam. The session guard therefore trusts a session only while this
    // proof is fresh, and this is what keeps it fresh.
    let sebStale = false;
    if (session.seb?.required === true && session.seb?.verified === true) {
      const wasFresh = policyService.isSebProofFresh(session.seb);
      const result = sebVerify.verifyKeyHash({
        examUrl: session.seb.examUrl,
        candidateHash: req.body?.sebKeyHash,
        keys: sebKeysFor(req, await loadSebConfig()),
      });

      if (result.ok) {
        session.seb.verifiedAt = new Date();
      } else {
        sebStale = !policyService.isSebProofFresh(session.seb);

        // Recorded once per absence — on the first failing check-in after a good
        // one — rather than every five seconds. Weight 0 on purpose: SEB's
        // JavaScript API fills these values in asynchronously on older builds and
        // can read back empty for a moment, and a momentary blank must never end
        // an exam. Blocking is the session guard's job, and it undoes itself the
        // moment SEB checks in again.
        if (wasFresh) {
          session.violations.push({
            timestamp: new Date(),
            violationType: "seb_integrity_lost",
            details: "Safe Exam Browser stopped confirming its exam key",
            weight: 0,
          });
        }
      }
    }

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
      // Lets the exam page explain itself before the next request is refused.
      sebStale,
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

    const batch = events.slice(0, 20);

    // When did each suppressing cause last happen? Tracked separately from the
    // dedupe map on purpose: writing causes into that map would make the cause
    // dedupe *itself* away and never be charged at all.
    //
    // A cause arriving in the same batch as its consequences has to count as
    // already seen, or the order the browser happened to send them in would
    // decide what the student pays.
    const causeSeenAt = new Map();
    for (const causeGroup of policyService.causeGroups()) {
      const previous = session.lastViolationByType?.get(causeGroup);
      if (previous) causeSeenAt.set(causeGroup, new Date(previous).getTime());
    }
    for (const event of batch) {
      const type = clean(event?.violationType, 60);
      if (!policyService.isKnownViolationType(type)) continue;
      const group = policyService.groupOf(type);
      if (policyService.causeGroups().includes(group)) causeSeenAt.set(group, now);
    }

    for (const event of batch) {
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

      let weight = policyService.weightOf(policy, violationType);

      // Turning off screen sharing also drags focus away and usually drops
      // fullscreen. Those are the same act, not three of them -- record them so
      // the reviewer sees the sequence, but charge only the cause.
      for (const causeGroup of policyService.causeGroups()) {
        if (causeGroup === dedupeKey) continue;
        if (!policyService.isConsequenceOf(causeGroup, dedupeKey)) continue;
        const causedAt = causeSeenAt.get(causeGroup);
        if (causedAt !== undefined && now - causedAt < policyService.CAUSAL_WINDOW_MS) {
          weight = 0;
          break;
        }
      }
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

/**
 * Read the SEB settings. Admin only.
 *
 * Browser Exam Keys are secrets — the server needs them in cleartext to compute
 * the expected hash — so this endpoint is the only place they are ever returned,
 * and the admin who pasted them is the only one who sees them again.
 */
router.get(
  "/settings/seb",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const settings = await ProctorSetting.getSettings();
      const keys = sebKeysFor(req, await loadSebConfig());
      return res.json({
        required: settings.sebRequired === true,
        urlFilter: settings.sebUrlFilter !== false,
        // Admin-only, like the bypass code. An invigilator has to be able to
        // read this off a screen to let a student out of a locked exam.
        quitPassword: settings.sebQuitPassword,
        // Shown so an admin can confirm the server has a key at all, and so a
        // support conversation can compare it against what SEB reports. It is
        // derived from the public config file, not a secret.
        configKey: keys.length ? keys[0].key : null,
        configured: keys.length > 0,
        minVersions: {
          windows: settings.sebMinVersions?.windows || "3.10.0",
          macos: settings.sebMinVersions?.macos || "3.6.0",
        },
        updatedAt: settings.sebUpdatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * The exact .seb configuration students receive, for the admin to load into the
 * SEB Configuration Tool and read the Browser Exam Key from.
 *
 * This is the step that makes the key meaningful, and it only works because the
 * file is identical for every student: SEB derives the key from its configuration,
 * so the file the admin measures has to be the file students actually run.
 *
 * Returned as JSON text rather than as a download, because a browser download
 * cannot carry the admin's Authorization header. The admin page turns it into a
 * file client-side.
 */
router.get(
  "/settings/seb/config",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const appOrigin = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
      if (!appOrigin) {
        return res.status(500).json({
          message: "FRONTEND_URL is not set on this server, so no configuration can be built.",
        });
      }
      return res.json({ config: buildSebConfig(optionsFor(req, await loadSebConfig())) });
    } catch (error) {
      next(error);
    }
  }
);

/** Issue a new Safe Exam Browser quit password. Admin only. */
router.post(
  "/settings/seb/quit-password/rotate",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const settings = await ProctorSetting.rotateSebQuitPassword(req.user.userId);
      invalidateSebConfigCache();
      return res.json({
        quitPassword: settings.sebQuitPassword,
        updatedAt: settings.sebUpdatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/** Change the SEB settings. Admin only. */
router.put(
  "/settings/seb",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { required, urlFilter, minVersions } = req.body || {};

      // Turning the switch on when the server cannot derive a Config Key would
      // block every student on Windows and macOS out of their exams, because
      // nothing could ever verify. FRONTEND_URL being unset is the only way that
      // happens, and it is better caught here than during an exam.
      if (required === true && sebKeysFor(req, await loadSebConfig()).length === 0) {
        return res.status(400).json({
          message:
            "FRONTEND_URL is not set on this server, so no Safe Exam Browser " +
            "configuration can be built and no student could be verified.",
        });
      }

      const settings = await ProctorSetting.updateSeb(
        { required, urlFilter, minVersions },
        req.user.userId
      );
      invalidateSebConfigCache();

      return res.json({
        required: settings.sebRequired === true,
        urlFilter: settings.sebUrlFilter !== false,
        minVersions: {
          windows: settings.sebMinVersions?.windows || "3.10.0",
          macos: settings.sebMinVersions?.macos || "3.6.0",
        },
        updatedAt: settings.sebUpdatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
