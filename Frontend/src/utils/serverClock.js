/**
 * The one clock every page decides time with: the server's.
 *
 * A student's device clock cannot be trusted. Two students sat a 2:30 PM test
 * on devices whose timezone was US Pacific and whose clock had been set by hand
 * to "look right" -- 12.5 hours fast. The assigned-tests page compared the
 * window against `new Date()`, decided the test was long over, and offered
 * "View Results" instead of "Continue Test" for the whole window, while every
 * other student in the room saw the right button.
 *
 * So nothing that decides what a student may do reads `Date.now()` directly.
 * It reads `serverNow()`:
 *
 *  - Every API response carries `X-Server-Time` (Backend/server.js), stamped
 *    as its headers go out. The offset is estimated NTP-style -- the server's
 *    stamp is taken to fall at the midpoint of the round trip -- and the sample
 *    with the smallest uncertainty is kept.
 *  - Between samples the clock advances with `performance.now()`, a monotonic
 *    clock that changing the device's date and time does not move. A student
 *    who winds their clock forward mid-session gains nothing.
 *  - The wall clock is watched alongside it. If the two disagree by more than
 *    a couple of seconds -- the device clock was changed, or the machine slept
 *    and the monotonic clock paused -- the sample is distrusted and the clock
 *    re-syncs straight away.
 *
 * Before the first response arrives it falls back to `Date.now()`, which is
 * the best there is; pages fetch their data before drawing anything that
 * depends on the time, so in practice a sample is always in hand.
 */
// No imports on purpose: examClock.js depends on this, and the clock
// scenarios load examClock under plain Node (scripts/exam-clock-scenarios.mjs).
// The React hook lives in hooks/useServerNow.js; the URL to sync against is
// handed in by startServerClock().

/** Header the backend stamps on every response: server epoch milliseconds. */
export const SERVER_TIME_HEADER = "X-Server-Time";

// Wall and monotonic elapsed time may differ by this much before the sample is
// distrusted. Timer jitter is a few milliseconds; a clock change or a sleep is
// seconds at least.
const JUMP_TOLERANCE_MS = 2000;
// Monotonic clocks drift by parts per million. 200 ppm is generous, and only
// used to let a fresher sample replace an older, nominally tighter one.
const DRIFT_PER_MS = 0.0002;

const monotonic = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

// { serverMs, perfMs, wallMs, uncertaintyMs }: the server's time at the
// monotonic instant `perfMs`, and the wall clock read at that same instant.
let anchor = null;
let suspect = false;
let syncInFlight = null;
let timeUrl = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener failing must not stop the others hearing about it.
    }
  });
}

function currentUncertainty(perfNow) {
  if (!anchor) return Infinity;
  if (suspect) return Infinity;
  return anchor.uncertaintyMs + (perfNow - anchor.perfMs) * DRIFT_PER_MS;
}

/**
 * Feed one server timestamp in. `sentPerf` and `receivedPerf` are
 * `performance.now()` readings taken just before the request went out and
 * just after its headers came back.
 */
export function recordServerTime(serverMs, sentPerf, receivedPerf) {
  const stamp = Number(serverMs);
  if (!Number.isFinite(stamp) || stamp <= 0) return;
  if (!Number.isFinite(sentPerf) || !Number.isFinite(receivedPerf)) return;

  const rtt = Math.max(0, receivedPerf - sentPerf);
  const uncertaintyMs = rtt / 2;
  if (uncertaintyMs > currentUncertainty(receivedPerf)) return;

  // The stamp is taken to fall mid-flight, so at `receivedPerf` the server's
  // clock reads the stamp plus the return half of the trip.
  const previous = anchor ? anchor.serverMs + (receivedPerf - anchor.perfMs) : null;
  anchor = {
    serverMs: stamp + rtt / 2,
    perfMs: receivedPerf,
    wallMs: Date.now() - (monotonic() - receivedPerf),
    uncertaintyMs,
  };
  const wasSuspect = suspect;
  suspect = false;
  // Only worth a re-render when the answer actually moved.
  if (previous === null || wasSuspect || Math.abs(anchor.serverMs - previous) > 250) notify();
}

