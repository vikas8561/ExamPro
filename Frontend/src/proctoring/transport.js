import apiRequest from "../services/api";
import { readSebKeyHash } from "./seb.js";

/**
 * The line between the browser and the referee.
 *
 * Everything the detectors notice goes out through here, and every decision
 * comes back through here. The browser never works out for itself whether a
 * violation means "warn" or "cancel the test" — it reports what happened and
 * does what the server says.
 *
 * Two jobs beyond plain HTTP:
 *
 *  - Batching. A burst of events (leaving fullscreen often fires several at
 *    once) becomes one request, so a flaky exam does not turn into a flood.
 *  - Surviving a bad connection. Events are retried rather than dropped,
 *    because a dropped violation is a violation that never happened.
 */

const FLUSH_DELAY_MS = 400;
const MAX_QUEUE = 50;

export function createTransport({ sessionId, onVerdict, onError }) {
  let queue = [];
  let flushTimer = null;
  let inFlight = false;
  let stopped = false;

  /** Hand a verdict to the provider, which decides what the student sees. */
  const deliver = (verdict) => {
    if (stopped || !verdict) return;
    try {
      onVerdict?.(verdict);
    } catch (error) {
      console.error("Proctoring: failed to handle server verdict", error);
    }
  };

  async function flush() {
    if (stopped || inFlight || queue.length === 0) return;

    inFlight = true;
    const batch = queue;
    queue = [];

    try {
      const verdict = await apiRequest("/proctor/session/event", {
        method: "POST",
        body: JSON.stringify({ sessionId, events: batch }),
      });
      deliver(verdict);
    } catch (error) {
      // Put the batch back so a temporary network problem does not erase the
      // record. Newer events keep their place at the end of the queue.
      queue = [...batch, ...queue].slice(-MAX_QUEUE);
      onError?.(error);
    } finally {
      inFlight = false;
      if (queue.length > 0) scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (stopped || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_DELAY_MS);
  }

  return {
    /** Record a violation. Fire and forget; the verdict arrives via onVerdict. */
    report(violationType, details) {
      if (stopped) return;
      queue.push({ violationType, details: String(details || "").slice(0, 300) });
      if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
      scheduleFlush();
    },

    /** Send anything queued right now, without waiting for the batch timer. */
    flushNow() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return flush();
    },

    /**
     * "Still here." The server treats a browser that stops saying this as a
     * browser that is hiding something, so this keeps running even while the
     * student is stuck on a warning dialog.
     */
    async heartbeat() {
      if (stopped) return null;
      try {
        const verdict = await apiRequest("/proctor/session/heartbeat", {
          method: "POST",
          // Safe Exam Browser re-proves itself here, on every check-in, rather
          // than once when the session opened. The server only trusts an SEB
          // session while this keeps arriving — otherwise a student could pass
          // the gate inside SEB, carry their session into an ordinary browser,
          // and simply go quiet.
          body: JSON.stringify({ sessionId, sebKeyHash: readSebKeyHash() }),
        });
        deliver(verdict);
        return verdict;
      } catch (error) {
        onError?.(error);
        return null;
      }
    },

    /** Tell the server which permissions were granted. Text only. */
    async reportPermissions(permissions) {
      try {
        return await apiRequest("/proctor/session/permissions", {
          method: "POST",
          body: JSON.stringify({ sessionId, permissions }),
        });
      } catch (error) {
        onError?.(error);
        return null;
      }
    },

    /** Close the session on a normal submit. */
    async end() {
      try {
        await apiRequest("/proctor/session/end", {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // The submission itself is what matters; a missed end call is harmless
        // because the session expires on its own.
      }
    },

    stop() {
      stopped = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      queue = [];
    },
  };
}

/**
 * What does this exam expect of this machine, before anything is started?
 *
 * Read-only on purpose. The page has to know whether Safe Exam Browser is
 * required before it can decide what to show, and opening a session to find out
 * would be destructive — creating one carries the assignment's violation count
 * forward and can terminate the attempt outright.
 */
export async function fetchProctorPolicy(assignmentId) {
  return apiRequest(`/proctor/policy?assignmentId=${encodeURIComponent(assignmentId)}`);
}

/** Ask for a link that opens this exam in Safe Exam Browser. */
export async function requestSebLaunch(assignmentId) {
  return apiRequest("/seb/launch", {
    method: "POST",
    body: JSON.stringify({ assignmentId }),
  });
}

/**
 * The address this attempt must be opened at inside SEB, nonce included.
 *
 * SEB starts every student at the assignments list — it has to, because its
 * configuration must be identical for everyone or the Browser Exam Key would
 * differ per student. So the exam page arrives without a nonce and reloads
 * itself at this address, which is what SEB then hashes its key against.
 */
export async function fetchSebExamUrl(assignmentId) {
  return apiRequest("/seb/exam-url", {
    method: "POST",
    body: JSON.stringify({ assignmentId }),
  });
}

/** Open or resume a proctoring session. Returns the rulebook to enforce. */
export async function startSession({ assignmentId, testKind, environment }) {
  return apiRequest("/proctor/session/start", {
    method: "POST",
    body: JSON.stringify({ assignmentId, testKind, environment }),
  });
}

/** Redeem the global bypass code for camera, microphone and location. */
export async function redeemBypass({ sessionId, otp }) {
  return apiRequest("/proctor/session/bypass", {
    method: "POST",
    body: JSON.stringify({ sessionId, otp }),
  });
}
