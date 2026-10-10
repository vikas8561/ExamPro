/**
 * The exam countdown, in one place.
 *
 * TakeTest and TakeCodingTest each used to work out the time left as
 * `startTime + duration - now`: the assignment's availability window. The
 * server ends an attempt at the EARLIER of that window and `startedAt + the
 * test's time limit` (Backend/services/attemptWindow.js). Whenever the window
 * was longer than the time limit -- a 60-minute test open for two hours -- the
 * page showed far more time than the student had. The server stopped
 * accepting their paper at the time limit, the sweep finalised it from
 * autosaves, and the page still said there was an hour left.
 *
 * The pages no longer derive the end time at all. The server sends
 * `attemptEndsAt` (computed by that same rule) and `serverNow`, and the page
 * counts down to that instant.
 *
 * Two more things this fixes:
 *
 *  - The old countdown subtracted one per setInterval tick. Browsers throttle
 *    timers in background tabs to about once a minute, so a student who
 *    switched away came back to a clock that had barely moved. Counting down to
 *    a fixed instant from Date.now() is right however often it runs.
 *  - A student's machine clock can be wrong by minutes -- or hours. The
 *    countdown reads the shared server clock (serverClock.js), which every API
 *    response keeps synced and which advances on a monotonic clock, so winding
 *    the device's clock mid-exam does not move it. `offsetMs`, measured from
 *    the payload's `serverNow`, is the fallback for when no server sample has
 *    been taken at all.
 */

// Explicit extension: this module also loads under plain Node
// (scripts/exam-clock-scenarios.mjs).
import { hasServerTime, serverNow } from "./serverClock.js";

/**
 * Build a clock from a server payload carrying `attemptEndsAt` and `serverNow`
 * (GET /assignments/:id, POST /assignments/:id/start, check-expiration).
 *
 * Returns null when the payload does not say when the attempt ends; callers
 * fall back to `clockFromAssignment`.
 */
export function clockFromServer(payload) {
  const endsAtMs = Date.parse(payload?.attemptEndsAt);
  if (!Number.isFinite(endsAtMs)) return null;

  const serverNowMs = Date.parse(payload?.serverNow);
  const offsetMs = Number.isFinite(serverNowMs) ? serverNowMs - Date.now() : 0;
  return { endsAtMs, offsetMs };
}

/**
 * The same rule the server applies, for a server that predates `attemptEndsAt`
 * (a frontend deployed ahead of its API). The earlier of the window's end and
 * startedAt + timeLimit. `serverNowMs` is the server's clock, if known.
 */
export function clockFromAssignment(assignment, timeLimitMinutes, serverNowMs) {
  const ends = [];

  if (assignment?.deadline) {
    ends.push(Date.parse(assignment.deadline));
  } else if (assignment?.startTime && assignment?.duration) {
    ends.push(Date.parse(assignment.startTime) + assignment.duration * 60000);
  }
  if (assignment?.startedAt && timeLimitMinutes) {
    ends.push(Date.parse(assignment.startedAt) + timeLimitMinutes * 60000);
  }

  const valid = ends.filter(Number.isFinite);
  if (!valid.length) return null;

  const offsetMs = Number.isFinite(serverNowMs) ? serverNowMs - Date.now() : 0;
  return { endsAtMs: Math.min(...valid), offsetMs };
}

/**
 * Whole seconds left on `clock` right now, never negative.
 *
 * With no `nowMs`, "now" is the shared server clock once it has a sample, and
 * the device clock corrected by `offsetMs` until then. A given `nowMs` is a
 * device-clock reading and is corrected by `offsetMs`.
 */
export function secondsLeft(clock, nowMs) {
  if (!clock) return 0;
  const now =
    nowMs === undefined && hasServerTime() ? serverNow() : (nowMs ?? Date.now()) + clock.offsetMs;
  return Math.max(0, Math.floor((clock.endsAtMs - now) / 1000));
}

/**
 * The clock for an exam payload: the server's own figure when it sent one,
 * the shared rule otherwise.
 */
export function examClock(payload, assignment, timeLimitMinutes) {
  return (
    clockFromServer(payload) ||
    clockFromAssignment(assignment, timeLimitMinutes, Date.parse(payload?.serverNow))
  );
}
