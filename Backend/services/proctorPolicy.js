/**
 * Proctoring policy — the single source of truth for every proctoring rule.
 *
 * Nothing anywhere else in the codebase decides what counts as a violation, how
 * many are allowed, or which permissions an exam needs. Change a rule here and
 * it changes for the server, for the browser, and for the pre-exam screen at
 * once, because the browser is handed this exact object when a session starts.
 *
 * The browser is a sensor. This file is the rulebook. Backend/routes/proctor.js
 * is the referee that applies it.
 */

// Every violation the system knows about. Kept in sync with the violationType
// enums on TestSubmission and Assignment — add here first, then to the models.
const VIOLATION_TYPES = [
  // Legacy types, still emitted and still present in historical submissions.
  "tab_switch",
  "window_open",
  "tab_close",
  "browser_switch",
  "fullscreen_exit",
  // Types introduced with the rebuilt system.
  "window_blur",
  "devtools_opened",
  "copy_attempt",
  "paste_attempt",
  "paste_internal",
  "context_menu",
  "blocked_key",
  "screen_share_stopped",
  "screen_share_wrong_surface",
  "second_monitor_detected",
  "permission_revoked",
  "heartbeat_lost",
  "page_tampered",
  "network_lost",
  // Safe Exam Browser stopped proving it was there mid-exam.
  "seb_integrity_lost",
];

const VIOLATION_TYPE_SET = new Set(VIOLATION_TYPES);

/**
 * How much each violation counts against the student's allowance.
 *
 * The governing rule, learned the hard way:
 *
 *   Only events with spec-defined, operating-system-independent meaning may
 *   count towards cancelling an exam. Everything platform-dependent is recorded
 *   for the reviewer and charged nothing.
 *
 * Students on macOS and Linux were having papers auto-submitted by heuristics
 * that misfire differently on every platform — window measurements that depend
 * on display scaling and browser zoom, focus flags that cannot tell the browser's
 * own address bar from another application, screen-capture tracks that blink
 * during a compositor renegotiation. A heuristic that is wrong on one desktop
 * environment must not be able to end somebody's exam.
 *
 * Anything scored 0 still appears in full on the submission report, with its
 * timestamp. A reviewer looking at a suspicious paper sees "left the exam window
 * 14 times"; the system simply will not act on it unaided.
 */
const VIOLATION_WEIGHTS = {
  // ── Charged: unambiguous, and identical on every operating system ──
  //
  // `visibilitychange`, `fullscreenchange` and the clipboard events are defined
  // by specification and behave the same on Windows, macOS and Linux.
  tab_switch: 1,
  window_open: 1,
  tab_close: 1,
  browser_switch: 1,
  fullscreen_exit: 1,
  copy_attempt: 1,
  screen_share_wrong_surface: 1,

  // A paste of text that did not come from inside the exam. Still charged: the
  // clipboard events are spec-defined and identical on every operating system,
  // and content arriving from outside is the thing this detector exists for.
  paste_attempt: 1,

  // A capture track actually ending is unambiguous. Scored 1 rather than 2
  // because the exam is already blocked until the student shares again — the
  // block is the enforcement, the score should not punish twice.
  screen_share_stopped: 1,

  // Revoking a permission mid-exam is a deliberate act with a clear signal.
  permission_revoked: 1,

  // A browser that stops reporting is the one anti-tamper signal worth scoring,
  // but it is also what a dropped connection looks like, so it is scored once
  // rather than twice.
  heartbeat_lost: 1,

  // Detected by window growth sustained over several seconds. Reduced from 2:
  // a single detection should never be able to exhaust a small allowance on its
  // own, because this is the check that most recently ended an exam wrongly.
  devtools_opened: 1,

  // ── Recorded only: real information, but platform-dependent ──

  // `document.hasFocus()` is false whenever focus sits in BROWSER CHROME — the
  // address bar, an extension popup, or Chrome's "you are sharing your screen"
  // bar. Clicking Hide on that bar is indistinguishable from switching to
  // another application, and which one the browser reports differs by operating
  // system and window manager. In fullscreen a genuine app switch also fires
  // `visibilitychange`, which IS charged, so little enforcement is lost.
  window_blur: 0,

  // `screen.isExtended` is unavailable in some browsers and deliberately hidden
  // by Brave's anti-fingerprinting. Worth showing a reviewer, not worth scoring.
  second_monitor_detected: 0,

  // Heuristic pattern-matching on injected DOM. Browser extensions a student
  // has no idea are installed can trip it.
  page_tampered: 0,

  // A paste of text the student had copied from inside the exam themselves.
  // Cut-and-paste inside a code editor is how code gets written, not how an
  // answer gets smuggled in, and charging it ended coding attempts on the first
  // refactor. The browser decides internal from external by matching what was
  // pasted against what it saw copied; see detectors/clipboard.js. Recorded in
  // full, so a reviewer still sees a paper that was assembled by pasting.
  paste_internal: 0,

  context_menu: 0,        // recorded for the report, never costs the student
  blocked_key: 0,         // recorded only; the key was already blocked
  network_lost: 0,        // recorded only; a dropped connection is not cheating

  // SEB's key stopped verifying. Recorded, never charged — and deliberately so.
  // The value comes from SEB's JavaScript API, which on older builds is filled in
  // asynchronously and can read back empty for a moment. Charging this would let
  // a transient blank end an exam irreversibly. Enforcement happens instead in
  // middleware/proctorSession.js, which blocks the session while the proof is
  // stale and unblocks it the moment SEB checks in again.
  seb_integrity_lost: 0,
};

