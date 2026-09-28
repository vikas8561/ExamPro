/**
 * Clipboard provenance — pasting your own code must not end your exam.
 *
 * The bug this guards against was real and it cost students whole papers: a
 * paste was charged a violation wherever it happened, the default allowance is
 * zero, so the first time anyone moved a block of code around inside the editor
 * their coding test was cancelled. Copy was already exempted inside an answer
 * field for exactly this reason; paste never was.
 *
 * The detector now tells the two cases apart by remembering what was copied
 * from inside the exam and matching it against what arrives on a paste. That
 * matching is the security boundary, so it is checked here directly:
 *
 *   1. Text copied inside an answer field pastes back free, and is not blocked.
 *   2. Text that was never copied inside the exam is blocked and charged.
 *   3. An internal paste into something that is not an answer field is still
 *      blocked — the provenance exemption does not travel.
 *   4. A zero-weight paste cannot cancel an exam; a charged one still can.
 *
 * Pure unit checks: no server, no database, no browser. The DOM is stubbed to
 * exactly the surface the detector touches, so this runs anywhere Node does.
 */

const path = require("path");
const policy = require("../../services/proctorPolicy");

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

// ── A DOM stub, covering only what the clipboard detector uses ────────────

const listeners = [];

function makeDocument() {
  return {
    activeElement: null,
    addEventListener(type, handler, capture) {
      listeners.push({ type, handler, capture: capture === true });
    },
    removeEventListener(type, handler, capture) {
      const i = listeners.findIndex(
        (l) => l.type === type && l.handler === handler && l.capture === (capture === true)
      );
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}

/** An element that looks like the textarea Monaco keeps its selection in. */
function monacoField(value, start = 0, end = value.length) {
  return {
    tagName: "TEXTAREA",
    value,
    selectionStart: start,
    selectionEnd: end,
    closest: (selector) => (selector === ".monaco-editor" ? {} : null),
  };
}

/** Somewhere the student is not meant to be typing. */
function pageBody() {
  return { tagName: "DIV", closest: () => null };
}

function makeEvent(type, target, clipboardText) {
  const data = new Map();
  if (typeof clipboardText === "string") data.set("text/plain", clipboardText);
  return {
    type,
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    clipboardData: {
      getData: (mime) => data.get(mime) || "",
      setData: (mime, value) => data.set(mime, value),
    },
  };
}

/** Dispatch the way a browser does: capture handlers first, then bubble. */
function dispatch(event) {
  for (const l of listeners.filter((x) => x.type === event.type && x.capture)) l.handler(event);
  for (const l of listeners.filter((x) => x.type === event.type && !x.capture)) l.handler(event);
  return event;
}

// ── Load the detector, which is frontend ESM ──────────────────────────────

async function loadDetector() {
  global.document = makeDocument();
  global.window = { getSelection: () => ({ toString: () => "" }) };
  const file = path.resolve(
    __dirname,
    "../../../Frontend/src/proctoring/detectors/clipboard.js"
  );
  const mod = await import(`file://${file}`);
  return mod.createClipboardDetector;
}

async function main() {
  const createClipboardDetector = await loadDetector();

  const reported = [];
  const detector = createClipboardDetector({
    report: (violationType, details) => reported.push({ violationType, details }),
    isPaused: () => false,
  });
  detector.start();

  // 1. The student copies a block of their own code, then pastes it back.
  const SNIPPET = "for (let i = 0; i < n; i += 1) {\n  total += arr[i];\n}";
  dispatch(makeEvent("copy", monacoField(SNIPPET)));
  check("copying inside the editor is not charged", reported.length === 0, JSON.stringify(reported));

  const internal = dispatch(makeEvent("paste", monacoField(""), SNIPPET));
  check("pasting it back is allowed through to the editor", internal.defaultPrevented === false);
  check(
    "and is recorded as internal, not as a paste from outside",
    reported.length === 1 && reported[0].violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // Windows hands back CRLF for text copied as LF. Same text, same verdict.
  reported.length = 0;
  const crlf = dispatch(makeEvent("paste", monacoField(""), SNIPPET.replace(/\n/g, "\r\n")));
  check(
    "line endings rewritten by the platform still count as the same text",
    crlf.defaultPrevented === false && reported[0]?.violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // 2. Something fetched from outside. This is what the detector is for.
  reported.length = 0;
  const external = dispatch(
    makeEvent("paste", monacoField(""), "def solve(nums):\n    return sorted(nums)")
  );
  check("a paste from outside the exam is blocked", external.defaultPrevented === true);
  check(
    "and is charged as paste_attempt",
    reported.length === 1 && reported[0].violationType === "paste_attempt",
    JSON.stringify(reported)
  );

  // A near-miss must not pass: an answer edited outside and pasted back is
  // exactly the attack the hash is protecting against.
  reported.length = 0;
  const tampered = dispatch(makeEvent("paste", monacoField(""), SNIPPET + "\n// fixed by chatgpt"));
  check(
    "text copied here but edited elsewhere is treated as external",
    tampered.defaultPrevented === true && reported[0]?.violationType === "paste_attempt",
    JSON.stringify(reported)
  );

  // ── The three platforms, as they actually behave ─────────────────────────
  //
  // Monaco calls `setData` on the copy event on every browser and every OS
  // (both its EditContext and its textarea input paths do), so the text is read
  // back from the event itself. What differs between platforms is the line
  // endings, and both directions are checked here rather than assumed.

  // Windows: Monaco writes CRLF to the clipboard even though the model holds
  // LF, because `getPlainTextToCopy` is called with `forceCRLF = isWindows`.
  reported.length = 0;
  const WINDOWS_CLIPBOARD = SNIPPET.replace(/\n/g, "\r\n");
  const winCopy = makeEvent("copy", monacoField(SNIPPET));
  winCopy.clipboardData.setData("text/plain", WINDOWS_CLIPBOARD);
  dispatch(winCopy);
  const winPaste = dispatch(makeEvent("paste", monacoField(""), WINDOWS_CLIPBOARD));
  check(
    "Windows: CRLF written by Monaco pastes back free",
    winPaste.defaultPrevented === false && reported[0]?.violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // Firefox hands back LF for text that was written as CRLF — a quirk Monaco
  // documents in its own source and works around for its own metadata.
  reported.length = 0;
  const firefoxPaste = dispatch(makeEvent("paste", monacoField(""), SNIPPET));
  check(
    "Firefox on Windows: CRLF copied, LF pasted, still free",
    firefoxPaste.defaultPrevented === false && reported[0]?.violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // Linux/X11: selecting puts text on PRIMARY and middle click pastes it, with
  // no copy event ever firing. Monaco mirrors its selection into the hidden
  // textarea, so this is the student's own code coming back.
  reported.length = 0;
  const SELECTED = "return arr.filter(Boolean);";
  const selectionField = monacoField(`x\n${SELECTED}\ny`, 2, 2 + SELECTED.length);
  global.document.activeElement = selectionField;
  dispatch(makeEvent("selectionchange", selectionField));
  const middleClick = dispatch(makeEvent("paste", monacoField(""), SELECTED));
  check(
    "Linux/X11: middle-click paste of your own selection is allowed",
    middleClick.defaultPrevented === false && reported[0]?.violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // Selecting must not launder outside text into the exam.
  reported.length = 0;
  const notSelected = dispatch(makeEvent("paste", monacoField(""), "import solution from 'nowhere'"));
  check(
    "Linux/X11: middle-clicking something from another window is still charged",
    notSelected.defaultPrevented === true && reported[0]?.violationType === "paste_attempt",
    JSON.stringify(reported)
  );

  // Dragging out a selection fires one event per step. Those must not evict
  // the genuine copies, or a Linux fix becomes a false accusation everywhere.
  reported.length = 0;
  const filler = "y".repeat(40);
  for (let i = 0; i < 120; i += 1) {
    const field = monacoField(`${filler}${i}`, 0, filler.length + String(i).length);
    global.document.activeElement = field;
    dispatch(makeEvent("selectionchange", field));
  }
  global.document.activeElement = null;
  const stillKnown = dispatch(makeEvent("paste", monacoField(""), SNIPPET));
  check(
    "a long drag-select does not evict the code you copied earlier",
    stillKnown.defaultPrevented === false && reported[0]?.violationType === "paste_internal",
    JSON.stringify(reported)
  );

  // Moving the cursor is not a selection and must cost nothing to track.
  const cursorOnly = monacoField("abc", 2, 2);
  global.document.activeElement = cursorOnly;
  dispatch(makeEvent("selectionchange", cursorOnly));
  global.document.activeElement = null;
  reported.length = 0;
  const emptyCursor = dispatch(makeEvent("paste", monacoField(""), "abc"));
  check(
    "an empty cursor position is not remembered as selected text",
    emptyCursor.defaultPrevented === true && reported[0]?.violationType === "paste_attempt",
    JSON.stringify(reported)
  );

  // 3. The exemption belongs to the answer field, not to the clipboard.
  reported.length = 0;
  const elsewhere = dispatch(makeEvent("paste", pageBody(), SNIPPET));
  check(
    "the same text pasted outside an answer field is still blocked and charged",
    elsewhere.defaultPrevented === true && reported[0]?.violationType === "paste_attempt",
    JSON.stringify(reported)
  );

  // Copying from the page body is not the student's own writing.
  reported.length = 0;
  const copyOut = dispatch(makeEvent("copy", pageBody(), "What is the time complexity of..."));
  check(
    "copying from outside an answer field is still blocked and charged",
    copyOut.defaultPrevented === true && reported[0]?.violationType === "copy_attempt",
    JSON.stringify(reported)
  );

  // The old behaviour is still reachable for deployments that want it.
  reported.length = 0;
  detector.stop();
  const strictDetector = createClipboardDetector({
    report: (violationType, details) => reported.push({ violationType, details }),
    isPaused: () => false,
    allowInternalClipboard: false,
  });
  strictDetector.start();
  const shutCopy = dispatch(makeEvent("copy", monacoField(SNIPPET)));
  const shutPaste = dispatch(makeEvent("paste", monacoField(""), SNIPPET));
  check(
    "allowInternalClipboard:false keeps the clipboard shut in both directions",
    shutCopy.defaultPrevented === true &&
      shutPaste.defaultPrevented === true &&
      reported.length === 1 &&
      reported[0].violationType === "paste_attempt",
    JSON.stringify(reported)
  );
  strictDetector.stop();
  check("stopping the detector removes every listener", listeners.length === 0, `${listeners.length} left`);

  // 4. The server's half: what each of these costs, and what it does.
  const codingTest = policy.getPolicyForTest({ type: "coding", allowedTabSwitches: 0 });
  check("paste_internal costs nothing", policy.weightOf(codingTest, "paste_internal") === 0);
  check("paste_attempt still costs a violation", policy.weightOf(codingTest, "paste_attempt") === 1);
  check("paste_internal is a type the server accepts", policy.isKnownViolationType("paste_internal"));
  check(
    "on the default zero allowance, an internal paste does not cancel the exam",
    policy.decide(codingTest, 0).action === "continue"
  );
  check(
    "but a paste from outside still does",
    policy.decide(codingTest, 1).action === "terminate"
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
