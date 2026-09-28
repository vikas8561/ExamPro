import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    detail: 'You must share your ENTIRE screen — not a window or a tab.',
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
  //
  // Both of these are refs on purpose. This cleanup used to depend on
  // `beginning`, which meant React ran it the moment Begin was pressed --
  // replaying the *previous* closure, where `beginning` was still false -- and
  // so it stopped the screen share and camera at the exact instant the exam
  // started. The detectors then correctly reported a dead track, and the
  // student was hit with "Screen sharing was turned off" on their first click.
  //
  // With an empty dependency array the cleanup runs only on a real unmount, and
  // the ref tells it whether the streams have already been handed over.
  const handedOverRef = useRef(false);
  const streamsRef = useRef({ screen: null, media: null });

  useEffect(() => {
    streamsRef.current = { screen: screenStream, media: mediaStream };
  }, [screenStream, mediaStream]);

  useEffect(() => {
    return () => {
      if (handedOverRef.current) return;
      streamsRef.current.screen?.getTracks?.().forEach((t) => t.stop());
      streamsRef.current.media?.getTracks?.().forEach((t) => t.stop());
    };
  }, []);

  /** A permission counts as satisfied if it was granted or waived by the OTP. */
  const isSatisfied = useCallback(
    (key) => granted[key] === true || (bypassGranted && bypassScope.includes(key)),
    [granted, bypassGranted, bypassScope]
  );

  const allSatisfied = required.every(isSatisfied);
  const grantedCount = required.filter(isSatisfied).length;

  /**
   * Everything the student genuinely needs to be told before starting, in one
   * place. A second display belongs here rather than buried in a diagnostic
   * footnote, because it is a caution that affects them.
   */
  const notices = useMemo(() => {
    const list = [...(readiness?.warnings || [])];
    if (environment?.secondMonitor === "yes") {
      list.push(
        "A second display is connected. This is allowed, but it will be recorded on your attempt."
      );
    }
    return list;
  }, [readiness, environment]);

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
    if (!allSatisfied || beginning) return;

    // Claim the streams BEFORE any state change, so no cleanup can decide they
    // are still the gate's to stop. The provider owns them from here.
    handedOverRef.current = true;
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
  }, [allSatisfied, beginning, onBegin, screenStream, mediaStream, isSatisfied]);

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
            Please switch to a laptop or desktop computer using Google Chrome, then open
            this test again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/95 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-white">Ready to Begin?</h2>
            <p className="mt-2 text-sm text-slate-400">
              This exam is monitored. Allow the permissions below to begin.
            </p>
          </div>

          {/* Progress, so the student can see how far through setup they are
              rather than guessing why the button is still disabled. */}
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
              allSatisfied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-slate-600 bg-slate-800 text-slate-400"
            }`}
          >
            {grantedCount} of {required.length} allowed
          </span>
        </div>

        {/* One notice area. The browser name is deliberately not shown on its
            own -- it means nothing to a student, and the warnings below already
            name the browser on the occasions where it actually matters. */}
        {notices.length > 0 && (
          <div className="mb-6 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            {notices.map((note) => (
              <p key={note} className="text-sm text-amber-200">
                {note}
              </p>
            ))}
          </div>
        )}

        {/* Consent has to be informed, and this is the screen where it is given.
            The permission row above used to end "Nothing is recorded or saved",
            which stopped being true the moment captures were introduced. A
            student agreeing to share their screen for monitoring has not thereby
            agreed to have it photographed, so they are told before they click
            Begin — not in a policy document somewhere. */}
        {policy.captureOnViolation && required.includes("screen") && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="mb-1 text-sm font-semibold text-amber-200">
              Your screen is photographed if a rule is broken
            </p>
            <p className="text-sm text-amber-200/80">
              If the exam records a violation — switching away, leaving fullscreen,
              copying, or a browser extension interfering — a picture of your whole
              screen is saved at that moment, including anything else you have open.
              Close anything private before you begin. Images are visible only to
              staff reviewing your paper.
            </p>
          </div>
        )}

        {/* Inside Safe Exam Browser there are no permissions to ask for: the
            lockdown is native, and SEB supports neither screen capture nor, on
            Windows, the camera. An empty list would otherwise read as a mistake,
            so say plainly what is protecting the exam instead. */}
        {session?.seb?.verified && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-300">
              Safe Exam Browser confirmed
            </p>
            <p className="mt-1 text-sm text-emerald-200/80">
              Your computer is locked to this exam. Other applications, browser
              extensions and additional screens are blocked for its duration, so no
              camera or screen-sharing permissions are needed.
            </p>
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

        <button
          type="button"
          onClick={handleBegin}
          disabled={!allSatisfied || beginning}
          className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {beginning
            ? "Starting…"
            : !allSatisfied
            ? "Allow all permissions to continue"
            : "Begin Test"}
        </button>
      </div>
    </div>
  );
}