/**
 * Violations the browser is allowed to report more than once in quick
 * succession without each report costing the student again. Leaving fullscreen
 * fires several events in a row on some browsers; the student should pay once.
 */
const DEDUPE_WINDOW_MS = 3000;

/**
 * Violation types that describe the same underlying act.
 *
 * De-duplicating by type alone is not enough, and this was a real bug: a single
 * tab switch makes the browser fire both `visibilitychange` and `blur`, so the
 * student was reported for `tab_switch` AND `window_blur` in the same instant
 * and charged twice for one action.
 *
 * Grouping fixes that at the only place it can be fixed reliably — the server.
 * Types sharing a group share one dedupe window, so whichever signal notices
 * first is the one that counts and the rest are ignored.
 */
const VIOLATION_GROUPS = {
  // "The student is no longer looking at the exam." Several browser events all
  // mean this, and which ones fire depends on the OS and the browser.
  tab_switch: "left_exam",
  window_blur: "left_exam",
  window_open: "left_exam",
  tab_close: "left_exam",
  browser_switch: "left_exam",

  // Leaving fullscreen frequently coincides with losing focus, but it is a
  // distinct act with its own blocking overlay, so it keeps its own group.
  fullscreen_exit: "fullscreen",

  screen_share_stopped: "screen_share",
  screen_share_wrong_surface: "screen_share",
};

/** The dedupe key for a violation: its group, or the type itself if ungrouped. */
function groupOf(violationType) {
  return VIOLATION_GROUPS[violationType] || violationType;
}

/**
 * One act, one charge -- even when the act causes other violations.
 *
 * Turning screen sharing off is a single decision, but the browser makes it
 * look like three. Chrome's "you are sharing your screen" bar takes focus as it
 * disappears, which arrives as `left_exam`, and dropping the share commonly
 * drops fullscreen too, which arrives as `fullscreen`. Grouping cannot fix this
 * -- these really are distinct groups, and a student who genuinely alt-tabs
 * should still pay for it -- so the cause suppresses its own consequences for a
 * few seconds instead.
 *
 * The consequences are still recorded, at weight zero, exactly like a blocked
 * key: the reviewer sees the whole sequence, the student is charged once.
 */
const CAUSAL_WINDOW_MS = 5000;

const CONSEQUENCES_OF = {
  screen_share: ["left_exam", "fullscreen"],
};

/** Is `group` something `causeGroup` would have caused by itself? */
function isConsequenceOf(causeGroup, group) {
  return (CONSEQUENCES_OF[causeGroup] || []).includes(group);
}

/** The cause groups that suppress consequences, for the caller to scan. */
function causeGroups() {
  return Object.keys(CONSEQUENCES_OF);
}

// The browser pings this often; the server allows this long before it decides
// the browser has gone quiet. Three missed pings plus a little slack.
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_GRACE_MS = 20000;

/** Permissions the OTP can waive. Screen sharing is deliberately not on this list. */
const BYPASSABLE_PERMISSIONS = ["camera", "microphone", "location"];

/**
 * The strict policy, used by assigned tests and coding tests.
 * `allowedViolations` is filled in per-test from the admin's setting.
 */
