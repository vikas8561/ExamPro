/**
 * Drives the keyboard and devtools detectors against a fake DOM, covering the
 * cases that previously locked students out of their own exam.
 *
 * Run with:  npm run test:detectors
 */

import { createKeyboardDetector } from "../src/proctoring/detectors/keyboard.js";
import { createDevtoolsDetector } from "../src/proctoring/detectors/devtools.js";
import { createClipboardDetector } from "../src/proctoring/detectors/clipboard.js";

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
const docListeners = {};
globalThis.document = {
  addEventListener: (t, fn) => { (docListeners[t] ||= []).push(fn); },
  removeEventListener: (t, fn) => { docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn); },
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

// Editing shortcuts, inside an answer field only. A keyboard that swallows
// Ctrl+A and Ctrl+Z cannot be written with, which made theory and coding papers
// miserable to sit. The clipboard keys are let through to the editor here; the
// clipboard detector is what actually stops the copy or paste.
check("Ctrl+A selects all in a textarea", !press({ key: "a", ctrl: true }, ta).prevented);
check("Ctrl+Z undoes in a textarea", !press({ key: "z", ctrl: true }, ta).prevented);
check("Ctrl+Shift+Z redoes in the code editor", !press({ key: "z", ctrl: true, shift: true }, mo).prevented);
check("Ctrl+Y redoes in a textarea", !press({ key: "y", ctrl: true }, ta).prevented);
check("Ctrl+C reaches the editor", !press({ key: "c", ctrl: true }, ta).prevented);
check("Ctrl+V reaches the editor", !press({ key: "v", ctrl: true }, mo).prevented);
check("Ctrl+X reaches the editor", !press({ key: "x", ctrl: true }, ta).prevented);
check("Cmd+C reaches the editor on a Mac", !press({ key: "c", meta: true }, ta).prevented);
check("Ctrl+Left jumps a word", !press({ key: "ArrowLeft", ctrl: true }, ta).prevented);
check("Cmd+Right goes to end of line", !press({ key: "ArrowRight", meta: true }, mo).prevented);
check("Ctrl+Backspace deletes a word", !press({ key: "Backspace", ctrl: true }, ta).prevented);
check("Option+Backspace deletes a word on a Mac", !press({ key: "Backspace", alt: true }, ta).prevented);

console.log("\n════ Keyboard: an MCQ paper stays fully locked ════\n");

// The rule is the answer field, not the exam type -- and an MCQ paper is
// answered with radio buttons, so it has no field and nothing opens up.
const mcq = field("div");
check("Ctrl+A is blocked on an MCQ paper", press({ key: "a", ctrl: true }, mcq).prevented);
check("Ctrl+C is blocked on an MCQ paper", press({ key: "c", ctrl: true }, mcq).prevented);
check("Ctrl+V is blocked on an MCQ paper", press({ key: "v", ctrl: true }, mcq).prevented);
check("Ctrl+Z is blocked on an MCQ paper", press({ key: "z", ctrl: true }, mcq).prevented);
check("Ctrl+Left is blocked on an MCQ paper", press({ key: "ArrowLeft", ctrl: true }, mcq).prevented);

console.log("\n════ Keyboard: escape routes must still be blocked ════\n");

// Absent from the editing allowlist on purpose -- these leave the exam.
check("Ctrl+T (new tab) is blocked", press({ key: "t", ctrl: true }, ta).prevented);
check("Ctrl+W (close tab) is blocked", press({ key: "w", ctrl: true }, ta).prevented);
check("Ctrl+N (new window) is blocked", press({ key: "n", ctrl: true }, ta).prevented);
check("Ctrl+R (reload) is blocked", press({ key: "r", ctrl: true }, ta).prevented);
check("Ctrl+S (save page) is blocked", press({ key: "s", ctrl: true }, ta).prevented);
check("Ctrl+P (print) is blocked", press({ key: "p", ctrl: true }, ta).prevented);
check("Ctrl+U (view source) is blocked", press({ key: "u", ctrl: true }, ta).prevented);
check("Ctrl+F (find on page) is blocked", press({ key: "f", ctrl: true }, ta).prevented);
// Alt+Left is the browser's Back button on Windows and Linux, so it stays
// blocked even though Option+Left is word-wise movement on a Mac.
check("Alt+Left (browser back) is blocked", press({ key: "ArrowLeft", alt: true }, ta).prevented);
check("Alt+Right (browser forward) is blocked", press({ key: "ArrowRight", alt: true }, ta).prevented);
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

// ── Clipboard ──────────────────────────────────────────────────────────────
console.log("\n════ Clipboard: still blocked, but a reflex is not a violation ════\n");

const clipReports = [];
const clip = createClipboardDetector({
  report: (t, d) => clipReports.push(`${t}:${d}`),
  isPaused: () => false,
});
clip.start();

function clipboardEvent(type, target) {
  let prevented = false;
  const ev = { type, target, preventDefault() { prevented = true; }, stopPropagation() {} };
  (docListeners[type] || []).forEach((fn) => fn(ev));
  return { prevented };
}

const fire = (type, target) => {
  clipReports.length = 0;
  const { prevented } = clipboardEvent(type, target);
  return { prevented, reports: clipReports.length };
};

// The clipboard itself stays shut everywhere -- that has not changed.
check("copy is still prevented in an answer field", fire("copy", ta).prevented);
check("paste is still prevented in an answer field", fire("paste", ta).prevented);
check("copy is still prevented outside an answer field", fire("copy", field("div")).prevented);

// What changed: copying your own writing no longer costs a violation. It used
// to be unreachable because the keyboard detector ate Ctrl+C first; now that the
// key reaches the editor, charging for it would let one reflex -- at weight 1,
// against a default budget of 0 -- cancel the whole exam.
check("copying inside an answer field is NOT reported", fire("copy", ta).reports === 0);
check("cutting inside an answer field is NOT reported", fire("cut", ta).reports === 0);
check("copying the question text IS still reported", fire("copy", field("div")).reports === 1);
check("cutting outside an answer field IS still reported", fire("cut", field("div")).reports === 1);

// Paste is content arriving from outside the exam, so it stays on the record
// wherever it happens -- that is the one signal here worth a mentor's time.
check("pasting into an answer field IS reported", fire("paste", ta).reports === 1);
check("pasting outside an answer field IS reported", fire("paste", field("div")).reports === 1);

clip.stop();

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
