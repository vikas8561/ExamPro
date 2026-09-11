/**
 * Drives the keyboard and devtools detectors against a fake DOM, covering the
 * cases that previously locked students out of their own exam.
 *
 * Run with:  npm run test:detectors
 */

import { createKeyboardDetector } from "../src/proctoring/detectors/keyboard.js";
import { createDevtoolsDetector } from "../src/proctoring/detectors/devtools.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ""}`); }
};

// ── Fake DOM ───────────────────────────────────────────────────────────────
const winListeners = {};
globalThis.window = {
  addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
  removeEventListener: (t, fn) => { winListeners[t] = (winListeners[t] || []).filter((f) => f !== fn); },
  outerWidth: 1440, innerWidth: 1440,
  outerHeight: 900, innerHeight: 900,
};
globalThis.document = {
  addEventListener() {}, removeEventListener() {},
  visibilityState: "visible", hasFocus: () => true,
};
// Node exposes a read-only `navigator`, so define over it. The detector only
// checks for navigator.keyboard, which is absent here — matching Firefox/Safari.
Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true, writable: true });
globalThis.console.clear = () => {};

function field(kind) {
  if (kind === "textarea") return { tagName: "TEXTAREA", closest: () => null };
  if (kind === "monaco") return { tagName: "TEXTAREA", closest: (s) => (s === ".monaco-editor" ? {} : null) };
  return { tagName: "DIV", closest: () => null, isContentEditable: false };
}

function press(keyInit, target) {
  let prevented = false;
  const ev = {
    key: keyInit.key, code: keyInit.code,
    ctrlKey: !!keyInit.ctrl, metaKey: !!keyInit.meta,
    altKey: !!keyInit.alt, shiftKey: !!keyInit.shift,
    target: target || field("div"),
    preventDefault() { prevented = true; },
    stopPropagation() {},
  };
  (winListeners.keydown || []).forEach((fn) => fn(ev));
  return { prevented };
}

// ── Keyboard ───────────────────────────────────────────────────────────────
console.log("\n════ Keyboard: students must be able to write their answers ════\n");

const kbReports = [];
const kb = createKeyboardDetector({ report: (t, d) => kbReports.push(`${t}:${d}`), isPaused: () => false });
kb.start();

const ta = field("textarea");
const mo = field("monaco");

check("plain letter types in a textarea", !press({ key: "a" }, ta).prevented);
check("space types in a textarea", !press({ key: " " }, ta).prevented);
check("backspace works in a textarea", !press({ key: "Backspace" }, ta).prevented);
check("Enter works in the code editor", !press({ key: "Enter" }, mo).prevented);

// AltGr reports itself as Ctrl+Alt on Windows/Linux for every non-US layout.
check("AltGr @ types on a German keyboard (Ctrl+Alt+Q -> @)",
  !press({ key: "@", ctrl: true, alt: true }, ta).prevented);
check("AltGr { types in the code editor",
  !press({ key: "{", ctrl: true, alt: true }, mo).prevented);
check("AltGr [ types in the code editor",
  !press({ key: "[", ctrl: true, alt: true }, mo).prevented);
check("AltGr backslash types in the code editor",
  !press({ key: "\\", ctrl: true, alt: true }, mo).prevented);

console.log("\n════ Keyboard: escape routes must still be blocked ════\n");

check("Ctrl+C is blocked", press({ key: "c", ctrl: true }, ta).prevented);
check("Ctrl+V is blocked", press({ key: "v", ctrl: true }, ta).prevented);
check("Cmd+C is blocked", press({ key: "c", meta: true }, ta).prevented);
check("Ctrl+T (new tab) is blocked", press({ key: "t", ctrl: true }, ta).prevented);
check("F12 is blocked", press({ key: "F12" }, ta).prevented);
check("Ctrl+Shift+I is blocked", press({ key: "I", ctrl: true, shift: true }, ta).prevented);
check("Escape is swallowed", press({ key: "Escape" }, ta).prevented);
check("typing outside an answer field does nothing", press({ key: "a" }, field("div")).prevented);
// Ctrl+Alt with no character produced is a shortcut, not AltGr.
check("Ctrl+Alt+Delete-style combo is still blocked",
  press({ key: "Delete", ctrl: true, alt: true }, ta).prevented);
check("AltGr character outside an answer field is blocked",
  press({ key: "@", ctrl: true, alt: true }, field("div")).prevented);

check("one keystroke reports at most once (single listener)",
  (() => { kbReports.length = 0; press({ key: "F12" }, ta); return kbReports.length === 1; })(),
  `${kbReports.length} reports`);

kb.stop();

// ── Devtools ───────────────────────────────────────────────────────────────
console.log("\n════ Devtools: tall browser chrome must not lock a student out ════\n");

function devtoolsRun({ startGap, thenGap, label, expectOpen, expectReports }) {
  window.outerHeight = 900 + startGap;
  window.innerHeight = 900;
  const reports = [];
  const det = createDevtoolsDetector({ report: (t) => reports.push(t), isPaused: () => false, enabled: true });
  det.start();
  window.outerHeight = 900 + thenGap;
  const open = det.isOpen();
  det.stop();
  check(label, open === expectOpen && reports.length === expectReports,
    `isOpen=${open} (want ${expectOpen}), reports=${reports.length} (want ${expectReports})`);
}

// Chrome + tabs + bookmarks bar ~= 150px, and the screen-sharing bar adds ~45.
// The old absolute 160px threshold called this "devtools open" and never let go.
devtoolsRun({ startGap: 150, thenGap: 195, label: "bookmarks bar + screen-share bar is NOT devtools", expectOpen: false, expectReports: 0 });
devtoolsRun({ startGap: 150, thenGap: 150, label: "tall chrome alone is NOT devtools", expectOpen: false, expectReports: 0 });
devtoolsRun({ startGap: 0, thenGap: 0, label: "fullscreen, nothing open", expectOpen: false, expectReports: 0 });
devtoolsRun({ startGap: 80, thenGap: 420, label: "a real docked devtools pane IS detected", expectOpen: true, expectReports: 0 });

// The lockout: isOpen() must release once the pane is actually closed.
(() => {
  window.outerHeight = 900 + 80; window.innerHeight = 900;
  const det = createDevtoolsDetector({ report: () => {}, isPaused: () => false, enabled: true });
  det.start();
  window.outerHeight = 900 + 420;            // devtools opened
  const whileOpen = det.isOpen();
  window.outerHeight = 900 + 80;             // student closes it
  const afterClose = det.isOpen();
  det.stop();
  check("student can dismiss the dialog once devtools is genuinely closed",
    whileOpen === true && afterClose === false, `open=${whileOpen} afterClose=${afterClose}`);
})();

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