const STRICT = {
  enabled: true,
  requiredPermissions: ["screen", "camera", "microphone", "location"],
  bypassablePermissions: BYPASSABLE_PERMISSIONS,
  requireFullscreen: true,
  requireEntireScreenShare: true,
  blockKeyboard: true,
  blockClipboard: true,
  blockContextMenu: true,
  // Let a student copy and paste within their own answer. Turning this off
  // restores a clipboard that is shut in both directions, at the cost of making
  // coding tests very hard to sit -- see detectors/clipboard.js for the
  // trade-off this setting picks between.
  allowInternalClipboard: true,
  detectDevtools: true,
  detectSecondMonitor: true,
  detectTampering: true,
  // Capture a frame of the screen alongside each violation, from the share the
  // student already granted. Reverses this system's original "no images ever"
  // position, so it is written down here rather than hidden in a component.
  captureOnViolation: true,
  // Chrome extension ids the exam page should probe for. Empty by default: the
  // probe only works against extensions that expose a web-accessible resource,
  // which Manifest V3 has made the exception rather than the rule, so a
  // hardcoded list would mostly be decoration. Populated per deployment with the
  // ids a school actually has a problem with.
  blockedExtensionIds: [],
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  heartbeatGraceMs: HEARTBEAT_GRACE_MS,
  dedupeWindowMs: DEDUPE_WINDOW_MS,
  violationWeights: VIOLATION_WEIGHTS,
};

/** Proctoring switched off entirely — practice tests and DSA practice. */
const OFF = {
  enabled: false,
  requiredPermissions: [],
  bypassablePermissions: [],
  requireFullscreen: false,
  requireEntireScreenShare: false,
  blockKeyboard: false,
  blockClipboard: false,
  blockContextMenu: false,
  allowInternalClipboard: true,
  detectDevtools: false,
  detectSecondMonitor: false,
  detectTampering: false,
  captureOnViolation: false,
  blockedExtensionIds: [],
  heartbeatIntervalMs: 0,
  heartbeatGraceMs: 0,
  dedupeWindowMs: DEDUPE_WINDOW_MS,
  violationWeights: {},
  allowedViolations: -1,
};

/**
 * Work out whether a test is proctored at all.
 *
 * Practice tests are excluded two ways because the data allows both: an explicit
 * `isPracticeTest` flag and a `type` of "practice". DSA practice never creates a
 * Test document, so it never reaches this code.
 */
function isProctoredTest(test) {
  if (!test) return false;
  if (test.isPracticeTest === true) return false;
  if (String(test.type || "").toLowerCase() === "practice") return false;
  if (test.practiceTestSettings && test.practiceTestSettings.noProctoring === true) {
    // Only trust this flag on tests that actually look like practice tests, since
    // it defaults to true on the schema for every document.
    if (test.isPracticeTest === true) return false;
  }
  return true;
}

/**
 * Build the rulebook for one test.
 *
 * `allowedViolations` comes from the admin's "Allowed Tab Switches" field:
 *   -1 → unlimited, warn but never cancel
 *    0 → cancel on the first violation
 *    n → warn up to n, cancel on n+1
 */
function getPolicyForTest(test) {
  if (!isProctoredTest(test)) {
    return { ...OFF };
  }

  const configured = test.allowedTabSwitches;
  const allowedViolations =
    configured === -1 || (typeof configured === "number" && configured >= 0)
      ? configured
      : 0;

  return { ...STRICT, allowedViolations };
}

/**
 * How long a session may go without SEB re-proving itself before it is blocked.
 *
 * The browser re-sends its key hash on every heartbeat (every 5s), so four
 * missed beats is a real absence rather than a slow network. This is what stops
 * the obvious attack on a check done only at session start: pass the gate inside
 * SEB, copy the login token and session id into an ordinary browser, and simply
 * never check in again. Without a freshness window that session stays valid
 * forever.
 */
const SEB_GRACE_MS = 30000;

/**
 * Has SEB proved itself recently enough for this session to be trusted?
 *
 * Pure, so the session guard and the heartbeat handler cannot drift apart on
 * what "recent enough" means.
 */
function isSebProofFresh(seb, now = Date.now()) {
  if (!seb || seb.verified !== true || !seb.verifiedAt) return false;
  return now - new Date(seb.verifiedAt).getTime() <= SEB_GRACE_MS;
}

/**
 * How this attempt should be described on the finished submission.
 *
 * Shared so the ordinary submit path and the background sweep that finalises
 * abandoned attempts cannot disagree — they write the proctoring block
 * independently, and a swept attempt losing its SEB status would quietly hide
 * exactly the attempts most worth looking at.
 */
