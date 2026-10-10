/**
 * The external-monitor check, against a fake browser.
 *
 * Covers what each real browser presents: Chrome/Edge with one screen, with a
 * monitor extending the desktop, with the window-management feature blocked
 * by a permissions policy, Chrome 100-110 (where the feature had its old name),
 * Firefox and Safari (no API at all), and a browser that throws on access.
 * Then the mid-exam detector: plug in, unplug, and what gets reported when.
 *
 * Also checks that the page's verdict matches the server's for every report,
 * because the gate unlocks on the page's reading and the server serves the
 * paper on its own -- if they disagreed, Begin could open onto nothing.
 *
 * Run with:  npm run test:display
 */

import { detectDisplays, detectSecondMonitor, windowManagementAllowed } from "../src/proctoring/environment.js";
import { createDisplayDetector } from "../src/proctoring/detectors/display.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeDisplayReport } = require("../../Backend/services/browserRequirement.js");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail !== "" ? `  -> ${JSON.stringify(detail)}` : ""}`); }
};

// ── Fake browser ───────────────────────────────────────────────────────────
const screenListeners = {};
const fakeScreen = {
  addEventListener: (t, fn) => { (screenListeners[t] ||= []).push(fn); },
  removeEventListener: (t, fn) => { screenListeners[t] = (screenListeners[t] || []).filter((f) => f !== fn); },
};
globalThis.window = { screen: fakeScreen };
globalThis.document = {};

/** Set what the browser exposes. `isExtended: undefined` means no API. */
function browser({ isExtended, policy } = {}) {
  if (isExtended === undefined) delete fakeScreen.isExtended;
  else if (isExtended === "throws") {
    Object.defineProperty(fakeScreen, "isExtended", { get() { throw new Error("blocked"); }, configurable: true });
  } else {
    Object.defineProperty(fakeScreen, "isExtended", { value: isExtended, configurable: true, writable: true });
  }

  delete globalThis.document.permissionsPolicy;
  delete globalThis.document.featurePolicy;
  if (policy) {
    const { api = "featurePolicy", feature = "window-management", allowed = true } = policy;
    globalThis.document[api] = {
      features: () => ["camera", "fullscreen", feature],
      allowsFeature: (name) => (name === feature ? allowed : true),
    };
  }
}

// ── detectDisplays: one reading ────────────────────────────────────────────
console.log("\n════ What each browser reports ════\n");

const CASES = [
  ["Chrome, one screen", { isExtended: false, policy: {} }, "single"],
  ["Chrome, external monitor extending the desktop", { isExtended: true, policy: {} }, "multiple"],
  ["Chrome, window-management blocked by policy (isExtended reads false)", { isExtended: false, policy: { allowed: false } }, "unverified"],
  ["Chrome, blocked policy while a monitor is attached", { isExtended: true, policy: { allowed: false } }, "unverified"],
  ["Chrome 100-110: feature still called window-placement, allowed", { isExtended: false, policy: { feature: "window-placement" } }, "single"],
  ["Chrome 100-110: window-placement blocked", { isExtended: false, policy: { feature: "window-placement", allowed: false } }, "unverified"],
  ["Newer Chrome exposing document.permissionsPolicy", { isExtended: true, policy: { api: "permissionsPolicy" } }, "multiple"],
  ["No policy API at all: isExtended taken at its word", { isExtended: false }, "single"],
  ["Firefox / Safari: no isExtended", { isExtended: undefined }, "unverified"],
  ["A browser that throws on access", { isExtended: "throws", policy: {} }, "unverified"],
];
for (const [label, setup, expected] of CASES) {
  browser(setup);
  const got = detectDisplays();
  check(`${label} → ${expected}`, got.state === expected, got);
  check(`  …the server reaches the same verdict`, normalizeDisplayReport({ isExtended: got.isExtended, policyAllowed: got.policyAllowed }) === got.state, got);
}

browser({ isExtended: true, policy: {} });
check("detectSecondMonitor() still answers yes/no/unknown", detectSecondMonitor() === "yes");
browser({ isExtended: undefined });
check("…unknown where the browser cannot say", detectSecondMonitor() === "unknown");

globalThis.document.featurePolicy = { allowsFeature: () => { throw new Error("x"); }, features: () => ["window-management"] };
check("windowManagementAllowed never throws", windowManagementAllowed() === null);

// ── The mid-exam detector ──────────────────────────────────────────────────
console.log("\n════ Mid-exam: plug in, unplug ════\n");

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let tick = null;
globalThis.setInterval = (fn) => { tick = fn; return 1; };
globalThis.clearInterval = () => { tick = null; };

browser({ isExtended: false, policy: {} });
const reports = [];
const changes = [];
let paused = false;
const detector = createDisplayDetector({
  report: (type, details) => reports.push({ type, details }),
  isPaused: () => paused,
  onChange: (state, previous) => changes.push({ state, previous }),
});

detector.start();
check("Start with one screen: no report", reports.length === 0, reports);
check("…the initial state is announced once (so the server is in step)", changes.length === 1 && changes[0].state === "single" && changes[0].previous === null, changes);
tick();
check("Nothing changes, nothing happens", changes.length === 1 && reports.length === 0);

fakeScreen.isExtended = true;
tick();
check("Monitor plugged in: charged once", reports.length === 1 && reports[0].type === "second_monitor_detected", reports);
check("…and the provider is told, so it can pause the exam", changes.at(-1)?.state === "multiple", changes);

paused = true; // the exam is now behind the overlay
tick(); tick();
check("While paused and still plugged in: no further reports", reports.length === 1, reports);

fakeScreen.isExtended = false;
tick();
check("Unplugged while paused: detected (the detector keeps watching)", changes.at(-1)?.state === "single", changes);
check("…and unplugging costs nothing", reports.length === 1, reports);

paused = false;
fakeScreen.isExtended = true;
(screenListeners.change || []).forEach((fn) => fn());
check("Plugged in again: the screen 'change' event is caught without waiting for the poll", reports.length === 2 && changes.at(-1)?.state === "multiple", { reports, changes });

fakeScreen.isExtended = false;
tick();
paused = true;
fakeScreen.isExtended = true;
tick();
check("Plugged in while already paused for something else: blocks, but not charged", reports.length === 2 && changes.at(-1)?.state === "multiple", { reports, changes });

detector.stop();
check("stop() removes the poll and the change listener", tick === null && (screenListeners.change || []).length === 0);

browser({ isExtended: true, policy: {} });
const reports2 = [];
const changes2 = [];
const d2 = createDisplayDetector({ report: (t) => reports2.push(t), isPaused: () => false, onChange: (s) => changes2.push(s) });
d2.start();
check("A monitor already attached when the detector starts: blocks but is not charged (the gate owns that case)", reports2.length === 0 && changes2[0] === "multiple", { reports2, changes2 });
d2.stop();

globalThis.setInterval = realSetInterval;
globalThis.clearInterval = realClearInterval;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
