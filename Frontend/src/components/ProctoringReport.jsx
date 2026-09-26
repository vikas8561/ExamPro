import React, { useState } from "react";
import apiRequest from "../services/api";
import { API_BASE_URL } from "../config/api";

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
  paste_attempt: "Tried to paste from outside the exam",
  paste_internal: "Pasted their own copied text",
  context_menu: "Opened the right-click menu",
  blocked_key: "Pressed a blocked shortcut",
  screen_share_stopped: "Stopped sharing their screen",
  screen_share_wrong_surface: "Shared a window instead of the whole screen",
  second_monitor_detected: "Second display detected",
  permission_revoked: "Revoked a permission",
  heartbeat_lost: "Proctoring stopped reporting",
  page_tampered: "Exam page was modified",
  network_lost: "Lost internet connection",
  seb_integrity_lost: "Safe Exam Browser stopped responding",
};

/** Violations that are recorded for context but never count against a student. */
const UNCHARGED = new Set([
  "context_menu",
  "blocked_key",
  "network_lost",
  // Cut-and-paste within the student's own answer. Shown, because a paper
  // assembled by pasting is worth seeing, but it is ordinary editing.
  "paste_internal",
  // The exam is blocked while this is true, which is the enforcement. Charging
  // it as well would let a momentary blank from SEB's key API end an exam.
  "seb_integrity_lost",
]);

/** How the attempt stood in relation to Safe Exam Browser. */
const SEB_STATUS = {
  verified: {
    text: "Taken in Safe Exam Browser",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  fallback: {
    text: "Safe Exam Browser was not used",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  },
};

const SEB_FALLBACK_REASONS = {
  os_unsupported:
    "Safe Exam Browser has no build for this student's operating system, so the standard browser-based proctoring applied instead.",
  not_verified:
    "Safe Exam Browser was required but could not be confirmed for this attempt.",
};

export default function ProctoringReport({ submission, assignmentId, onReEnabled }) {
  const [expanded, setExpanded] = useState(false);
  const [shots, setShots] = useState([]);
  const [openShot, setOpenShot] = useState(null);
  const [openShotUrl, setOpenShotUrl] = useState(null);
  const [shotError, setShotError] = useState(null);

  if (!submission) return null;

  const violations = submission.tabViolations || [];
  const count = submission.tabViolationCount || 0;
  const cancelled = submission.cancelledDueToViolation === true;
  const bypassed = submission.proctorBypassUsed === true;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user?.role === "Admin";
  const targetAssignmentId = assignmentId || submission.assignmentId;

  /**
   * Fetched on demand, never with the report.
   *
   * These are pictures of a student's whole screen. Loading them because a
   * reviewer happened to open a paper would mean routinely displaying private
   * content nobody asked to see — so it takes a deliberate click.
   */
  const loadShots = async () => {
    try {
      const data = await apiRequest(`/proctor/screenshots/${targetAssignmentId}`);
      setShots(Array.isArray(data) ? data : []);
    } catch {
      setShots([]);
    }
  };

  /**
   * Fetch the image with the reviewer's token and hand the browser a blob URL.
   *
   * An <img src> cannot carry an Authorization header — the browser issues that
   * request on its own, with no way to attach one — so pointing it straight at
   * an authenticated route produces a 401 and a broken-image icon. The bytes
   * have to be fetched in JavaScript, where the header can be set, and handed
   * over as an object URL instead.
   *
   * The same constraint is why the .seb config download is built from JSON
   * rather than linked directly.
   */
  const openCapture = async (shot) => {
    setOpenShot(shot);
    setOpenShotUrl(null);
    setShotError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/proctor/screenshots/image/${shot.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (!response.ok) {
        setShotError(`The server refused the image (HTTP ${response.status}).`);
        return;
      }

      const blob = await response.blob();

      // A 200 is not proof of an image. If anything upstream answered with JSON
      // — an error body, or a buffer that was serialised rather than sent as
      // bytes — the browser would show a broken icon and say nothing about why.
      if (!blob.type.startsWith("image/")) {
        setShotError(`The server returned ${blob.type || "an unknown type"} instead of an image.`);
        return;
      }
      if (blob.size === 0) {
        setShotError("The server returned an empty image.");
        return;
      }

      setOpenShotUrl(URL.createObjectURL(blob));
    } catch (err) {
      // Most often CORS or a dropped connection, and worth saying so rather
      // than leaving a reviewer staring at a blank panel.
      setShotError(err?.message || "The image could not be fetched.");
    }
  };

  const closeCapture = () => {
    // Object URLs pin their blob in memory until revoked, and these are images.
    if (openShotUrl) URL.revokeObjectURL(openShotUrl);
    setOpenShotUrl(null);
    setShotError(null);
    setOpenShot(null);
  };

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

  // Whether the machine was actually locked down is as much a part of the record
  // as the violation list, and it is the one thing a reviewer cannot infer from
  // anything else on this screen.
  const sebInfo = SEB_STATUS[submission.proctorSebStatus] || null;
  const sebNote = SEB_FALLBACK_REASONS[submission.proctorSebFallbackReason] || null;
  const sebLine = sebInfo ? (
    <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${sebInfo.className}`}>
      {sebInfo.text}
      {sebNote ? ` — ${sebNote}` : ""}
    </p>
  ) : null;

  if (count === 0 && violations.length === 0 && !cancelled && !bypassed) {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="text-sm font-semibold text-emerald-300">Proctoring: clean</p>
        <p className="mt-1 text-xs text-slate-400">
          No violations were recorded during this attempt.
        </p>
        {sebLine}
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

      {sebLine}

      {bypassed && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The access code was used for this attempt: the camera, microphone and location checks
          were waived. All other exam rules still applied.
        </p>
      )}

      {/* Captures, behind a click, with their expiry stated so nobody files a
          bug when a week-old attempt has none. */}
      {targetAssignmentId && (
        <div className="mt-3 border-t border-slate-700/50 pt-3">
          {shots.length === 0 ? (
            <button
              type="button"
              onClick={loadShots}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Load screen captures
            </button>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">
                {shots.length} capture{shots.length === 1 ? "" : "s"} — whole-screen
                images taken when a violation was recorded. Deleted automatically 72
                hours after the exam.
              </p>
              <div className="flex flex-wrap gap-2">
                {shots.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => openCapture(shot)}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800"
                  >
                    <span className="block">
                      {VIOLATION_LABELS[shot.violationType] || shot.violationType}
                    </span>
                    <span className="block text-slate-500">
                      {new Date(shot.takenAt).toLocaleTimeString()}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {openShot && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4"
          onClick={closeCapture}
        >
          <div className="max-h-full w-full max-w-5xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-200">
                {VIOLATION_LABELS[openShot.violationType] || openShot.violationType}
                <span className="ml-2 text-xs text-slate-500">
                  {new Date(openShot.takenAt).toLocaleString()}
                </span>
              </p>
              <button
                type="button"
                onClick={closeCapture}
                className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            {openShotUrl ? (
              <img
                src={openShotUrl}
                alt="Screen at the moment the violation was recorded"
                className="w-full rounded-md border border-slate-700"
              />
            ) : shotError ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-200">
                <p className="font-semibold">This capture could not be shown</p>
                <p className="mt-1 text-rose-200/80">{shotError}</p>
                <p className="mt-2 text-xs text-rose-200/60">
                  Captures are deleted automatically 72 hours after they are taken.
                </p>
              </div>
            ) : (
              <p className="rounded-md border border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
                Loading the capture…
              </p>
            )}
          </div>
        </div>
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