/** Record from a fetch Response, if it carries the header. */
export function recordFromResponse(response, sentPerf, receivedPerf) {
  try {
    const value = response?.headers?.get?.(SERVER_TIME_HEADER);
    if (value) recordServerTime(Number(value), sentPerf, receivedPerf);
  } catch {
    // A missing or unreadable header just means no sample this time.
  }
}

function checkForJump(perfNow) {
  if (!anchor || suspect) return;
  const wallElapsed = Date.now() - anchor.wallMs;
  const perfElapsed = perfNow - anchor.perfMs;
  if (Math.abs(wallElapsed - perfElapsed) > JUMP_TOLERANCE_MS) {
    suspect = true;
    // Deferred: this runs inside render, which must not start side effects.
    setTimeout(() => syncServerClock(), 0);
  }
}

/** The server's current time, in epoch milliseconds. */
export function serverNow() {
  if (!anchor) return Date.now();
  const perfNow = monotonic();
  checkForJump(perfNow);
  return anchor.serverMs + (perfNow - anchor.perfMs);
}

/** True once at least one server timestamp has been taken in. */
export function hasServerTime() {
  return Boolean(anchor);
}

/** How far the device clock is from the server's, in ms (device minus server). */
export function deviceClockSkewMs() {
  if (!anchor) return 0;
  return Date.now() - serverNow();
}

/** Ask the server for its time now. Concurrent calls share one request. */
export function syncServerClock() {
  if (!timeUrl) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      const sent = monotonic();
      const response = await fetch(timeUrl, { cache: "no-store" });
      const received = monotonic();
      recordFromResponse(response, sent, received);
      // An older backend without the header still sends the time in the body.
      if (!response.headers.get(SERVER_TIME_HEADER)) {
        const body = await response.json().catch(() => null);
        const ms = Number(body?.serverNow) || Date.parse(body?.serverTime);
        if (Number.isFinite(ms)) recordServerTime(ms, sent, received);
      }
    } catch {
      // Offline: keep counting from the last good sample.
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

let started = false;

/**
 * Take a first sample at startup and re-sync whenever the page comes back into
 * view or back online -- the moments a sleeping laptop or a changed clock show
 * up. `url` is the backend's GET /api/time. Safe to call more than once.
 */
export function startServerClock(url) {
  if (started || typeof window === "undefined") return;
  started = true;
  timeUrl = url;
  syncServerClock();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncServerClock();
  });
  window.addEventListener("online", () => syncServerClock());
  window.addEventListener("focus", () => {
    if (anchor) checkForJump(monotonic());
  });
}

/** Subscribe to the clock being corrected. Returns an unsubscribe function. */
export function onServerClockChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * When an assignment's window closes: its `deadline` when it has one, else
 * `startTime + duration`. The same rule the server applies
 * (Backend/routes/assignments.js, `windowEnd`). NaN when it cannot be told.
 */
export function windowEndMs(assignment) {
  const deadline = Date.parse(assignment?.deadline);
  if (Number.isFinite(deadline)) return deadline;
  const start = Date.parse(assignment?.startTime);
  const duration = Number(assignment?.duration);
  if (Number.isFinite(start) && Number.isFinite(duration) && duration > 0) {
    return start + duration * 60000;
  }
  return NaN;
}

/**
 * Where an assignment's window stands at `nowMs` (server time).
 * Every flag is false when the window cannot be determined.
 */
export function windowPhase(assignment, nowMs = serverNow()) {
  const start = Date.parse(assignment?.startTime);
  const end = windowEndMs(assignment);
  if (!Number.isFinite(start)) {
    return { notStarted: false, open: false, closed: false };
  }
  return {
    notStarted: nowMs < start,
    open: Number.isFinite(end) && nowMs >= start && nowMs <= end,
    closed: Number.isFinite(end) && nowMs >= end,
  };
}
