/**
 * The exam countdown (src/utils/examClock.js), driven with fixed clocks.
 *
 * The bug this guards: both exam pages counted down startTime + duration -- the
 * availability window -- while the server ends an attempt at the EARLIER of
 * that window and startedAt + the test's time limit. A 60-minute test open for
 * two hours showed the student two hours.
 *
 * Run with:  npm run test:clock
 */

import {
  clockFromServer,
  clockFromAssignment,
  secondsLeft,
  examClock,
} from "../src/utils/examClock.js";

let pass = 0,
  fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
};

const MIN = 60 * 1000;
const T0 = Date.parse("2026-10-02T09:00:00.000Z"); // window opens
const iso = (ms) => new Date(ms).toISOString();

// Run every check with Date.now() pinned, so nothing depends on when it runs.
const realNow = Date.now;
const at = (ms, fn) => {
  Date.now = () => ms;
  try {
    return fn();
  } finally {
    Date.now = realNow;
  }
};

console.log("\n── The reported bug: window longer than the time limit ──\n");
{
  // 120-minute window, 60-minute test, started the moment the window opened.
  const assignment = { startTime: iso(T0), duration: 120, deadline: iso(T0 + 120 * MIN), startedAt: iso(T0) };
  const clock = clockFromAssignment(assignment, 60);
  const left = at(T0, () => secondsLeft(clock));
  check("Shows 60:00 (the time limit), not 120:00 (the window)", left === 60 * 60, `got ${left}s`);

  const old = Math.floor((T0 + 120 * MIN - T0) / 1000);
  check("…where the old formula showed 120:00", old === 120 * 60, `old ${old}s`);

  check("Reaches zero at startedAt + 60 min", at(T0 + 60 * MIN, () => secondsLeft(clock)) === 0);
  check("Has 1s left one second before", at(T0 + 60 * MIN - 1000, () => secondsLeft(clock)) === 1);
}

console.log("\n── The window still wins when it closes first ──\n");
{
  // Started 100 min into a 120-min window: only 20 min of window left.
  const assignment = { startTime: iso(T0), duration: 120, deadline: iso(T0 + 120 * MIN), startedAt: iso(T0 + 100 * MIN) };
  const clock = clockFromAssignment(assignment, 60);
  const left = at(T0 + 100 * MIN, () => secondsLeft(clock));
  check("Late starter gets the 20 minutes the window has left, not 60", left === 20 * 60, `got ${left}s`);
}

console.log("\n── duration == time limit (the common case) is unchanged ──\n");
{
  const assignment = { startTime: iso(T0), duration: 60, deadline: iso(T0 + 60 * MIN), startedAt: iso(T0 + 5 * MIN) };
  const clock = clockFromAssignment(assignment, 60);
  const left = at(T0 + 5 * MIN, () => secondsLeft(clock));
  check("Started 5 min late: 55 min left, same as before the fix", left === 55 * 60, `got ${left}s`);
}

console.log("\n── The server's figure is used when it is sent ──\n");
{
  const payload = { attemptEndsAt: iso(T0 + 45 * MIN), serverNow: iso(T0) };
  const clock = at(T0, () => clockFromServer(payload));
  check("45:00 from attemptEndsAt", at(T0, () => secondsLeft(clock)) === 45 * 60);

  // examClock prefers the server's figure over anything it could derive itself.
  const misleading = { startTime: iso(T0), duration: 600, startedAt: iso(T0) };
  const preferred = at(T0, () => examClock(payload, misleading, 600));
  check("examClock prefers attemptEndsAt over the assignment fields", at(T0, () => secondsLeft(preferred)) === 45 * 60);

  check("No attemptEndsAt -> clockFromServer is null", clockFromServer({ serverNow: iso(T0) }) === null);
  check("Garbage attemptEndsAt -> clockFromServer is null", clockFromServer({ attemptEndsAt: "soon" }) === null);
}

console.log("\n── A wrong laptop clock does not change the countdown ──\n");
{
  const payload = { attemptEndsAt: iso(T0 + 30 * MIN), serverNow: iso(T0) };
  for (const [label, skew] of [["10 min fast", 10 * MIN], ["10 min slow", -10 * MIN], ["2 h fast", 120 * MIN]]) {
    const local = T0 + skew; // what this machine believes "now" is
    const clock = at(local, () => clockFromServer(payload));
    const left = at(local, () => secondsLeft(clock));
    check(`Laptop ${label}: still 30:00`, left === 30 * 60, `got ${left}s`);
    const later = at(local + 10 * MIN, () => secondsLeft(clock));
    check(`Laptop ${label}: 20:00 ten minutes later`, later === 20 * 60, `got ${later}s`);
  }
}

console.log("\n── A throttled tab catches up instead of drifting ──\n");
{
  const clock = at(T0, () => clockFromServer({ attemptEndsAt: iso(T0 + 30 * MIN), serverNow: iso(T0) }));
  // The page's interval fired once, then not again for 7 minutes (background
  // tab). The old decrement would read 29:59; the clock reads the real figure.
  const left = at(T0 + 7 * MIN, () => secondsLeft(clock));
  check("After 7 silent minutes it reads 23:00, not 29:59", left === 23 * 60, `got ${left}s`);
  check("Past the end it reads 0, never negative", at(T0 + 40 * MIN, () => secondsLeft(clock)) === 0);
}

console.log("\n── Fallback (frontend newer than its API) ──\n");
{
  const assignment = { startTime: iso(T0), duration: 90, startedAt: iso(T0 + 10 * MIN) }; // no deadline field
  const clock = at(T0 + 10 * MIN, () => examClock({ serverNow: iso(T0 + 10 * MIN) }, assignment, 30));
  const left = at(T0 + 10 * MIN, () => secondsLeft(clock));
  check("No attemptEndsAt: falls back to the same min(window, startedAt + limit) rule", left === 30 * 60, `got ${left}s`);

  const notStarted = examClock({}, { startTime: iso(T0), duration: 90 }, 30);
  check("Not started yet: falls back to the window alone", at(T0, () => secondsLeft(notStarted)) === 90 * 60);
  check("Nothing usable -> null clock reads 0", examClock({}, {}, 30) === null && secondsLeft(null) === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
