import React, { useCallback, useEffect, useState } from "react";

import { requestSebLaunch } from "./transport";

/**
 * "This exam has to be taken in Safe Exam Browser."
 *
 * Deliberately not a dead end. A student here has something they can do, so the
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

/** Refresh the prefetched link this long before its token runs out. */
const LINK_REFRESH_MARGIN_MS = 2 * 60 * 1000;

export default function SebLaunchScreen({ info, assignmentId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [launched, setLaunched] = useState(false);
  // { launchUrl, configUrl, expiresAt } — fetched before the student clicks.
  const [link, setLink] = useState(null);

  const os = info?.os || "unknown";
  const available = info?.sebAvailableForOs === true;
  const wantsLink = available && !info?.apiMissing && !info?.notExpected;

  const fetchLink = useCallback(async () => {
    const result = await requestSebLaunch(assignmentId);
    if (!result?.launchUrl) {
      throw new Error("The server did not return a launch link.");
    }
    const next = {
      launchUrl: result.launchUrl,
      configUrl: result.configUrl,
      expiresAt: Date.now() + (result.expiresInMs || 15 * 60 * 1000),
    };
    setLink(next);
    return next;
  }, [assignmentId]);

  // Fetch the link before the click, and keep it fresh.
  //
  // Browsers only let a page hand a custom scheme like `sebs://` to the
  // operating system while a real click is still "recent" — a few seconds in
  // Chrome, less elsewhere. Fetching on click and redirecting afterwards spends
  // that window on the network round trip; on a slow connection or a cold API
  // it runs out, and the browser drops the launch without a word. The student
  // sees a button that does nothing. With the link already in hand, the click
  // lands on an ordinary <a href="sebs://…"> and nothing stands in between.
  useEffect(() => {
    if (!wantsLink) return undefined;
    let cancelled = false;
    let timer = null;

    const load = async () => {
      try {
        const next = await fetchLink();
        if (cancelled) return;
        const wait = Math.max(next.expiresAt - Date.now() - LINK_REFRESH_MARGIN_MS, 30 * 1000);
        timer = setTimeout(load, wait);
      } catch {
        // Not fatal: the button falls back to fetching on click, and reports
        // the error there where the student can see it.
        if (!cancelled) setLink(null);
      }
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [wantsLink, fetchLink]);

  const linkIsFresh = Boolean(link && link.expiresAt - Date.now() > 30 * 1000);

  // Only used when no fresh link is in hand.
  const launch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchLink();
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
  }, [fetchLink]);

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
  // expects a screen share, which SEB cannot produce on any platform, so the
  // only way forward is the regular browser. The exit button goes to SEB's quit
  // URL — the same password-free way out the assignments page offers — because
  // SEB's own Quit button asks for the invigilator's password, and a student
  // told to "quit SEB" would otherwise be stuck.
  if (info?.notExpected) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
        <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-8">
          <h2 className="mb-3 text-2xl font-bold text-white">Please use your regular browser</h2>
          <p className="mb-6 text-slate-300">
            {info.disabledForTest
              ? "This test does not use Safe Exam Browser. It runs in your regular browser, with screen sharing and the standard proctoring rules. Exit Safe Exam Browser, then open the test from your assignments page in Chrome, Edge, Brave or Firefox."
              : "This exam is not set up for Safe Exam Browser. Exit Safe Exam Browser and open the exam in your regular browser instead."}
          </p>
          <button
            type="button"
            onClick={() =>
              window.location.assign(`${window.location.origin}/student/seb-exit`)
            }
            className="mb-4 w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Exit Safe Exam Browser
          </button>
          {!info.disabledForTest && (
            <p className="text-xs text-slate-400">
              If you were told to use Safe Exam Browser for this exam, contact your
              administrator — the exam may not have been configured for it yet.
            </p>
          )}
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

            {linkIsFresh ? (
              <a
                href={link.launchUrl}
                onClick={() => setLaunched(true)}
                className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-center font-semibold text-white transition hover:bg-blue-500"
              >
                Start in Safe Exam Browser
              </a>
            ) : (
              <button
                type="button"
                onClick={launch}
                disabled={busy}
                className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {busy ? "Preparing…" : "Start in Safe Exam Browser"}
              </button>
            )}

            {launched && !error && (
              <div className="mt-6 space-y-4 text-sm text-slate-300">
                <p className="text-center text-xs text-slate-400">
                  Safe Exam Browser should be opening. If your browser asks whether
                  to open it, choose Open (or Allow).
                </p>

                {/* Second route in, for machines where the sebs:// link is not
                    registered or the browser refuses it. The same config,
                    opened as a file — SEB is the default app for .seb files. */}
                {linkIsFresh && link.configUrl && (
                  <div className="rounded-md border border-slate-600 bg-slate-800 px-4 py-3">
                    <p className="mb-2 font-semibold text-slate-200">Nothing opened?</p>
                    <p className="mb-3 text-slate-400">
                      Download the exam file and open it. It opens in Safe Exam
                      Browser the same way.
                    </p>
                    <a
                      href={link.configUrl}
                      className="inline-block rounded-md border border-slate-500 px-4 py-2 text-slate-200 transition hover:bg-slate-700"
                    >
                      Download exam file
                    </a>
                  </div>
                )}

                <details className="rounded-md border border-slate-700 px-4 py-3 text-slate-400">
                  <summary className="cursor-pointer text-slate-300">
                    Safe Exam Browser opened but showed an error
                  </summary>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-xs">
                    <li>
                      <strong className="text-slate-300">Another display:</strong>{" "}
                      unplug any external monitor, projector or TV, and turn off
                      screen mirroring. Only the laptop screen is allowed.
                    </li>
                    <li>
                      <strong className="text-slate-300">Programs to close:</strong>{" "}
                      quit TeamViewer, AnyDesk, Discord, OBS, Zoom/Meet screen
                      sharing and similar apps, including from the system tray.
                    </li>
                    <li>
                      <strong className="text-slate-300">&quot;Virtual machine detected&quot; (Windows):</strong>{" "}
                      happens on some laptops with Hyper-V, WSL, Docker Desktop,
                      Windows Sandbox or an Android emulator installed. Tell your
                      invigilator.
                    </li>
                    <li>
                      <strong className="text-slate-300">macOS permissions:</strong>{" "}
                      if macOS asks to allow Safe Exam Browser (Accessibility or
                      Screen Recording), allow it in System Settings → Privacy &amp;
                      Security, then start again.
                    </li>
                    <li>
                      <strong className="text-slate-300">Outdated version:</strong>{" "}
                      reinstall the latest Safe Exam Browser from the download link
                      above.
                    </li>
                  </ul>
                </details>
              </div>
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
              You can take the exam in your regular browser instead. The standard
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
