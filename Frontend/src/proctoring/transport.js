import apiRequest from "../services/api";

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
          body: JSON.stringify({ sessionId }),
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
