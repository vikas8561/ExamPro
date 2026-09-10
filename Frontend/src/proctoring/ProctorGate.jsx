import React, { useCallback, useEffect, useMemo, useState } from "react";
import { requestScreenShare } from "./detectors/screen";
import { requestMedia, requestLocation } from "./detectors/permissions";
import { redeemBypass } from "./transport";

/**
 * The pre-exam screen.
 *
 * Four jobs, in order: check the browser can actually do what the exam needs,
 * collect the permissions, tell the student plainly what is monitored and what
 * will end their test, and take that final click — which is the only thing a
 * browser will accept as grounds for entering fullscreen and locking the
 * keyboard.
 *
 * The honesty in the rules list is deliberate. A student who knows that leaving
 * fullscreen is recorded does not leave fullscreen; a student surprised by it
 * afterwards has a legitimate complaint.
 */

const PERMISSION_LABELS = {
  screen: {
    title: "Screen sharing",
    detail: 'You must share your ENTIRE screen — not a window or a tab. Nothing is recorded or saved.',
  },
  camera: {
    title: "Camera",
    detail: "Access is required, but no video is ever recorded, viewed or uploaded.",
  },
  microphone: {
    title: "Microphone",
    detail: "Access is required, but no audio is ever recorded or listened to.",
  },
  location: {
    title: "Location",
    detail: "Checked once to confirm access. Your position is not stored.",
  },
};

