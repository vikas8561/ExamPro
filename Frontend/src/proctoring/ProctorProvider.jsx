import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { inspectEnvironment, assessReadiness } from "./environment";
import { createTransport, startSession } from "./transport";
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
import ProctorGate from "./ProctorGate";
import ProctorOverlay from "./ProctorOverlay";
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

  const [violationCount, setViolationCount] = useState(0);
  const [limit, setLimit] = useState(-1);
  const [warning, setWarning] = useState(null);
  const [blockReason, setBlockReason] = useState(null);
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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  const report = useCallback((violationType, details) => {
    transportRef.current?.report(violationType, details);
  }, []);

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
    setPhase("starting");

    (async () => {
      try {
        const env = await inspectEnvironment();
        if (cancelled) return;

        setEnvironment(env);
        setReadiness(assessReadiness(env));

        const opened = await startSession({
          assignmentId,
          testKind,
          environment: {
            browser: env.browser,
            isBrave: env.isBrave,
            platform: env.platform,
            keyboardLockSupported: env.keyboardLockSupported,
            secondMonitor: env.secondMonitor,
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
          error?.message || "Proctoring could not be started. Please reload and try again."
        );
        setPhase("idle");
      }
    })();

    return () => {
      cancelled = true;
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
      screen,
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
      }),
    ];

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

      await transportRef.current?.reportPermissions(permissions || {});
      await enterFullscreen();

      setPhase("active");
      startDetectors();

      // The keyboard lock needs fullscreen to already be in place.
      setTimeout(() => keyboardRef.current?.reengage?.(), 150);

      onReady?.();
    },
    [startDetectors, onReady]
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
      violationCount,
      limit,
      warning,
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
      offline,
      startError,
      endSession,
    ]
  );

  const proctoringActive = enabled && session?.policy?.enabled !== false;

  return (
    <ProctorContext.Provider value={contextValue}>
      {children}

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
