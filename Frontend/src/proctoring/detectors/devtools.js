/**
 * Is the developer console open?
 *
 * Two independent signals, because each has a blind spot the other covers:
 *
 *  1. Window size, measured against a learned baseline. Catches docked devtools.
 *  2. A console getter trap. Logging an object whose `id` property has a getter
 *     only triggers that getter when something renders the object, which in
 *     practice means an open console. Catches devtools undocked into its own
 *     window, which no size check can see.
 *
 * ── Why the baseline, and not a fixed threshold ──
 *
 * This used to compare `outerHeight - innerHeight` against a flat 160px. That
 * gap is not devtools — it is ordinary browser chrome: the tab strip, the
 * address bar, the bookmarks bar, and Chrome's "you are sharing your screen"
 * notification bar. Stack those and a perfectly clean window clears 160px on
 * its own.
 *
 * The consequence was not just a false violation. `isOpen()` gates the warning
 * dialog's Continue button, so a student whose browser chrome happened to be
 * tall enough was told "close developer tools to continue" about developer
 * tools that were never open — and could never dismiss it. A locked-out student
 * with no way back into their exam.
 *
 * Measuring the *increase* from the smallest gap ever observed fixes that.
 * Devtools only ever adds chrome, so the smallest gap seen is the honest
 * baseline, whatever that particular browser's furniture happens to be.
 *
 * ── Why there is no `debugger` statement here ──
 *
 * A `debugger` on a timer does detect an open console, by stalling. It also
 * genuinely pauses the page, every 1.5 seconds, and the student cannot then
 * interact with the very dialog telling them to close devtools. It made the
 * recovery path impossible to complete, so it is gone.
 *
 * Detection, not prevention: no web page can stop devtools being opened. What
 * it can do is make opening it cost the student their exam.
 */

const CHECK_INTERVAL_MS = 1500;

// How much taller/wider than its own baseline a window must get before we call
// it devtools. Comfortably more than a toolbar appearing, comfortably less than
// a devtools pane.
const GROWTH_THRESHOLD_PX = 140;

// In fullscreen the window fills the display, so outer and inner should agree
// to within a hair. Anything more is something docked inside the window. The
// tolerance is for rounding and OS scaling, nothing larger.
const FULLSCREEN_GAP_TOLERANCE_PX = 60;

function inFullscreen() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
  );
}

// The console trap is useful but writes to the console, so it runs on every
// fourth check rather than constantly.
const TRAP_EVERY = 4;

function gaps() {
  return {
    width: Math.max(0, window.outerWidth - window.innerWidth),
    height: Math.max(0, window.outerHeight - window.innerHeight),
  };
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
  let checks = 0;
  const trap = createConsoleTrap();

  // The smallest gap seen so far — this browser's chrome with nothing extra.
  // Starts at Infinity so the first reading establishes it.
  let baseWidth = Infinity;
  let baseHeight = Infinity;

  /**
   * Has the window grown meaningfully beyond its own baseline?
   *
   * Also keeps the baseline honest: any smaller reading becomes the new floor,
   * so closing a toolbar or entering fullscreen re-calibrates rather than
   * leaving the student permanently flagged.
   */
  const sizeSignal = () => {
    const { width, height } = gaps();

    // Fullscreen is measured absolutely, not against the baseline.
    //
    // The baseline is learned from the window as it is when the exam starts,
    // which is fine until devtools is ALREADY OPEN at that moment. Then the
    // devtools pane is measured as if it were ordinary browser chrome, becomes
    // the "clean" baseline, and nothing is ever reported however long it stays
    // open -- exactly the hole a student gets by opening the Network tab before
    // pressing Start, and it works just as well docked to the side as below.
    //
    // Fullscreen removes the ambiguity: the window fills the screen, so there
    // is no chrome to account for and any real gap is devtools. The exam
    // requires fullscreen, so this is the case that actually matters.
    if (inFullscreen()) {
      return width > FULLSCREEN_GAP_TOLERANCE_PX || height > FULLSCREEN_GAP_TOLERANCE_PX;
    }

    // Outside fullscreen, fall back to growth against the smallest gap seen.
    // The baseline is only ever lowered here, never while fullscreen, so a
    // devtools pane cannot be mistaken for furniture and learned as normal.
    if (width < baseWidth) baseWidth = width;
    if (height < baseHeight) baseHeight = height;

    const grownWide = width - baseWidth > GROWTH_THRESHOLD_PX;
    const grownTall = height - baseHeight > GROWTH_THRESHOLD_PX;
    return grownWide || grownTall;
  };

  const check = () => {
    if (!running || !enabled) return;

    checks += 1;
    let detected = false;

    // Size is evaluated even while paused, because the warning dialog needs to
    // know whether the student has actually closed devtools yet.
    if (sizeSignal()) detected = true;

    if (!detected && !isPaused?.() && checks % TRAP_EVERY === 0) {
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
      checks = 0;
      openNow = false;

      // Establish the baseline from the current window before judging anything.
      const { width, height } = gaps();
      baseWidth = width;
      baseHeight = height;

      // Ask the console trap straight away rather than waiting for the fourth
      // check. Devtools that was open before the exam began is the case the
      // size baseline is worst at, and the trap does not care when it opened.
      try {
        if (trap.probe()) {
          openNow = true;
          report("devtools_opened", "Developer tools were already open when the test began");
        }
      } catch {
        // Some environments replace console entirely. Not conclusive.
      }

      timer = setInterval(check, CHECK_INTERVAL_MS);
    },

    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    /**
     * Used by the overlay to hold the student until devtools is really closed.
     * Re-measures rather than trusting the latch, so that a student who has
     * genuinely closed devtools is released immediately.
     */
    isOpen() {
      return sizeSignal();
    },
  };
}
