/**
 * The shared server clock (src/utils/serverClock.js) and IST formatting
 * (src/utils/istTime.js), driven with fake device clocks and timezones.
 *
 * The incident this guards: a 2:30 PM IST test (09:00 UTC) showed as
 * "Oct 7, 02:00 AM" on two students' devices, which were set to US Pacific
 * time with the clock wound 12.5 hours fast so it "looked right". The card
 * compared the window against the device clock, decided it was long over,
 * and offered "View Results" instead of "Continue Test" for the whole exam.
 *
 * Run with:  npm run test:time
 */

import {
  recordServerTime,
  serverNow,
  hasServerTime,
  windowPhase,
  windowEndMs,
  deviceClockSkewMs,
} from "../src/utils/serverClock.js";
import {
  formatDateTimeIST,
  formatFullDateTimeIST,
  formatTimeIST,
  formatDateIST,
  istDayKey,
  istHour,
  parseISTInput,
  toISTInputValue,
} from "../src/utils/istTime.js";
import { clockFromServer, secondsLeft } from "../src/utils/examClock.js";

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
const HOUR = 60 * MIN;
const START = Date.parse("2026-10-07T09:00:00.000Z"); // 2:30 PM IST
const assignment = {
  startTime: new Date(START).toISOString(),
  duration: 90,
  deadline: new Date(START + 90 * MIN).toISOString(),
};

// --- IST formatting, under every timezone a device might be left on --------

const ZONES = ["Asia/Kolkata", "America/Los_Angeles", "America/Phoenix", "UTC", "Europe/London", "Australia/Sydney"];
for (const tz of ZONES) {
  process.env.TZ = tz;
  check(`[${tz}] card date reads 2:30 PM IST`, formatDateTimeIST(START) === "Oct 7, 02:30 PM IST", formatDateTimeIST(START));
  check(
    `[${tz}] full date-time`,
    formatFullDateTimeIST(START) === "Oct 7, 2026, 02:30 PM IST",
    formatFullDateTimeIST(START)
  );
  check(`[${tz}] time of day`, formatTimeIST(START) === "02:30:00 PM IST", formatTimeIST(START));
  check(
    `[${tz}] mentor typing 14:30 schedules 09:00 UTC`,
    parseISTInput("2026-10-07T14:30")?.toISOString() === "2026-10-07T09:00:00.000Z",
    parseISTInput("2026-10-07T14:30")?.toISOString()
  );
  check(`[${tz}] input value round-trips`, toISTInputValue(START) === "2026-10-07T14:30", toISTInputValue(START));
  // 19:00 UTC is 00:30 the next day in India.
  check(`[${tz}] IST day rolls over at IST midnight`, istDayKey("2026-10-07T19:00:00Z") === "2026-10-08");
  check(`[${tz}] IST hour`, istHour("2026-10-07T19:00:00Z") === 0);
}
process.env.TZ = "America/Los_Angeles";

check("missing date -> fallback", formatDateTimeIST(null, "Not scheduled") === "Not scheduled");
check("invalid date -> fallback", formatDateIST("not a date") === "—");
check("date-only has no IST label", formatDateIST(START) === "Oct 7, 2026", formatDateIST(START));
check("garbage input is rejected", parseISTInput("14:30 tomorrow") === null);

// --- The server clock -------------------------------------------------------

const realNow = Date.now;
let perf = 1_000_000; // a fake monotonic clock
Object.defineProperty(globalThis, "performance", {
  value: { now: () => perf },
  configurable: true,
  writable: true,
});
let wall; // the device's wall clock
Date.now = () => wall;

// Real time 3:04 PM IST -- when Diya opened the exam -- on a device 12.5h fast.
const REAL = START + 34 * MIN;
const SKEW = 12.5 * HOUR;
wall = REAL + SKEW;

check("before any sample, falls back to the device clock", !hasServerTime() && serverNow() === wall);
check(
  "the bug: on the device clock the window looks closed",
  windowPhase(assignment, Date.now()).closed === true
);

// A response stamped at REAL arrives after a 200 ms round trip.
recordServerTime(REAL - 100, perf - 200, perf);
check("one sample: server time to within the round trip", Math.abs(serverNow() - REAL) <= 100, serverNow() - REAL);
check("device skew is measured", Math.abs(deviceClockSkewMs() - SKEW) <= 100, deviceClockSkewMs());

let phase = windowPhase(assignment, serverNow());
check("the fix: window is open on the server clock", phase.open && !phase.closed && !phase.notStarted);

// Time passes normally.
perf += 10 * MIN;
wall += 10 * MIN;
check("advances with the monotonic clock", Math.abs(serverNow() - (REAL + 10 * MIN)) <= 100);

// The student winds the device clock forward another 3 hours mid-session.
wall += 3 * HOUR;
check("winding the device clock does not move server time", Math.abs(serverNow() - (REAL + 10 * MIN)) <= 100);
check("... and the window is still open", windowPhase(assignment, serverNow()).open);

// A sample with a worse round trip does not replace a better one unless the
// current one is distrusted (it is now, after the jump), so this is accepted.
recordServerTime(REAL + 10 * MIN, perf - 1000, perf);
check("after a jump, the next sample is taken whatever its round trip", Math.abs(serverNow() - (REAL + 10 * MIN + 500)) <= 1);

// A sloppier sample does not replace a tighter one.
recordServerTime(REAL + 10 * MIN, perf - 100, perf); // tight
const tight = serverNow();
recordServerTime(REAL + 10 * MIN + 5000, perf - 4000, perf); // loose, and 5s off
check("a sloppier sample does not replace a tighter one", serverNow() === tight);

// The window closes at 4:00 PM IST by the server clock, and not before.
const toEnd = START + 90 * MIN - serverNow();
perf += toEnd - 1000;
wall += toEnd - 1000;
check("one second before the deadline: still open", windowPhase(assignment, serverNow()).open);
perf += 2000;
wall += 2000;
check("one second after: closed", windowPhase(assignment, serverNow()).closed);

// Window end follows the server's rule: deadline, else start + duration.
check("window end uses deadline", windowEndMs(assignment) === START + 90 * MIN);
check(
  "window end falls back to start + duration",
  windowEndMs({ startTime: assignment.startTime, duration: 60 }) === START + 60 * MIN
);
check("no start time -> nothing claimed", JSON.stringify(windowPhase({}, serverNow())) === JSON.stringify({ notStarted: false, open: false, closed: false }));

// --- The exam countdown reads the same clock --------------------------------

const clock = clockFromServer({
  attemptEndsAt: new Date(serverNow() + 30 * MIN).toISOString(),
  serverNow: new Date(serverNow()).toISOString(),
});
check("exam countdown: 30 minutes left", secondsLeft(clock) === 30 * 60, secondsLeft(clock));
wall += 5 * HOUR; // device clock changed during the exam
check("exam countdown ignores a device clock change", secondsLeft(clock) === 30 * 60, secondsLeft(clock));

Date.now = realNow;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