function sebSubmissionStatus(seb) {
  if (!seb || seb.required !== true) {
    return { proctorSebStatus: "not_required", proctorSebFallbackReason: null };
  }
  if (seb.fallbackReason) {
    return { proctorSebStatus: "fallback", proctorSebFallbackReason: seb.fallbackReason };
  }
  if (seb.verified === true) {
    return { proctorSebStatus: "verified", proctorSebFallbackReason: null };
  }
  return { proctorSebStatus: "fallback", proctorSebFallbackReason: "not_verified" };
}

/**
 * Adjust the rulebook for a session running inside Safe Exam Browser.
 *
 * Most of the web-based proctoring is redundant under SEB — and several parts of
 * it are actively impossible, which is the real reason for this function:
 *
 *   - SEB supports no `getDisplayMedia` on any platform, so screen sharing can
 *     never be granted. Leaving it in `requiredPermissions` would disable the
 *     Begin Test button permanently.
 *   - `getUserMedia` works on SEB for macOS but silently fails on SEB for
 *     Windows, so a camera requirement would block every Windows student.
 *   - SEB's kiosk mode is not the Fullscreen API. `document.fullscreenElement`
 *     is empty, so the fullscreen detector would fire immediately and show a
 *     "return to fullscreen" overlay that can never be satisfied.
 *   - Display count is enforced natively by SEB's own `allowedDisplaysMaxNumber`,
 *     better than `screen.isExtended` ever managed.
 *
 * What stays on is everything SEB does not already cover: the keyboard allowlist
 * (SEB blocks system shortcuts, but only this knows a textarea from a radio
 * button), the clipboard rules, focus reporting, tamper detection and the
 * heartbeat.
 */
function applySebPolicy(policy, sebState) {
  const seb = {
    required: sebState?.required === true,
    verified: sebState?.verified === true,
    fallbackReason: sebState?.fallbackReason || null,
    graceMs: SEB_GRACE_MS,
  };

  // Not running under SEB: the web-based rules are all that stand between the
  // student and the exam, so nothing is relaxed. This is also the Linux path.
  if (!seb.verified) {
    return { ...policy, seb };
  }

  return {
    ...policy,
    seb,
    requiredPermissions: [],
    bypassablePermissions: [],
    requireFullscreen: false,
    requireEntireScreenShare: false,
    detectSecondMonitor: false,
    // There is no screen share inside SEB — it supports no `getDisplayMedia` on
    // any platform — so there is nothing to capture from. SEB's own lockdown is
    // what replaces the evidence here.
    captureOnViolation: false,
  };
}

/**
 * The referee's verdict for a violation count.
 *
 * This is the only place that decides a student's fate, and it runs on the
 * server. The browser displays whatever comes back; it never works this out for
 * itself, which is what stops a student editing the page to reset their count.
 */
function decide(policy, weightedCount) {
  const limit = policy.allowedViolations;

  if (!policy.enabled) {
    return { action: "continue", count: weightedCount, limit: -1 };
  }

  // Unlimited: always warn, never cancel.
  if (limit === -1) {
    return { action: "warn", count: weightedCount, limit: -1 };
  }

  if (weightedCount > limit) {
    return { action: "terminate", count: weightedCount, limit };
  }

  // Nothing was actually charged (a weight-0 event) — no need to interrupt.
  if (weightedCount === 0) {
    return { action: "continue", count: weightedCount, limit };
  }

  return {
    action: "warn",
    count: weightedCount,
    limit,
    // `final` drives the wording of the warning: this is the last one they get.
    final: weightedCount === limit,
  };
}

/** What one violation costs. Unknown types cost 1 so nothing slips through free. */
function weightOf(policy, violationType) {
  const weights = policy.violationWeights || VIOLATION_WEIGHTS;
  const weight = weights[violationType];
  return typeof weight === "number" ? weight : 1;
}

function isKnownViolationType(violationType) {
  return VIOLATION_TYPE_SET.has(violationType);
}

module.exports = {
  VIOLATION_TYPES,
  VIOLATION_WEIGHTS,
  CAUSAL_WINDOW_MS,
  isConsequenceOf,
  causeGroups,
  VIOLATION_GROUPS,
  groupOf,
  BYPASSABLE_PERMISSIONS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_GRACE_MS,
  SEB_GRACE_MS,
  isSebProofFresh,
  sebSubmissionStatus,
  isProctoredTest,
  getPolicyForTest,
  applySebPolicy,
  decide,
  weightOf,
  isKnownViolationType,
};
