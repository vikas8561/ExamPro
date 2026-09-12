import React, { forwardRef, useEffect, useState } from "react";

/**
 * What the student sees while the exam runs: a small status strip, and the
 * dialogs that appear when something goes wrong.
 *
 * Every number shown here comes from the server. This component never works out
 * whether a violation counts, how many are left, or whether the test should
 * end — it displays the verdict it was handed. That is what makes editing the
 * page pointless: a student can change what is on screen and change nothing
 * about what the server has recorded.
 *
 * The blocking dialogs will not let go until the problem is genuinely fixed.
 * "Continue" stays disabled while developer tools are still open or the window
 * is still out of fullscreen, rechecked every half second rather than trusted
 * once.
 */

const ProctorOverlay = forwardRef(function ProctorOverlay(
  {
    phase,
    warning,
    blockReason,
    offline,
    isDevtoolsOpen,
    onDismissWarning,
    onResume,
  },
  ref
) {
  const [stillBroken, setStillBroken] = useState(false);
  const [working, setWorking] = useState(false);

  // Recheck continuously while a dialog is open, so the button unlocks the
  // moment the student actually closes devtools or returns to fullscreen —
  // and stays locked while they have not.
  useEffect(() => {
    const needsCheck =
      blockReason === "fullscreen" ||
      blockReason === "screenshare" ||
      warning?.violationType === "devtools_opened" ||
      warning?.violationType === "fullscreen_exit";

    if (!needsCheck) {
      setStillBroken(false);
      return;
    }

    const check = () => {
      // The screen-share dialog has nothing to poll: whether the student is
      // sharing again is only known once they click and the browser answers.
      if (blockReason === "screenshare") return;
      if (blockReason === "fullscreen" || warning?.violationType === "fullscreen_exit") {
        const fullscreen = Boolean(
          document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
        );
        setStillBroken(!fullscreen);
        return;
      }
      if (warning?.violationType === "devtools_opened") {
        setStillBroken(isDevtoolsOpen?.() === true);
      }
    };

    check();
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }, [blockReason, warning, isDevtoolsOpen]);

  const handleDismiss = async () => {
    setWorking(true);
    const ok = await onDismissWarning?.();
    setWorking(false);
    if (!ok) setStillBroken(true);
  };

  const handleResume = async () => {
    setWorking(true);
    const ok = await onResume?.();
    setWorking(false);
    if (!ok) setStillBroken(true);
  };

  return (
    <div ref={ref}>
      {/* Status strip. Always visible, so nobody can claim they did not know.

          Anchored bottom-right, not top-right. The exam pages centre their
          content in a max-w-7xl (1280px) column, so on any viewport narrower
          than roughly 1730px a top-right badge lands straight on the header's
          top-right corner — which is exactly where the countdown timer sits.
          Nothing competes for the bottom of the page. */}
      {phase !== "terminated" && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9990] flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/90 px-4 py-2 text-xs shadow-lg backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="font-medium text-slate-200">Proctored</span>
          </span>
          {/* No running tally here.

              This used to read "N violations left", and the warning dialog
              spelled out "Violation 3 of 20 allowed". Between them they handed
              the student a live budget to spend: exactly how many more times
              they could look away before it cost them anything. The violation
              record belongs to whoever reviews the attempt. The student is
              still told, every single time, that something was recorded -- they
              just are not told how much room is left. */}
          {offline && <span className="text-amber-400">Offline</span>}
        </div>
      )}

      {/* Connection lost. Not a violation — recorded, but never charged.
          Sits above the status badge rather than beside it, so the two never
          overlap on a narrow window. */}
      {offline && phase === "active" && (
        <div className="fixed bottom-16 left-1/2 z-[9991] max-w-[90vw] -translate-x-1/2 rounded-lg border border-amber-500/40 bg-amber-950/90 px-5 py-3 text-center text-sm text-amber-200 backdrop-blur">
          Your internet connection was lost. Your answers are saved and will sync when it returns.
        </div>
      )}

      {/* Something must be fixed before the exam can continue. */}
      {phase === "blocked" && blockReason === "fullscreen" && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-slate-900 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-amber-400">Return to fullscreen</h2>
            <p className="mb-6 text-slate-300">
              Your test must stay in fullscreen. This has been recorded. Click below to carry on.
            </p>
            <p className="mb-6 text-sm text-slate-500">
              Your browser will only return to fullscreen when you click, which is why we cannot do
              it for you.
            </p>
            <button
              type="button"
              onClick={handleResume}
              disabled={working}
              className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white disabled:opacity-50"
            >
              {working ? "Please wait…" : "Return to fullscreen"}
            </button>
          </div>
        </div>
      )}

      {/* Screen sharing stopped. The exam does not continue without it.

          Previously this arrived as an ordinary warning with a "Continue Test"
          button, so the student could switch off the one thing that makes the
          rest of the proctoring observable and keep working. */}
      {phase === "blocked" && blockReason === "screenshare" && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-slate-900 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-red-400">Screen sharing stopped</h2>
            <p className="mb-6 text-slate-300">
              Your exam is paused. Screen sharing is required for the whole test, so you will need
              to share your entire screen again before you can carry on.
            </p>
            <p className="mb-6 text-sm text-slate-500">
              Choose <span className="font-semibold text-slate-400">Entire Screen</span> when your
              browser asks. Sharing a single window or tab will not be accepted.
            </p>
            {stillBroken && (
              <p className="mb-4 text-sm font-semibold text-red-400">
                Screen sharing was not restored. You must share your entire screen to continue.
              </p>
            )}
            <button
              type="button"
              onClick={handleResume}
              disabled={working}
              className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white disabled:opacity-50"
            >
              {working ? "Please wait…" : "Share my screen again"}
            </button>
          </div>
        </div>
      )}

      {/* Warnings and the final cancellation notice. */}
      {warning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-8">
            <h2
              className={`mb-4 text-center text-2xl font-bold ${
                warning.kind === "terminate"
                  ? "text-red-400"
                  : warning.kind === "final"
                  ? "text-orange-400"
                  : "text-yellow-400"
              }`}
            >
              {warning.title}
            </h2>

            <p className="mb-4 text-center text-slate-300">{warning.message}</p>

            <p className="mb-6 text-center text-sm text-slate-400">
              This has been recorded and sent to your proctor.
            </p>

            {stillBroken && warning.violationType === "devtools_opened" && (
              <p className="mb-4 text-center text-sm font-semibold text-red-400">
                Developer tools are still open. Close them to continue.
              </p>
            )}
            {stillBroken && warning.violationType === "fullscreen_exit" && (
              <p className="mb-4 text-center text-sm font-semibold text-red-400">
                You are not in fullscreen. Click continue to return to it.
              </p>
            )}

            {warning.kind === "terminate" ? (
              <p className="text-center text-sm text-slate-400">
                Your answers are being submitted. Please wait…
              </p>
            ) : (
              <button
                type="button"
                onClick={handleDismiss}
                disabled={working || (stillBroken && warning.violationType === "devtools_opened")}
                className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
              >
                {working ? "Please wait…" : "Continue Test"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default ProctorOverlay;