export default function ProctorGate({ session, environment, readiness, onBegin }) {
  const policy = session?.policy || {};
  const required = useMemo(
    () => policy.requiredPermissions || ["screen", "camera", "microphone", "location"],
    [policy.requiredPermissions]
  );

  const [granted, setGranted] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null);
  const [consent, setConsent] = useState(false);
  const [beginning, setBeginning] = useState(false);

  const [screenStream, setScreenStream] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);

  const [bypassScope, setBypassScope] = useState(session?.bypassScope || []);
  const [bypassGranted, setBypassGranted] = useState(session?.bypassGranted === true);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  // Streams collected here are handed to the provider on Begin. If the student
  // abandons the gate instead, release them rather than leaving the camera on.
  useEffect(() => {
    return () => {
      if (!beginning) {
        screenStream?.getTracks?.().forEach((t) => t.stop());
        mediaStream?.getTracks?.().forEach((t) => t.stop());
      }
    };
  }, [screenStream, mediaStream, beginning]);

  /** A permission counts as satisfied if it was granted or waived by the OTP. */
  const isSatisfied = useCallback(
    (key) => granted[key] === true || (bypassGranted && bypassScope.includes(key)),
    [granted, bypassGranted, bypassScope]
  );

  const allSatisfied = required.every(isSatisfied);

  const askScreen = useCallback(async () => {
    setBusy("screen");
    setErrors((prev) => ({ ...prev, screen: null }));

    const result = await requestScreenShare();
    if (result.ok) {
      setScreenStream(result.stream);
      setGranted((prev) => ({ ...prev, screen: true }));
    } else {
      setErrors((prev) => ({ ...prev, screen: result.error }));
    }
    setBusy(null);
  }, []);

  const askMedia = useCallback(async () => {
    setBusy("camera");
    setErrors((prev) => ({ ...prev, camera: null, microphone: null }));

    const wantsCamera = required.includes("camera");
    const wantsMic = required.includes("microphone");

    const result = await requestMedia({ camera: wantsCamera, microphone: wantsMic });
    if (result.ok) {
      setMediaStream(result.stream);
      setGranted((prev) => ({ ...prev, camera: wantsCamera, microphone: wantsMic }));
    } else {
      setErrors((prev) => ({ ...prev, camera: result.error, microphone: result.error }));
    }
    setBusy(null);
  }, [required]);

  const askLocation = useCallback(async () => {
    setBusy("location");
    setErrors((prev) => ({ ...prev, location: null }));

    const result = await requestLocation();
    if (result.ok) {
      setGranted((prev) => ({ ...prev, location: true }));
    } else {
      setErrors((prev) => ({ ...prev, location: result.error }));
    }
    setBusy(null);
  }, []);

  const submitOtp = useCallback(async () => {
    setOtpBusy(true);
    setOtpError("");
    try {
      const result = await redeemBypass({ sessionId: session.sessionId, otp: otp.trim() });
      if (result?.granted) {
        setBypassGranted(true);
        setBypassScope(result.scope || []);
        setShowOtp(false);
        setOtp("");
      } else {
        setOtpError("That code was not accepted.");
      }
    } catch (error) {
      setOtpError(error?.message || "That code was not accepted.");
    } finally {
      setOtpBusy(false);
    }
  }, [otp, session]);

  const handleBegin = useCallback(async () => {
    if (!allSatisfied || !consent || beginning) return;
    setBeginning(true);

    await onBegin({
      screenStream,
      mediaStream,
      permissions: {
        screen: isSatisfied("screen"),
        camera: isSatisfied("camera"),
        microphone: isSatisfied("microphone"),
        location: isSatisfied("location"),
      },
    });
  }, [allSatisfied, consent, beginning, onBegin, screenStream, mediaStream, isSatisfied]);

  const askFor = {
    screen: askScreen,
    camera: askMedia,
    microphone: askMedia,
    location: askLocation,
  };

  // A browser that genuinely cannot run the exam gets a dead end with a reason,
  // not a half-working test that fails halfway through.
  if (!readiness?.ready) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
        <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-slate-900 p-8">
          <h2 className="mb-4 text-2xl font-bold text-red-400">This device cannot run the test</h2>
          <ul className="mb-6 space-y-3">
            {readiness.blockers.map((blocker) => (
              <li key={blocker} className="text-slate-300">• {blocker}</li>
            ))}
          </ul>
          <p className="text-sm text-slate-400">
            Please switch to a laptop or desktop computer using Chrome, Edge or Brave, then open
            this test again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/95 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <h2 className="mb-2 text-2xl font-bold text-white">Before you begin</h2>
        <p className="mb-6 text-sm text-slate-400">
          This is a proctored test. Please grant the permissions below and read the rules.
        </p>

        {environment && (
          <p className="mb-4 text-xs text-slate-500">
            Detected browser: <span className="text-slate-300">{environment.browser}</span>
            {environment.secondMonitor === "yes" && (
              <span className="ml-2 text-amber-400">
                • A second display was detected and will be recorded
              </span>
            )}
          </p>
        )}

        {readiness?.warnings?.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            {readiness.warnings.map((note) => (
              <p key={note} className="text-sm text-amber-200">
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Permissions */}
        <div className="mb-6 space-y-3">
          {required.map((key) => {
            const label = PERMISSION_LABELS[key];
            if (!label) return null;

            const satisfied = isSatisfied(key);
            const waived = bypassGranted && bypassScope.includes(key) && granted[key] !== true;

            return (
              <div
                key={key}
                className={`rounded-lg border p-4 ${
                  satisfied ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 bg-slate-800/50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {label.title}
                      {waived && <span className="ml-2 text-xs text-amber-400">waived by code</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{label.detail}</p>
                    {errors[key] && <p className="mt-2 text-xs text-red-400">{errors[key]}</p>}
                  </div>

                  {satisfied ? (
                    <span className="shrink-0 text-sm font-semibold text-emerald-400">Granted</span>
                  ) : (
                    <button
                      type="button"
                      onClick={askFor[key]}
                      disabled={busy !== null}
                      className="shrink-0 rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === key ? "Waiting…" : "Allow"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* The global bypass code */}
        {!bypassGranted && (policy.bypassablePermissions || []).length > 0 && (
          <div className="mb-6">
            {!showOtp ? (
              <button
                type="button"
                onClick={() => setShowOtp(true)}
                className="text-xs text-slate-400 underline hover:text-slate-200"
              >
                Camera, microphone or location not working? Ask your administrator for the access code.
              </button>
            ) : (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <p className="mb-3 text-sm text-slate-300">
                  Enter the access code from your administrator. This waives the camera, microphone
                  and location checks only — all other exam rules stay in force, and the use of a
                  code is recorded on your submission.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white placeholder-slate-500 focus:border-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={submitOtp}
                    disabled={otp.length !== 6 || otpBusy}
                    className="rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {otpBusy ? "Checking…" : "Apply"}
                  </button>
                </div>
                {otpError && <p className="mt-2 text-xs text-red-400">{otpError}</p>}
              </div>
            )}
          </div>
        )}

        {/* The rules, stated plainly */}
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <p className="mb-3 font-semibold text-white">While the test is running</p>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>• The test runs in fullscreen. Leaving fullscreen is recorded.</li>
            <li>• Switching tabs, windows or applications is recorded.</li>
            <li>• Copy, paste and right-click are disabled.</li>
            <li>• Keyboard shortcuts are disabled. Only typing your answers works.</li>
            <li>• Opening developer tools is recorded.</li>
            <li>• A second monitor is recorded.</li>
            <li>
              •{" "}
              {policy.allowedViolations === -1
                ? "Violations are recorded but will not end your test."
                : policy.allowedViolations === 0
                ? "This test allows no violations. The first one ends your test."
                : `You are allowed ${policy.allowedViolations} violation${
                    policy.allowedViolations === 1 ? "" : "s"
                  }. Exceeding that ends your test and submits your answers.`}
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            No video, audio, screenshots or screen recordings are captured or stored at any point.
            Only the time and type of each violation is recorded.
          </p>
        </div>

        <label className="mb-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
          />
          <span className="text-sm text-slate-300">
            I have read the rules above and agree to be monitored for the duration of this test.
          </span>
        </label>

        <button
          type="button"
          onClick={handleBegin}
          disabled={!allSatisfied || !consent || beginning}
          className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {beginning
            ? "Starting…"
            : !allSatisfied
            ? "Grant all permissions to continue"
            : !consent
            ? "Accept the rules to continue"
            : "Begin Test"}
        </button>
      </div>
    </div>
  );
}
