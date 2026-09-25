import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { inspectEnvironment, assessReadiness } from "./environment";
import {
  createTransport,
  startSession,
  fetchProctorPolicy,
  fetchSebExamUrl,
  uploadScreenshot,
} from "./transport";
import { createFocusDetector } from "./detectors/focus";
import {
  createFullscreenDetector,
  requestFullscreen as enterFullscreen,
  exitFullscreen as leaveFullscreen,
  isFullscreen,
} from "./detectors/fullscreen";
import { createKeyboardDetector } from "./detectors/keyboard";
import { createClipboardDetector } from "./detectors/clipboard";
import { createDevtoolsDetector } from "./detectors/devtools";
import { createScreenDetector, requestScreenShare } from "./detectors/screen";
import { createPermissionsDetector } from "./detectors/permissions";
import { createNetworkDetector } from "./detectors/network";
import { createIntegrityDetector } from "./detectors/integrity";
import { captureScreenFrame, releaseCapture } from "./screenshot";
import ProctorGate from "./ProctorGate";
import ProctorOverlay from "./ProctorOverlay";
import SebLaunchScreen from "./SebLaunchScreen";
import { ProctorContext } from "./context";

/**
 * The one thing an exam page mounts.
 *
 * Everything the old system spread across a 1681-line component and two
 * copy-pasted page integrations lives behind this single provider. A page wraps
 * its content, sets `enabled`, and reads `ready` from the `useProctor` hook —
 * that is the whole contract.
 *
 * The division of labour, which is the point of the rebuild:
 *
 *   this component  runs the sensors and shows the student what is happening
 *   the server      decides what any of it means
 *
 * No warning threshold, no violation limit and no decision to cancel a test is
 * computed here. The detectors report; the server replies "continue", "warn" or
 * "terminate"; this component obeys. A student who edits the page can change
 * what they see, and nothing else.
 *
 * Phases:
 *   idle        proctoring is off (practice tests, or the exam has not begun)
 *   starting    opening the session with the server
 *   seb_launch  this exam needs Safe Exam Browser and this browser is not it
 *   unsupported this browser cannot run the exam and no lockdown is available
 *   gate        the pre-exam screen: browser check, permissions, rules
 *   active      the exam is running and monitored
 *   blocked     something must be fixed before the exam can continue
 *   terminated  the server cancelled this attempt
 */
