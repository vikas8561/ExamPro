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
  "context_menu",
  "blocked_key",
  "screen_share_stopped",
  "screen_share_wrong_surface",
  "second_monitor_detected",
  "permission_revoked",
  "heartbeat_lost",
  "page_tampered",
  "network_lost",
];

const VIOLATION_TYPE_SET = new Set(VIOLATION_TYPES);

/**
 * How much each violation counts against the student's allowance.
 *
 * Most things cost 1. A few cost more because they are unambiguous — you do not
 * open devtools or unplug the proctoring by accident, whereas a notification
 * stealing focus for half a second is genuinely easy to do by mistake.
 */
const VIOLATION_WEIGHTS = {
  tab_switch: 1,
  window_open: 1,
  tab_close: 1,
  browser_switch: 1,
  fullscreen_exit: 1,
  window_blur: 1,
  devtools_opened: 2,
  copy_attempt: 1,
  paste_attempt: 1,
  context_menu: 0,        // recorded for the report, never costs the student
  blocked_key: 0,         // recorded only; the key was already blocked
  screen_share_stopped: 2,
  screen_share_wrong_surface: 1,
  second_monitor_detected: 1,
  permission_revoked: 2,
  heartbeat_lost: 2,
  page_tampered: 2,
  network_lost: 0,        // recorded only; a dropped connection is not cheating
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
  detectDevtools: true,
  detectSecondMonitor: true,
  detectTampering: true,
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
  detectDevtools: false,
  detectSecondMonitor: false,
  detectTampering: false,
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
  VIOLATION_GROUPS,
  groupOf,
  BYPASSABLE_PERMISSIONS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_GRACE_MS,
  isProctoredTest,
  getPolicyForTest,
  decide,
  weightOf,
  isKnownViolationType,
};
