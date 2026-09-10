/**
 * Is the developer console open?
 *
 * The old system compared the window's outer and inner size, which only works
 * when devtools is docked to the side or bottom of the same window. Undocked
 * into its own window — one keyboard shortcut away — it saw nothing at all.
 *
 * Three independent signals are used here instead, because each one has a blind
 * spot the others cover:
 *
 *  1. Window size. Catches docked devtools. Cheap, runs constantly.
 *  2. Timing. A `debugger` statement returns instantly when nothing is
 *     watching, and stalls when devtools is open and paused on it.
 *  3. A console getter trap. Logging an object whose `id` property has a getter
 *     only triggers that getter when something actually renders the object,
 *     which in practice means an open console.
 *
 * Detection, not prevention: no web page can stop devtools being opened. What
 * it can do is make opening it cost the student their exam.
 */

const CHECK_INTERVAL_MS = 1500;
const SIZE_THRESHOLD_PX = 160;
const DEBUGGER_STALL_MS = 100;

/** Docked devtools eats space the page can measure. */
function sizeSignal() {
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return widthGap > SIZE_THRESHOLD_PX || heightGap > SIZE_THRESHOLD_PX;
}

/**
 * Timing signal. Harmless when nothing is listening — the statement is a no-op
 * and this returns in well under a millisecond.
 */
function debuggerSignal() {
  const start = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  return performance.now() - start > DEBUGGER_STALL_MS;
}

/** Console getter trap. Fires only when something renders the logged object. */
function createConsoleTrap() {
  let tripped = false;
  const bait = {};
  Object.defineProperty(bait, "id", {
    get() {
      tripped = true;
      return "";
    },
  });

  return {
    probe() {
      tripped = false;
      // Written and immediately cleared, so a student watching the console sees
      // nothing useful and the page is not spammed.
      console.log(bait);
      console.clear();
      return tripped;
    },
  };
}

export function createDevtoolsDetector({ report, isPaused, enabled = true }) {
  let timer = null;
  let running = false;
  let openNow = false;
  const trap = createConsoleTrap();

  const check = () => {
    if (!running || !enabled) return;

    let detected = false;

    // Size is checked even while paused, because the warning overlay needs to
    // know whether the student has actually closed devtools yet.
    if (sizeSignal()) detected = true;

    if (!detected && !isPaused?.()) {
      try {
        if (debuggerSignal()) detected = true;
      } catch {
        // A blocked debugger statement is not evidence either way.
      }
    }

    if (!detected && !isPaused?.()) {
      try {
        if (trap.probe()) detected = true;
      } catch {
        // Some environments replace console entirely. Not conclusive.
      }
    }

    // Report the transition only, so one open does not bill the student
    // repeatedly for every check while it stays open.
    if (detected && !openNow) {
      openNow = true;
      if (!isPaused?.()) {
        report("devtools_opened", "Developer tools were opened");
      }
    } else if (!detected && openNow) {
      openNow = false;
    }
  };

  return {
    name: "devtools",

    start() {
      if (!enabled) return;
      running = true;
      openNow = sizeSignal();
      timer = setInterval(check, CHECK_INTERVAL_MS);
    },

    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    /** Used by the overlay to hold the student until devtools is really closed. */
    isOpen() {
      return sizeSignal() || openNow;
    },
  };
}
