import React, { useCallback, useState } from "react";

import { requestSebLaunch } from "./transport";

/**
 * "This exam has to be taken in Safe Exam Browser."
 *
 * Deliberately not a dead end, which is what separates it from the unsupported-
 * browser dialog next to it. A student here has something they can do, so the
 * screen gives them the button that does it: the server mints a short-lived
 * signed link, clicking it hands the URL to the operating system, and the
 * operating system starts SEB the way it would start a mail client for a
 * `mailto:` link.
 *
 * The one case with no button is Linux, and that is not a bug to be worked
 * around. Safe Exam Browser has never had a Linux build and none is planned, so
 * a Linux student is told plainly that the ordinary proctoring applies to them
 * instead — and the server records that on their submission rather than
 * pretending the exam was locked down.
 */

const DOWNLOADS = {
  windows: "https://safeexambrowser.org/download_en.html",
  macos: "https://safeexambrowser.org/download_en.html",
};

export default function SebLaunchScreen({ info, assignmentId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [launched, setLaunched] = useState(false);

  const os = info?.os || "unknown";
  const available = info?.sebAvailableForOs === true;

  const launch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestSebLaunch(assignmentId);
      if (!result?.launchUrl) {
        throw new Error("The server did not return a launch link.");
      }
      setLaunched(true);
      // Handing the custom scheme to the OS. Assigning to location rather than
      // opening a window, because a popup blocker would swallow the latter and
      // the student would be left staring at a button that did nothing.
      window.location.href = result.launchUrl;
    } catch (err) {
      setError(
        err?.message ||
          "The Safe Exam Browser link could not be created. Please reload and try again."
      );
      setLaunched(false);
    } finally {
      setBusy(false);
    }
  }, [assignmentId]);

  // Inside SEB, but SEB is not exposing the JavaScript API the exam needs. No
  // button helps here: relaunching lands in exactly the same place.
  if (info?.apiMissing) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-8">
          <h2 className="mb-3 text-2xl font-bold text-white">
            Safe Exam Browser needs updating
          </h2>
          <p className="mb-6 text-slate-300">
            Safe Exam Browser is running, but this version cannot confirm itself to
            the exam. Quit Safe Exam Browser and tell your administrator — the exam
            cannot be started until it is sorted out.
          </p>
          <div className="rounded-md border border-slate-600 bg-slate-800 px-4 py-3 text-xs text-slate-400">
            <p className="mb-2 font-semibold text-slate-300">For the administrator</p>
            <p className="mb-2">
              Safe Exam Browser is not exposing its JavaScript API, so the exam
              cannot confirm it.{" "}
              {info.detectedVersion ? (
                <>
                  Detected version:{" "}
                  <code className="text-slate-300">SEB {info.detectedVersion}</code>.
                </>
              ) : (
                <>No version could be read from the browser.</>
              )}
            </p>
            {/* The cause is genuinely different per platform, and giving macOS
                advice to a Windows administrator wastes their afternoon. */}
            {os === "windows" ? (
              <p>
                On Windows the API exists from <strong>SEB 3.3.2</strong> onwards. If
                the version above is older, the student needs to update. If it is
                newer, the running Safe Exam Browser is not using this exam&apos;s
                configuration — it must be started from the launch link, not opened
                on its own.
              </p>
            ) : (
              <p>
                On macOS this means SEB is using its classic browser engine. The exam
                configuration needs{" "}
                <code className="text-slate-300">browserWindowWebView</code> set to
                Prefer Modern, and the URL content filter left off.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Running inside SEB on an exam that is not set up for it. The exam still
  // expects a screen share, which SEB cannot produce on any platform, so there
  // is no button that would help — only a clear instruction.
  if (info?.notExpected) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-8">
          <h2 className="mb-3 text-2xl font-bold text-white">Please use Google Chrome</h2>
          <p className="mb-6 text-slate-300">
            This exam is not set up for Safe Exam Browser. Quit Safe Exam Browser
            and open the exam in Google Chrome instead.
          </p>
          <p className="text-xs text-slate-400">
            If you were told to use Safe Exam Browser for this exam, contact your
            administrator — the exam may not have been configured for it yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-8">
        <h2 className="mb-3 text-2xl font-bold text-white">
          Safe Exam Browser Required
        </h2>

        {available ? (
          <>
            <p className="mb-6 text-slate-300">
              This exam runs in Safe Exam Browser, which locks your computer to the
              exam for its duration. Your normal browser cannot be used.
            </p>

            {info?.unverified && (
              <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Safe Exam Browser is running, but its configuration was not
                recognised. Start the exam using the button below rather than by
                opening the exam link directly.
              </div>
            )}

            <ol className="mb-6 space-y-3 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="font-semibold text-slate-500">1.</span>
                <span>
                  Install Safe Exam Browser if you have not already.
                  {info?.minVersion && (
                    <> Version {info.minVersion} or newer is required.</>
                  )}{" "}
                  <a
                    href={DOWNLOADS[os] || DOWNLOADS.windows}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    Download it here
                  </a>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-500">2.</span>
                <span>
                  Close anything you do not need. Safe Exam Browser will not start
                  while screen-sharing or remote-access software is running.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-slate-500">3.</span>
                <span>
                  Press the button below. You will be asked to sign in again inside
                  Safe Exam Browser — this is expected.
                </span>
              </li>
            </ol>

            {error && (
              <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={launch}
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {busy ? "Preparing…" : "Start in Safe Exam Browser"}
            </button>

            {launched && !error && (
              <p className="mt-4 text-center text-xs text-slate-400">
                Safe Exam Browser should be opening. If nothing happened, check that
                it is installed, then press the button again.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-4 text-slate-300">
              This exam normally runs in Safe Exam Browser, which is not available
              for your operating system
              {os === "linux" ? " (Linux)" : ""}.
            </p>
            <div className="mb-6 rounded-md border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-300">
              You can take the exam in Google Chrome instead. The standard
              proctoring rules apply in full, and your submission will record that
              Safe Exam Browser was unavailable.
            </div>
            <p className="text-xs text-slate-400">
              Reload this page to continue. If you keep seeing this screen, contact
              your administrator.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
