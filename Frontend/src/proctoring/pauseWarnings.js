/**
 * One act, one dialog.
 *
 * Some violations pause the exam with a dialog of their own -- leaving
 * fullscreen, stopping the screen share, plugging in a monitor -- and the
 * server answers the same act with a warning. Those used to be two dialogs with
 * two buttons: the student pressed "Continue Test" and found the pause dialog
 * still waiting underneath. And because the pause appears at once while the
 * warning takes a batch delay and a round trip, a student who cleared the pause
 * quickly got the warning afterwards as a second dialog, for the same act.
 *
 * The rules here keep it to one: a warning that arrives while its pause is up is
 * shown inside the pause dialog (ProctorOverlay), and one that arrives just
 * after the student cleared that pause becomes a passing notice
 * (ProctorProvider.handleVerdict).
 *
 * No imports, so scripts/exam-input-scenarios.mjs can load it under Node.
 */

/** Block reasons that have a pause dialog of their own in ProctorOverlay. */
export const PAUSE_DIALOGS = new Set(["fullscreen", "screenshare", "display"]);

/** Which pause each charged violation goes with. */
export const BLOCK_FOR_VIOLATION = {
  fullscreen_exit: ["fullscreen"],
  screen_share_stopped: ["screenshare"],
  screen_share_wrong_surface: ["screenshare"],
  second_monitor_detected: ["display", "secondmonitor"],
};

/** How long after a pause is cleared its warning still counts as the same act. */
export const LATE_WARNING_MS = 10000;

/** The warning to show inside the pause dialog, or null to show it on its own. */
export function warningForPause({ phase, blockReason, warning }) {
  if (phase !== "blocked" || !PAUSE_DIALOGS.has(blockReason)) return null;
  if (!warning || warning.kind === "terminate") return null;
  return warning;
}

/**
 * Is this "warn" verdict about a pause the student has already cleared?
 * `resolved` is `{ reason, at }` for the last pause cleared, or null.
 */
export function isLateWarningForClearedPause(verdict, resolved, now = Date.now()) {
  const pauses = BLOCK_FOR_VIOLATION[verdict?.violationType];
  if (!pauses || !resolved) return false;
  return pauses.includes(resolved.reason) && now - resolved.at < LATE_WARNING_MS;
}
