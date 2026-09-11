/**
 * Drives the real focus detector against a fake DOM, replaying the exact event
 * sequences a browser produces. Tests both the false positives reported by the
 * user and the real cheating it must still catch.
 */

import { createFocusDetector } from "../src/proctoring/detectors/focus.js";

// ── Minimal fake browser ───────────────────────────────────────────────────
let now = 0;
const timers = [];
const realSetTimeout = globalThis.setTimeout;

globalThis.setTimeout = (fn, ms) => { const id = { fn, at: now + ms, kind: "t" }; timers.push(id); return id; };
globalThis.clearTimeout = (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); };
globalThis.setInterval = (fn, ms) => { const id = { fn, at: now + ms, every: ms, kind: "i" }; timers.push(id); return id; };
globalThis.clearInterval = globalThis.clearTimeout;

// Tie Date.now() to the virtual clock -- the detector measures elapsed time
// with it, so leaving it on real time makes every duration guard meaningless.
const EPOCH = 1_700_000_000_000;
Date.now = () => EPOCH + now;

/** Advance virtual time, firing timers in order. */
function advance(ms) {
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    if (due.kind === "i") due.at = now + due.every;
    else timers.splice(timers.indexOf(due), 1);
    due.fn();
  }
  now = target;
}

const listeners = { doc: {}, win: {} };
const mk = (bag) => ({
  addEventListener: (type, fn) => { (bag[type] ||= []).push(fn); },
  removeEventListener: (type, fn) => { bag[type] = (bag[type] || []).filter((f) => f !== fn); },
});

globalThis.document = {
  ...mk(listeners.doc),
  visibilityState: "visible",
  hasFocus: () => globalThis.__hasFocus,
};
globalThis.window = { ...mk(listeners.win) };
globalThis.__hasFocus = true;

const fire = (bag, type) => (listeners[bag][type] || []).slice().forEach((fn) => fn());

// ── Browser actions, as a real browser would sequence them ─────────────────
const browser = {
  /** Focus moves to browser chrome: address bar, extension popup, the
   *  "you are sharing your screen" bar. The page stays fully visible. */
  focusLeavesToChrome() { globalThis.__hasFocus = false; fire("win", "blur"); },
  focusReturnsToPage() { globalThis.__hasFocus = true; fire("win", "focus"); },
  /** Tab switch / minimise: the document genuinely stops being visible. */
  tabHidden() { globalThis.__hasFocus = false; document.visibilityState = "hidden"; fire("win", "blur"); fire("doc", "visibilitychange"); },
  tabVisible() { globalThis.__hasFocus = true; document.visibilityState = "visible"; fire("doc", "visibilitychange"); fire("win", "focus"); },
  /** Switching to another app; the exam window may stay on screen. */
  switchedToAnotherApp() { globalThis.__hasFocus = false; fire("win", "blur"); },
  studentInteracts() { fire("doc", "mousemove"); },
};

// ── Test harness ───────────────────────────────────────────────────────────
let pass = 0, fail = 0;

function scenario(label, expected, script) {
  now = 0; timers.length = 0;
  for (const k of Object.keys(listeners.doc)) delete listeners.doc[k];
  for (const k of Object.keys(listeners.win)) delete listeners.win[k];
  globalThis.document.visibilityState = "visible";
  globalThis.__hasFocus = true;

  const reported = [];
  const det = createFocusDetector({ report: (type) => reported.push(type), isPaused: () => false });
  det.start();
  script();
  det.stop();

  const got = reported.length;
  const ok = got === expected;
  ok ? pass++ : fail++;
  const detail = reported.length ? `  [${reported.join(", ")}]` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  expected ${expected}, got ${got}${detail}   ${label}`);
}

console.log("\n════ The false positives you reported ════\n");

scenario("Click 'Hide' on Chrome's screen-sharing bar, then carry on", 0, () => {
  browser.focusLeavesToChrome();
  advance(600);
  browser.focusReturnsToPage();
  advance(10000);
});

scenario("Click the sharing bar and leave focus in chrome for 30s", 1, () => {
  browser.focusLeavesToChrome();
  advance(30000);          // old code: a violation every ~2s for 30s
});

scenario("Sitting still, doing nothing, for two minutes", 0, () => {
  advance(120000);
});

scenario("Answering questions for two minutes", 0, () => {
  for (let i = 0; i < 60; i++) { browser.studentInteracts(); advance(2000); }
});

scenario("Brief blur during the fullscreen transition at exam start", 0, () => {
  browser.focusLeavesToChrome();
  advance(200);
  browser.focusReturnsToPage();
  advance(5000);
});

scenario("Focus flickers to chrome and back repeatedly", 0, () => {
  for (let i = 0; i < 8; i++) {
    browser.focusLeavesToChrome();
    advance(400);
    browser.focusReturnsToPage();
    advance(1500);
  }
});

// One stray mouse move then ten seconds of nothing, with focus still sitting in
// browser chrome, is a real departure. Reporting it ONCE is correct -- the bug
// was reporting it every couple of seconds, forever.
scenario("Blur to chrome, one mouse move, then idle 10s -> reported once", 1, () => {
  browser.focusLeavesToChrome();
  advance(500);
  browser.studentInteracts();
  advance(10000);
});

scenario("Student keeps working while focus sits in chrome", 0, () => {
  browser.focusLeavesToChrome();
  for (let i = 0; i < 20; i++) { browser.studentInteracts(); advance(800); }
});

scenario("Sharing bar clicked, student carries on working for a minute", 0, () => {
  browser.focusLeavesToChrome();
  advance(300);
  browser.focusReturnsToPage();
  for (let i = 0; i < 30; i++) { browser.studentInteracts(); advance(2000); }
});

console.log("\n════ Real cheating, which must still be caught ════\n");

scenario("Switches browser tab and stays away", 1, () => {
  browser.tabHidden();
  advance(10000);
});

scenario("Cmd+Tab to another app for 10 seconds", 1, () => {
  browser.switchedToAnotherApp();
  advance(10000);
});

scenario("Switches tab away and back, three separate times", 3, () => {
  for (let i = 0; i < 3; i++) {
    browser.tabHidden();
    advance(4000);
    browser.tabVisible();
    advance(4000);
  }
});

scenario("Minimises the window for a full minute", 1, () => {
  browser.tabHidden();
  advance(60000);
});

scenario("Alt+Tab away, come back, Alt+Tab away again", 2, () => {
  browser.switchedToAnotherApp();
  advance(5000);
  browser.focusReturnsToPage();
  advance(3000);
  browser.switchedToAnotherApp();
  advance(5000);
});

scenario("Window pushed behind another without a blur event (poll fallback)", 1, () => {
  globalThis.__hasFocus = false;   // no event fired at all
  advance(10000);
});

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
globalThis.setTimeout = realSetTimeout;
process.exit(fail === 0 ? 0 : 1);
