/**
 * Dialogs, gestures and right-click during an exam.
 *
 * Reported 2026-10-16:
 *   1. One violation brought two "Continue" dialogs.
 *   2. Trackpad gestures were not blocked.
 *   3. A right-click by mistake counted against the student.
 *
 * The server half (one act, one charge) is checked by
 * Backend/scripts/security/linked-act-check.js.
 *
 * Run with:  npm run test:exam-input
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createGestureGuard } from "../src/proctoring/detectors/gestures.js";
import { createClipboardDetector } from "../src/proctoring/detectors/clipboard.js";
import { warningForPause, isLateWarningForClearedPause, LATE_WARNING_MS } from "../src/proctoring/pauseWarnings.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let pass = 0,
  fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail !== "" ? `  -> ${JSON.stringify(detail)}` : ""}`);
  }
};

/** A target with listeners, enough for the detectors under test. */
function eventTarget(extra = {}) {
  const listeners = {};
  return {
    ...extra,
    listeners,
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    fire(type, init = {}) {
      let prevented = false;
      const event = { type, ...init, preventDefault() { prevented = true; }, stopPropagation() {} };
      (listeners[type] || []).forEach((fn) => fn(event));
      return prevented;
    },
  };
}

console.log("\n── 1. One violation, one dialog ──\n");
{
  const warn = { kind: "warning", title: "Warning", message: "Left fullscreen mode", violationType: "fullscreen_exit" };
  check("Paused for fullscreen: the warning goes inside the pause dialog",
    warningForPause({ phase: "blocked", blockReason: "fullscreen", warning: warn }) === warn);
  check("…and for a stopped screen share", warningForPause({ phase: "blocked", blockReason: "screenshare", warning: warn }) === warn);
  check("…and for an external monitor", warningForPause({ phase: "blocked", blockReason: "display", warning: warn }) === warn);
  check("Not paused: the warning stands on its own",
    warningForPause({ phase: "active", blockReason: null, warning: warn }) === null);
  check("A pause with no dialog of its own (secondmonitor) never swallows the warning",
    warningForPause({ phase: "blocked", blockReason: "secondmonitor", warning: warn }) === null);
  check("A cancellation is never folded away",
    warningForPause({ phase: "blocked", blockReason: "fullscreen", warning: { ...warn, kind: "terminate" } }) === null);

  const now = 1_000_000;
  const cleared = { reason: "fullscreen", at: now - 2000 };
  check("Warning for fullscreen arriving 2s after the student cleared that pause: a notice, not a dialog",
    isLateWarningForClearedPause({ violationType: "fullscreen_exit" }, cleared, now));
  check("…but not once LATE_WARNING_MS has passed (that is a new act)",
    !isLateWarningForClearedPause({ violationType: "fullscreen_exit" }, { ...cleared, at: now - LATE_WARNING_MS - 1 }, now));
  check("…and not for an unrelated violation (a paste is its own act)",
    !isLateWarningForClearedPause({ violationType: "paste_attempt" }, cleared, now));
  check("…and not when nothing was cleared",
    !isLateWarningForClearedPause({ violationType: "fullscreen_exit" }, null, now));
  check("A monitor warning matches either monitor pause",
    isLateWarningForClearedPause({ violationType: "second_monitor_detected" }, { reason: "secondmonitor", at: now }, now));

  const read = (p) =>
    fs.readFileSync(path.resolve(here, p), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  const overlay = read("../src/proctoring/ProctorOverlay.jsx");
  const provider = read("../src/proctoring/ProctorProvider.jsx");
  check("Overlay hides the standalone warning while it is merged", /\{warning && !blockWarning && \(/.test(overlay));
  check("Every pause dialog shows the merged warning", (overlay.match(/\{warningNote\}/g) || []).length === 3);
  check("Clearing a pause also clears its warning",
    /setWarning\(\(current\) => \(current && current\.kind !== "terminate" \? null : current\)\);\s*resolvedBlockRef\.current = \{ reason: blockReason/.test(provider));
  check("Late warnings for a cleared pause become notices",
    /if \(isLateWarningForClearedPause\(verdict, resolvedBlockRef\.current\)\) \{\s*setNotice/.test(provider));
}

console.log("\n── 2. Gestures ──\n");
{
  const root = { style: { overscrollBehavior: "auto" } };
  const body = { style: { overscrollBehavior: "" } };
  const pushes = [];
  const win = eventTarget({
    document: { documentElement: root, body },
    location: { href: "http://x/student/take-test/a1" },
    history: {
      state: { idx: 4, key: "k" },
      pushState(state, _title, url) { pushes.push({ state, url }); this.state = state; },
    },
  });
  const guard = createGestureGuard({ win });
  guard.start();

  check("Two-finger swipe Back/Forward is switched off (overscroll-behavior: none)",
    root.style.overscrollBehavior === "none" && body.style.overscrollBehavior === "none");
  check("A guard history entry at the same address, keeping the router's state",
    pushes.length === 1 && pushes[0].url === "http://x/student/take-test/a1" && pushes[0].state.idx === 4 && pushes[0].state.examGestureGuard);
  check("Mouse Back button (3) is cancelled", win.fire("mouseup", { button: 3 }) && win.fire("auxclick", { button: 3 }));
  check("Mouse Forward button (4) is cancelled", win.fire("mousedown", { button: 4 }));
  check("Left and right clicks are left alone", !win.fire("mouseup", { button: 0 }) && !win.fire("mousedown", { button: 2 }));
  check("Pinch / Ctrl+scroll zoom is cancelled", win.fire("wheel", { ctrlKey: true }));
  check("Ordinary scrolling is left alone", !win.fire("wheel", { ctrlKey: false }));
  check("Safari pinch is cancelled", win.fire("gesturestart") && win.fire("gesturechange"));

  win.history.state = { idx: 4, key: "k" }; // a Back got through: landed on the entry below
  win.fire("popstate");
  check("A Back that gets through re-arms the guard (exam stays put)", pushes.length === 2);

  guard.stop();
  check("Stopping restores the page's own overscroll setting",
    root.style.overscrollBehavior === "auto" && body.style.overscrollBehavior === "");
  check("…and stops cancelling", !win.fire("wheel", { ctrlKey: true }) && !win.fire("mouseup", { button: 3 }));
  win.fire("popstate");
  check("…and stops re-arming", pushes.length === 2);

  const src = fs.readFileSync(path.resolve(here, "../src/proctoring/detectors/gestures.js"), "utf8");
  check("Source: cancellable listeners are registered passive:false", /\{ capture: true, passive: false \}/.test(src));
  const provider = fs.readFileSync(path.resolve(here, "../src/proctoring/ProctorProvider.jsx"), "utf8");
  check("Source: the provider runs the gesture guard during the exam", /createGestureGuard\(\),/.test(provider));
}

console.log("\n── 3. Right-click ──\n");
{
  const doc = eventTarget();
  globalThis.document = doc;
  globalThis.window = eventTarget({ getSelection: () => null });
  const reports = [];
  let paused = false;
  const clip = createClipboardDetector({ report: (t) => reports.push(t), isPaused: () => paused });
  clip.start();

  const mcqOption = { tagName: "LABEL", closest: () => null };
  const theoryBox = { tagName: "TEXTAREA", closest: () => null };
  const editor = { tagName: "TEXTAREA", closest: (s) => (s === ".monaco-editor" ? {} : null) };

  check("Right-click on an MCQ option is blocked", doc.fire("contextmenu", { target: mcqOption }));
  check("Right-click in a theory answer is blocked", doc.fire("contextmenu", { target: theoryBox }));
  check("…and neither is reported (no violation, no notice)", reports.length === 0, reports);

  paused = true; // a warning or pause dialog is up
  check("Blocked even while paused (no browser menu with Back / Reload / Inspect)",
    doc.fire("contextmenu", { target: mcqOption }) && doc.fire("contextmenu", { target: editor }));
  check("…and still not reported", reports.length === 0, reports);

  paused = false;
  check("In the code editor: blocked and recorded as before (weight 0)",
    doc.fire("contextmenu", { target: editor }) && reports.join() === "context_menu", reports);
  clip.stop();

  const page = fs.readFileSync(path.resolve(here, "../src/pages/TakeTest.jsx"), "utf8");
  check("TakeTest blocks right-click for the whole page lifetime, outside the code editor",
    /document\.addEventListener\("contextmenu", blockContextMenu, true\)/.test(page) &&
      /closest\?\.\("\.monaco-editor"\)\) return;\s*event\.preventDefault\(\);/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