export function ProctorProvider({
  enabled = false,
  assignmentId,
  testKind = "assigned",
  onTerminate,
  onReady,
  children,
}) {
  const [phase, setPhase] = useState("idle");
  const [environment, setEnvironment] = useState(null);
  const [readiness, setReadiness] = useState({ blockers: [], warnings: [], ready: true });
  const [session, setSession] = useState(null);
  const [startError, setStartError] = useState(null);
  // Set when the exam needs Safe Exam Browser and this browser is not it.
  const [sebLaunchInfo, setSebLaunchInfo] = useState(null);

  const [violationCount, setViolationCount] = useState(0);
  const [limit, setLimit] = useState(-1);
  const [warning, setWarning] = useState(null);
  const [blockReason, setBlockReason] = useState(null);
  // Recorded-only violations: shown to the student as a passing notice, never
  // as a warning, because they are never charged.
  const [notice, setNotice] = useState(null);
  const [offline, setOffline] = useState(false);

  // Streams are held, never read. See detectors/permissions.js for why.
  const screenStreamRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const transportRef = useRef(null);
  const detectorsRef = useRef([]);
  const keyboardRef = useRef(null);
  const devtoolsRef = useRef(null);
  const screenRef = useRef(null);
  const overlayRef = useRef(null);
  const heartbeatRef = useRef(null);
  const terminatedRef = useRef(false);
  const phaseRef = useRef("idle");
  // Read inside `report`, which is created once and must not close over stale
  // state. Kept as refs for the same reason `phaseRef` is.
  const sessionRef = useRef(null);
  const captureOnViolationRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    sessionRef.current = session;
    captureOnViolationRef.current = session?.policy?.captureOnViolation === true;
  }, [session]);

  /**
   * Violation reporting pauses while a blocking overlay is up or the gate is
   * open. Without this, a student stuck on "please return to fullscreen" would
   * be charged again every second for the very thing they are being asked to
   * fix, and the permission prompts during the gate — which legitimately steal
   * focus — would each look like leaving the exam.
   */
  const isPaused = useCallback(() => {
    const current = phaseRef.current;
    return current !== "active";
  }, []);

  const report = useCallback(
    (violationType, details) => {
      transportRef.current?.report(violationType, details);

      // Capture what was on screen, if this exam is configured to.
      //
      // Started rather than awaited: reporting the violation is what matters and
      // must not wait on a canvas draw, an upload, or either of them failing.
      // The server enforces its own minimum gap and per-session cap, because a
      // browser sending too many is exactly the browser not to trust.
      if (!captureOnViolationRef.current) return;
      const sessionId = sessionRef.current?.sessionId;
      if (!sessionId) return;

      captureScreenFrame(() => screenStreamRef.current)
        .then((image) => {
          if (!image) return;
          return uploadScreenshot({ sessionId, image, violationType, details });
        })
        .catch(() => {
          // Never surfaced. A missing capture is not the student's problem.
        });
    },
    []
  );

  // ── Reacting to the server's verdict ───────────────────────────────────

  const handleVerdict = useCallback(
    (verdict) => {
      if (!verdict || terminatedRef.current) return;

      if (typeof verdict.count === "number") setViolationCount(verdict.count);
      if (typeof verdict.limit === "number") setLimit(verdict.limit);

      if (verdict.action === "terminate") {
        terminatedRef.current = true;
        setPhase("terminated");
        setWarning({
          kind: "terminate",
          title: "Test Ended",
          message:
            verdict.terminatedReason ||
            "Your test has been ended because the allowed number of violations was exceeded.",
          count: verdict.count,
          limit: verdict.limit,
        });

        // Give the student a moment to read it, then submit what they have.
        setTimeout(() => {
          onTerminate?.(true);
        }, 2500);
        return;
      }

      // Nothing was charged, but something was seen. An extension injecting into
      // the page, a blocked shortcut, a second display: all deliberately weight
      // 0, so they must not warn — but staying silent means the first a student
      // hears of it is a misconduct meeting, long after they could have closed
      // the offending thing.
      if (verdict.action === "continue" && Array.isArray(verdict.recorded) && verdict.recorded.length > 0) {
        const last = verdict.recorded[verdict.recorded.length - 1];
        setNotice({ id: Date.now(), message: last.details || "A proctoring event was recorded." });
        return;
      }

      if (verdict.action === "warn") {
        setWarning({
          kind: verdict.final ? "final" : "warning",
          title: verdict.final ? "Final Warning" : "Warning",
          message: verdict.details || "A proctoring violation was recorded.",
          violationType: verdict.violationType,
          count: verdict.count,
          limit: verdict.limit,
        });
      }
    },
    [onTerminate]
  );

  // ── Opening the session ────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !assignmentId) {
      setPhase("idle");
      return;
    }
    if (phaseRef.current !== "idle") return;

    let cancelled = false;
    let finished = false;
    // Where the start got to, so a failure can say so instead of spinning.
    let step = "checking this browser";
    setPhase("starting");

    /**
     * Never spin forever.
     *
     * Opening a session involves several awaits — inspecting the browser,
     * waiting for Safe Exam Browser's API, two or three network calls — and if
     * any of them never settles the student is left on "Loading test…" with
     * nothing to do and nothing to report. A hang has to become a message.
     */
    const watchdog = setTimeout(() => {
      if (cancelled || finished) return;
      setStartError(
        `Starting the exam timed out while ${step}. Reload the page to try again.`
      );
      setPhase("idle");
    }, 25000);

    (async () => {
      try {
        step = "checking this browser";
        const env = await inspectEnvironment();
        if (cancelled) return;

        setEnvironment(env);

        // Inside SEB, but at an address with no nonce on it.
        //
        // SEB always lands here that way: its configuration file has to be
        // byte-identical for every student, because SEB derives the Browser Exam
        // Key from that configuration and a per-student start URL would give
        // every student a different key. So SEB starts everyone at the
        // assignments list, and the attempt's own address is fetched and loaded
        // here instead.
        //
        // A full page load, not a router navigation: SEB recomputes its key hash
        // when a page loads, and the whole point is to be verified against this
        // new URL.
        if (env.isSEB && !new URLSearchParams(window.location.search).get("n")) {
          try {
            step = "preparing the Safe Exam Browser address";
            const { examUrl } = await fetchSebExamUrl(assignmentId);
            if (cancelled) return;
            if (examUrl && examUrl !== window.location.href) {
              window.location.replace(examUrl);
              return;
            }
          } catch {
            // Carry on unredirected. Verification will fail and the student is
            // sent to the launch screen with an explanation, which is a better
            // outcome than a blank page.
          }
        }

        // Does this exam want Safe Exam Browser, and could this machine even run
        // it? Asked before anything is started, through a read-only endpoint,
        // because opening a session to find out would be destructive: it carries
        // the assignment's violation count forward and can terminate the attempt
        // outright. A student merely looking at the page on a machine that cannot
        // run SEB must not lose an exam they never began.
        let sebPolicy = null;
        if (!env.isSEB) {
          try {
            step = "asking what this exam requires";
            sebPolicy = await fetchProctorPolicy(assignmentId);
          } catch {
            // The exam must not be unreachable because this lookup failed. The
            // server enforces SEB on every guarded route regardless of what this
            // returns, so falling through here loses nothing.
          }
          if (cancelled) return;
        }

        // SEB is required and this machine can run it: send the student to the
        // launch screen rather than into an exam the server will refuse to serve.
        if (sebPolicy?.sebRequired && sebPolicy?.sebAvailableForOs) {
          setSebLaunchInfo({
            ...sebPolicy,
            // Already inside SEB, so the launch button is not the answer and
            // pressing it again would loop straight back here.
            apiMissing: env.sebWithoutApi === true,
            detectedVersion: env.sebUserAgentVersion,
          });
          setPhase("seb_launch");
          return;
        }

        // Safe Exam Browser is its own browser. The Chrome requirement exists to
        // approximate a lockdown SEB provides outright, so it does not apply
        // here — and SEB would fail it, having neither Chrome's user-agent brand
        // nor its vendor string.
        if (!env.isSEB && (!env.isSupportedChrome || env.isEdge || env.isBrave)) {
          setPhase("unsupported");
          return;
        }

        setReadiness(assessReadiness(env));

        step = "opening the proctoring session";
        const opened = await startSession({
          assignmentId,
          testKind,
          environment: {
            browser: env.browser,
            isBrave: env.isBrave,
            platform: env.platform,
            keyboardLockSupported: env.keyboardLockSupported,
            secondMonitor: env.secondMonitor,
            // The proof, not a secret: SEB's JavaScript API hands the page a
            // hash of its Config Key and the current URL. The server checks it
            // against the URL it stored for this attempt.
            seb: {
              version: env.sebVersion,
              configKeyHash: env.sebConfigKeyHash,
              pageUrl: env.sebPageUrl,
            },
          },
        });
        if (cancelled) return;

        // Proctoring does not apply to this test at all — practice tests take
        // this path and are handed straight through untouched.
        if (opened?.policy && opened.policy.enabled === false) {
          setSession(opened);
          setPhase("active");
          onReady?.();
          return;
        }

        // The server wanted Safe Exam Browser and could not confirm it. This is
        // what a student sees if they reached the exam page directly instead of
        // launching it, or if their SEB is configured with a different Browser
        // Exam Key from the one the admin registered. Every guarded route will
        // refuse them, so send them to the launch screen rather than into a gate
        // that leads nowhere.
        if (opened?.seb?.required && !opened.seb.verified && !opened.seb.fallbackReason) {
          setSebLaunchInfo({
            sebRequired: true,
            sebAvailableForOs: env.sebAvailableForOS,
            os: env.os,
            unverified: env.isSEB,
          });
          setPhase("seb_launch");
          return;
        }

        // Running inside SEB on an exam that is not expecting it — an old .seb
        // file, or the system-wide switch turned off since. The rulebook still
        // demands a screen share, and SEB cannot produce one on any platform, so
        // the gate's Begin button would never enable. Say so instead of leaving
        // them on a screen that can never be satisfied.
        if (
          env.isSEB &&
          !opened?.seb?.verified &&
          (opened?.policy?.requiredPermissions || []).includes("screen")
        ) {
          setSebLaunchInfo({ notExpected: true, os: env.os });
          setPhase("seb_launch");
          return;
        }

        setSession(opened);
        setViolationCount(opened.violationCount || 0);
        setLimit(opened.policy?.allowedViolations ?? -1);

        transportRef.current = createTransport({
          sessionId: opened.sessionId,
          onVerdict: handleVerdict,
          onError: () => {
            // A failed report is retried by the transport. Nothing to surface.
          },
        });

        setPhase("gate");
      } catch (error) {
        if (cancelled) return;
        setStartError(
          error?.message || `Proctoring could not be started while ${step}. Please reload and try again.`
        );
        setPhase("idle");
      } finally {
        finished = true;
        clearTimeout(watchdog);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(watchdog);

      // Let a re-run actually run.
      //
      // The guard at the top refuses to start unless the phase is "idle". If
      // this effect re-runs while an attempt is still in flight — any dependency
      // changing is enough — the cleanup cancels that attempt, and without this
      // the replacement would hit the guard, return immediately, and leave the
      // student on "Loading test…" with nothing in flight and nothing to retry.
      if (!finished && phaseRef.current === "starting") {
        phaseRef.current = "idle";
      }
    };
  }, [enabled, assignmentId, testKind, handleVerdict, onReady]);

  // ── Starting and stopping the sensors ──────────────────────────────────

  const startDetectors = useCallback(() => {
    if (detectorsRef.current.length > 0) return;

    const policy = session?.policy || {};

    const keyboard = createKeyboardDetector({ report, isPaused });
    const devtools = createDevtoolsDetector({
      report,
      isPaused,
      enabled: policy.detectDevtools !== false,
    });

    keyboardRef.current = keyboard;
    devtoolsRef.current = devtools;

    // Inside Safe Exam Browser these two are not merely redundant, they are
    // traps. SEB supports no `getDisplayMedia` on any platform, so there is no
    // stream to watch and the screen detector would report a share that stopped
    // because it never started. And SEB's kiosk mode is not the Fullscreen API:
    // `document.fullscreenElement` is empty, so the fullscreen detector would
    // fire at once and raise a "return to fullscreen" overlay whose button
    // cannot succeed, locking the student out of an exam they are sitting
    // correctly. The server clears both flags for a verified SEB session.
    const watchesScreenShare = policy.requireEntireScreenShare !== false;
    const watchesFullscreen = policy.requireFullscreen !== false;

    const screen = createScreenDetector({
      report,
      isPaused,
      getStream: () => screenStreamRef.current,
      detectSecondMonitor: policy.detectSecondMonitor !== false,
      onShareStopped: () => {
        // Screen sharing is a condition of sitting the exam, not a formality.
        // This used to record the violation and let the student carry on
        // through a plain "Continue Test" button, which meant the one control
        // that makes the rest of the proctoring meaningful could be switched
        // off at will and the exam continued unobserved. Now the exam stops
        // until the share is genuinely back.
        if (phaseRef.current === "active" || phaseRef.current === "blocked") {
          setPhase("blocked");
          setBlockReason("screenshare");
        }
      },
    });
    screenRef.current = screen;

    const detectors = [
      keyboard,
      devtools,
      createClipboardDetector({
        report,
        isPaused,
        blockContextMenu: policy.blockContextMenu !== false,
      }),
      createFocusDetector({ report, isPaused }),
      watchesFullscreen &&
        createFullscreenDetector({
          report,
          isPaused,
          onExit: () => {
            // Only a click from the student can restore fullscreen, so the
            // overlay asks for one rather than pretending we can do it ourselves.
            if (phaseRef.current === "active") {
              setPhase("blocked");
              setBlockReason("fullscreen");
            }
          },
        }),
      watchesScreenShare && screen,
      createPermissionsDetector({
        report,
        isPaused,
        getMediaStream: () => mediaStreamRef.current,
        required: (policy.requiredPermissions || []).filter((p) =>
          ["camera", "microphone"].includes(p)
        ),
      }),
      createNetworkDetector({
        report,
        isPaused,
        onOffline: () => setOffline(true),
        onOnline: () => setOffline(false),
      }),
      createIntegrityDetector({
        report,
        isPaused,
        getGuardedElement: () => overlayRef.current,
        enabled: policy.detectTampering !== false,
        extensionIds: policy.blockedExtensionIds || [],
      }),
    ].filter(Boolean);

    detectors.forEach((detector) => {
      try {
        detector.start();
      } catch (error) {
        // One sensor failing must never take the exam down with it.
        console.error(`Proctoring: ${detector.name} failed to start`, error);
      }
    });

    detectorsRef.current = detectors;
  }, [session, report, isPaused]);

  const stopDetectors = useCallback(() => {
    detectorsRef.current.forEach((detector) => {
      try {
        detector.stop();
      } catch {
        // Nothing useful to do while tearing down.
      }
    });
    detectorsRef.current = [];
    keyboardRef.current = null;
    devtoolsRef.current = null;
    releaseCapture();
  }, []);

  // ── The heartbeat ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!session?.sessionId) return;
    if (!["gate", "active", "blocked"].includes(phase)) return;
    if (session.policy?.enabled === false) return;

    const interval = session.policy?.heartbeatIntervalMs || 5000;

    // Deliberately keeps running while the student is on a warning or blocking
    // overlay: going quiet is exactly what the server treats as suspicious, and
    // being stuck on a dialog is not the student's fault.
    heartbeatRef.current = setInterval(() => {
      transportRef.current?.heartbeat();
    }, interval);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [session, phase]);

  // ── Gate completion ────────────────────────────────────────────────────

  /**
   * Called by the gate once permissions are granted and the student clicks
   * Begin. That click is what lets us enter fullscreen and lock the keyboard —
   * a browser will not grant either from code alone.
   */
  const beginExam = useCallback(
    async ({ screenStream, mediaStream, permissions }) => {
      screenStreamRef.current = screenStream || null;
      mediaStreamRef.current = mediaStream || null;

      // Fullscreen FIRST, before anything is awaited.
      //
      // `requestFullscreen` only works while the browser still considers the
      // student's click "recent". Awaiting a network round-trip first — which is
      // what reporting permissions is — spends that window, and the request is
      // then refused. It fails silently, because requestFullscreen swallows the
      // rejection, so the exam simply starts in a window and the fullscreen
      // detector has nothing to detect.
      //
      // Safe Exam Browser is skipped: it is already a locked kiosk, its window
      // is not in Fullscreen API state, and asking throws on some builds. The
      // server clears this flag for a verified SEB session.
      if (session?.policy?.requireFullscreen !== false) {
        await enterFullscreen();
      }

      await transportRef.current?.reportPermissions(permissions || {});

      setPhase("active");
      startDetectors();

      // The keyboard lock needs fullscreen to already be in place.
      setTimeout(() => keyboardRef.current?.reengage?.(), 150);

      onReady?.();
    },
    [startDetectors, onReady, session]
  );

  /** The student clicked the button on the blocking overlay. */
  const resumeFromBlock = useCallback(async () => {
    if (blockReason === "fullscreen") {
      const ok = await enterFullscreen();
      if (!ok) return false;
      await keyboardRef.current?.reengage?.();
    }

    if (blockReason === "devtools" && devtoolsRef.current?.isOpen()) {
      return false;
    }

    if (blockReason === "screenshare") {
      // Ask again, and accept nothing less than the whole screen -- the same
      // standard as the pre-exam gate. Only a real, live track releases them.
      const result = await requestScreenShare();
      if (!result.ok) return false;

      screenStreamRef.current?.getTracks?.().forEach((t) => t.stop());
      screenStreamRef.current = result.stream;
      // Point the detector at the new track and clear its "already reported"
      // latch, so a second stop is caught like the first.
      screenRef.current?.rearm?.();

      // Stopping the share usually drops fullscreen too; put it back while we
      // have the student's click, which is the only thing the browser accepts.
      if (!isFullscreen()) {
        await enterFullscreen();
        await keyboardRef.current?.reengage?.();
      }
    }

    setBlockReason(null);
    setPhase("active");
    return true;
  }, [blockReason]);

  /** Dismiss a warning and carry on. */
  const dismissWarning = useCallback(async () => {
    // A warning about devtools or fullscreen is not dismissible until the thing
    // it is warning about has actually been put right.
    if (warning?.violationType === "devtools_opened" && devtoolsRef.current?.isOpen()) {
      return false;
    }
    if (warning?.violationType === "fullscreen_exit" && !isFullscreen()) {
      const ok = await enterFullscreen();
      if (!ok) return false;
      await keyboardRef.current?.reengage?.();
    }
    setWarning(null);
    return true;
  }, [warning]);

  /** Called by the page when the student submits normally. */
  const endSession = useCallback(async () => {
    stopDetectors();

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    await transportRef.current?.flushNow();
    await transportRef.current?.end();
    transportRef.current?.stop();

    screenStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    screenStreamRef.current = null;
    mediaStreamRef.current = null;

    await leaveFullscreen();
    setPhase("idle");
  }, [stopDetectors]);

  // Release everything on unmount, so a student navigating away never leaves
  // the camera or screen share running.
  useEffect(() => {
    return () => {
      stopDetectors();
      transportRef.current?.stop();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      screenStreamRef.current?.getTracks?.().forEach((t) => t.stop());
      mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    };
  }, [stopDetectors]);

  const contextValue = useMemo(
    () => ({
      phase,
      // `ready` is what an exam page waits on before fetching questions.
      ready: phase === "active" || phase === "blocked" || phase === "terminated",
      enabled,
      environment,
      readiness,
      session,
      policy: session?.policy || null,
      // True when the exam is running inside Safe Exam Browser at all — not
      // only when verification succeeded.
      //
      // The exam pages use this to send SEB to its quit URL after a submit. A
      // student whose SEB never verified is still sitting inside a locked kiosk
      // with a quit password they do not have, so tying this to `verified` left
      // exactly the people already having a bad time unable to get out.
      isSeb: environment?.isSEB === true || session?.seb?.verified === true,
      violationCount,
      limit,
      warning,
      notice,
      offline,
      startError,
      requestFullscreen: enterFullscreen,
      exitFullscreen: leaveFullscreen,
      endSession,
    }),
    [
      phase,
      enabled,
      environment,
      readiness,
      session,
      violationCount,
      limit,
      warning,
      notice,
      offline,
      startError,
      endSession,
    ]
  );

  const proctoringActive = enabled && session?.policy?.enabled !== false;

  return (
    <ProctorContext.Provider value={contextValue}>
      {children}

      {/* This exam needs Safe Exam Browser and this browser is not it. Unlike
          the unsupported-browser dialog below, this one has a way forward. */}
      {enabled && phase === "seb_launch" && (
        <SebLaunchScreen info={sebLaunchInfo} assignmentId={assignmentId} />
      )}

      {/* Unsupported browser gate */}
      {enabled && phase === "unsupported" && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
            <h2 className="mb-3 text-2xl font-bold text-white">Google Chrome Required</h2>
            <p className="mb-6 text-slate-300">
              This exam can only be taken using Google Chrome.
            </p>
            <div className="mb-6 rounded-md bg-slate-800 px-4 py-3 text-sm text-slate-400">
              Current browser: <span className="font-semibold text-rose-400">{environment?.browser || "Unknown"}</span>
            </div>
            <p className="text-xs text-slate-400">
              Please open this exam link in the latest version of Google Chrome.
            </p>
          </div>
        </div>
      )}

      {proctoringActive && phase === "gate" && (
        <ProctorGate
          session={session}
          environment={environment}
          readiness={readiness}
          onBegin={beginExam}
        />
      )}

      {proctoringActive && ["active", "blocked", "terminated"].includes(phase) && (
        <ProctorOverlay
          ref={overlayRef}
          phase={phase}
          warning={warning}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          blockReason={blockReason}
          offline={offline}
          isDevtoolsOpen={() => devtoolsRef.current?.isOpen() === true}
          onDismissWarning={dismissWarning}
          onResume={resumeFromBlock}
        />
      )}

      {/* Proctoring could not be started.
          This must be shown, not swallowed. The exam page waits on `ready`
          before it loads any questions, so a failed start leaves the student
          staring at "Loading test..." indefinitely with nothing to act on.
          That is exactly what happened when the frontend was deployed ahead of
          the backend and /api/proctor/session/start returned 404. */}
      {enabled && startError && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-slate-900 p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-red-400">Cannot start the test</h2>
            <p className="mb-6 text-slate-300">
              The proctoring system could not be started, so the test cannot begin.
            </p>
            <p className="mb-6 break-words rounded-md bg-slate-800 px-4 py-3 text-sm text-slate-400">
              {startError}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-md bg-white/90 py-3 font-semibold text-black hover:bg-white"
            >
              Try again
            </button>
            <p className="mt-4 text-xs text-slate-500">
              If this keeps happening, tell your administrator — your answers are not lost.
            </p>
          </div>
        </div>
      )}
    </ProctorContext.Provider>
  );
}

export default ProctorProvider;
