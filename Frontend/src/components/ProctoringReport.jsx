import React, { useState } from "react";

/**
 * The proctoring record for a finished attempt.
 *
 * Worth noting why this exists at all: violations have been recorded on every
 * submission since long before this rebuild, and there was no screen anywhere in
 * the application that displayed them. A mentor looking at a cancelled test
 * could not see what the student had actually done. The data was collected and
 * then never looked at.
 *
 * Everything here comes from the server's own session record, not from anything
 * the student's browser reported about itself.
 */

const VIOLATION_LABELS = {
  tab_switch: "Switched tab",
  window_open: "Opened another window",
  tab_close: "Closed a tab",
  browser_switch: "Switched browser",
  fullscreen_exit: "Left fullscreen",
  window_blur: "Left the exam window",
  devtools_opened: "Opened developer tools",
  copy_attempt: "Tried to copy",
  paste_attempt: "Tried to paste",
  context_menu: "Opened the right-click menu",
  blocked_key: "Pressed a blocked shortcut",
  screen_share_stopped: "Stopped sharing their screen",
  screen_share_wrong_surface: "Shared a window instead of the whole screen",
  second_monitor_detected: "Second display detected",
  permission_revoked: "Revoked a permission",
  heartbeat_lost: "Proctoring stopped reporting",
  page_tampered: "Exam page was modified",
  network_lost: "Lost internet connection",
};

/** Violations that are recorded for context but never count against a student. */
const UNCHARGED = new Set(["context_menu", "blocked_key", "network_lost"]);

export default function ProctoringReport({ submission, assignmentId, onReEnabled }) {
  const [expanded, setExpanded] = useState(false);

  if (!submission) return null;

  const violations = submission.tabViolations || [];
  const count = submission.tabViolationCount || 0;
  const cancelled = submission.cancelledDueToViolation === true;
  const bypassed = submission.proctorBypassUsed === true;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user?.role === "Admin";
  const targetAssignmentId = assignmentId || submission.assignmentId;

  const handleReEnable = async () => {
    if (
      !window.confirm(
        "Re-enable this candidate's exam?\n\n• Active violations reset to 0.\n• All previous violation records remain saved in history.\n• The original exam timer continues (no extra time granted).\n• Candidate will see 'Continue' on their dashboard."
      )
    ) {
      return;
    }

    try {
      await apiRequest(`/assignments/${targetAssignmentId}/re-enable`, { method: "POST" });
      alert("Exam re-enabled successfully.");
      if (onReEnabled) onReEnabled();
    } catch (err) {
      alert(err.message || "Failed to re-enable exam.");
    }
  };

  if (count === 0 && violations.length === 0 && !cancelled && !bypassed) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="text-sm font-semibold text-emerald-300">Proctoring: clean</p>
        <p className="mt-1 text-xs text-slate-400">
          No violations were recorded during this attempt.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        cancelled ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className={`text-sm font-semibold ${cancelled ? "text-red-300" : "text-amber-300"}`}
          >
            {cancelled ? "Test ended by proctoring" : "Proctoring: violations recorded"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {count} violation{count === 1 ? "" : "s"} recorded
            {submission.autoSubmit && !cancelled && " • submitted automatically when time ran out"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && cancelled && targetAssignmentId && (
            <button
              type="button"
              onClick={handleReEnable}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Re-enable Exam
            </button>
          )}

          {violations.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              {expanded ? "Hide details" : `Show all ${violations.length}`}
            </button>
          )}
        </div>
      </div>

      {bypassed && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The access code was used for this attempt: the camera, microphone and location checks
          were waived. All other exam rules still applied.
        </p>
      )}

      {expanded && violations.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-slate-700/50 pt-4">
          {violations.map((violation, index) => {
            const label = VIOLATION_LABELS[violation.violationType] || violation.violationType;
            const free = UNCHARGED.has(violation.violationType);

            return (
              <li
                key={`${violation.timestamp}-${index}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="text-slate-300">
                  {label}
                  {free && <span className="ml-2 text-slate-500">(recorded only)</span>}
                  {violation.details && (
                    <span className="ml-2 text-slate-500">— {violation.details}</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-slate-500">
                  {violation.timestamp
                    ? new Date(violation.timestamp).toLocaleTimeString()
                    : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
