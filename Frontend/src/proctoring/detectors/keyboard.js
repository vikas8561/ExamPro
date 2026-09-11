/**
 * Keyboard lockdown.
 *
 * The old system kept a list of keys to block, which meant anything the list
 * forgot still worked. This is the other way round: **every key is blocked
 * unless it is explicitly allowed.** Forgetting something now fails safe.
 *
 * What is allowed, and only inside an answer field: letters, numbers,
 * punctuation, space, backspace, delete, the arrow keys, Home/End, and Enter
 * and Tab where the student is writing code. Outside an answer field the
 * keyboard does nothing at all.
 *
 * On top of that, Chromium browsers (Chrome, Edge, Brave) offer the Keyboard
 * Lock API, which hands us keys the browser normally keeps for itself —
 * Escape, F11, Ctrl+W, Ctrl+T, Ctrl+N, and on some systems Alt+Tab. Firefox and
 * Safari have no equivalent, so there we catch the consequences instead.
 *
 * What no web page can block, on any browser: Cmd+Tab, Alt+Tab, the Windows
 * key, Print Screen, the macOS screenshot shortcuts, and Ctrl+Alt+Del. The
 * operating system takes those before the browser sees them. The focus detector
 * is what notices the student left.
 */

// Keys we ask the browser to hand over when Keyboard Lock is available.
// An empty list would lock every key including the ones students type with,
// so we name exactly the ones the browser would otherwise act on itself.
const LOCKED_KEYS = [
  "Escape",
  "F11",
  "F12",
  "KeyW", // Ctrl/Cmd+W closes the tab
  "KeyT", // Ctrl/Cmd+T opens a new tab
  "KeyN", // Ctrl/Cmd+N opens a new window
  "KeyR", // Ctrl/Cmd+R reloads
  "KeyP", // print
  "KeyS", // save page
  "KeyU", // view source
  "Tab",
];

/** Navigation and editing keys that are safe inside an answer field. */
const EDITING_KEYS = new Set([
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Shift",
  "CapsLock",
  "Enter",
  "Tab",
  " ",
]);

/** Combinations worth recording, because nobody presses these by accident. */
const SUSPICIOUS_COMBOS = [
  { test: (e) => e.key === "F12", label: "F12 (developer tools)" },
  {
    test: (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(e.key?.toUpperCase()),
    label: "developer tools shortcut",
  },
  { test: (e) => (e.ctrlKey || e.metaKey) && e.key?.toUpperCase() === "U", label: "view page source" },
  { test: (e) => (e.ctrlKey || e.metaKey) && e.key?.toUpperCase() === "P", label: "print" },
  { test: (e) => (e.ctrlKey || e.metaKey) && e.key?.toUpperCase() === "S", label: "save page" },
  { test: (e) => (e.ctrlKey || e.metaKey) && e.key?.toUpperCase() === "F", label: "find on page" },
];

/** Is this element somewhere the student is legitimately meant to type? */
function isAnswerField(target) {
  if (!target) return false;

  // The Monaco code editor used by coding tests. Its inner textarea is where
  // keystrokes actually land, so match the whole editor subtree.
  if (typeof target.closest === "function" && target.closest(".monaco-editor")) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (target.type || "text").toLowerCase();
    return ["text", "search", "email", "number", "tel", "url", "password"].includes(type);
  }
  if (target.isContentEditable) return true;

  return false;
}

/** A single printable character — the thing a student is actually writing. */
function isTypingKey(event) {
  return typeof event.key === "string" && event.key.length === 1;
}

export function createKeyboardDetector({ report, isPaused, onFullscreenRequest }) {
  let running = false;
  let lockEngaged = false;

  const handleKeyDown = (event) => {
    if (!running) return;

    // While a blocking overlay is up, the student still needs to be able to
    // click the button that returns them to fullscreen, but not to type.
    const paused = isPaused?.() === true;

    // Escape is special: on browsers without Keyboard Lock it is what drops the
    // student out of fullscreen, so it is always swallowed.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    for (const combo of SUSPICIOUS_COMBOS) {
      if (combo.test(event)) {
        event.preventDefault();
        event.stopPropagation();
        report("blocked_key", `Blocked ${combo.label}`);
        return;
      }
    }

    if (paused) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // AltGr, on every non-US keyboard layout, reports itself as Ctrl+Alt. It is
    // how a German keyboard types @, how a French one types #, and how most of
    // Europe types the braces and brackets that code is made of. Blocking it
    // outright made coding tests literally impossible to complete on those
    // layouts, and ordinary text answers unwritable.
    //
    // A real AltGr press still produces a printable character, so that is the
    // test: Ctrl+Alt together, one character produced, inside an answer field.
    // Ctrl+Alt shortcuts that are NOT character-producing still fall through to
    // the block below.
    const isAltGrCharacter =
      event.ctrlKey && event.altKey && !event.metaKey && isTypingKey(event);

    if (isAltGrCharacter && isAnswerField(event.target)) {
      return; // let the student type their own language
    }

    // Any other modifier combination is out. Nothing a student needs to answer
    // a question requires Ctrl, Cmd or Alt — but plenty of ways out of the exam
    // do.
    if (event.ctrlKey || event.metaKey || event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Function keys have no place in an exam.
    if (/^F\d{1,2}$/.test(event.key || "")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // From here on, the allowlist: typing is permitted only where the student
    // is supposed to be writing an answer.
    if (isAnswerField(event.target)) {
      if (isTypingKey(event) || EDITING_KEYS.has(event.key)) {
        return; // let it through
      }
    }

    // Tab still moves between questions and options outside a field.
    if (event.key === "Tab") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * Ask the browser to hand over the keys it normally keeps for itself.
   * Requires fullscreen and a secure context; fails quietly otherwise, which is
   * why the pre-exam screen warns the student when it is unavailable.
   */
  const engageLock = async () => {
    if (!navigator.keyboard || typeof navigator.keyboard.lock !== "function") return false;
    try {
      await navigator.keyboard.lock(LOCKED_KEYS);
      lockEngaged = true;
      return true;
    } catch {
      lockEngaged = false;
      return false;
    }
  };

  const releaseLock = () => {
    if (!lockEngaged) return;
    try {
      navigator.keyboard?.unlock?.();
    } catch {
      // Releasing a lock that is already gone is not a problem.
    }
    lockEngaged = false;
  };

  return {
    name: "keyboard",

    async start() {
      running = true;
      // Capture phase on window, so we see the key before the page or any
      // library does. Bound once: window is the first target in the capture
      // path, so also binding document made the handler run twice per keystroke.
      window.addEventListener("keydown", handleKeyDown, true);
      await engageLock();
    },

    stop() {
      running = false;
      window.removeEventListener("keydown", handleKeyDown, true);
      releaseLock();
    },

    /** Re-engage after returning to fullscreen — the lock is dropped on exit. */
    async reengage() {
      if (!running) return;
      await engageLock();
      onFullscreenRequest?.();
    },

    isLocked() {
      return lockEngaged;
    },
  };
}
