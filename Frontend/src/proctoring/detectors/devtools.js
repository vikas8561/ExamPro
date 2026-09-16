/**
 * Is the developer console open?
 *
 * Two size tests, chosen by whether the window is in fullscreen:
 *
 *   in fullscreen   axis skew — the outer/inner ratio must match on both axes.
 *                   Zoom-independent, and sees devtools that was already open
 *                   before the exam began. This is the case that matters,
 *                   because the exam requires fullscreen.
 *   out of it       growth from the smallest gap this window has shown, since
 *                   an arbitrary window shape makes the ratios meaningless.
 *
 * The reasons for the shape of this matter, because earlier versions of this
 * file ended innocent students' exams.
 *
 * ── Why there is no absolute size test ──
 *
 * `innerWidth`/`innerHeight` are CSS pixels, so they shrink as BROWSER ZOOM
 * rises, while `outerWidth`/`outerHeight` do not. The gap between them is
 * therefore a function of the student's zoom level, not of devtools. In
 * fullscreen, with nothing whatsoever open, on a 1512px display:
 *
 *     100% zoom -> gap    0px
 *     110% zoom -> gap  137px
 *     125% zoom -> gap  302px
 *     150% zoom -> gap  504px
 *
 * A fixed threshold flags every student who is not sitting at exactly 100%
 * zoom — which, on a Retina Mac or a HiDPI Linux desktop, is most of them. That
 * is what auto-submitted a real student's paper for devtools that was never
 * open. Display scaling and window decorations vary the same way between
 * Windows, macOS and Linux, so no constant works everywhere.
 *
 * Only a CHANGE during the exam carries information, so only a change is used,
 * and it must persist across consecutive checks before it counts.
 *
 * ── Why there is no console getter trap ──
 *
 * Logging an object with a getter on `id` and seeing whether the getter fires
 * is a popular trick: in Chrome the getter runs only when the console renders
 * the object. But whether, and when, a getter is invoked during `console.log`
 * is not specified, and Firefox and Safari differ. A browser that evaluates it
 * eagerly reports devtools as open permanently, for every student, on that
 * platform — and it called `console.clear()` on a timer as a side effect.
 * Unverifiable across the three operating systems this has to work on, so gone.
 *
 * ── Why there is no `debugger` statement ──
 *
 * It works, by pausing the page every couple of seconds — which leaves the
 * student unable to interact with the very dialog telling them to close
 * devtools. Recovery became impossible, so gone.
 *
 * ── What this means ──
 *
 * Devtools docked into the window is caught, whether it was opened during the
 * exam or before it. Devtools undocked into a window of its own is not caught
 * by any size test, and nothing here pretends otherwise.
 *
 * That is a deliberate trade. No web page can prevent devtools at all; the
 * keyboard shortcuts are blocked separately; and a missed detection is a far
 * smaller harm than cancelling the exam of a student who did nothing wrong.
 */

const CHECK_INTERVAL_MS = 1500;

// How much taller/wider than its own baseline a window must get before this
// looks like a devtools pane rather than a toolbar appearing.
const GROWTH_THRESHOLD_PX = 160;

// Consecutive checks the growth must persist for. A window-manager reflow, an
// OS notification, a screen-share bar appearing, or a display change all move
// the size for a moment; a devtools pane stays put.
const SUSTAIN_CHECKS = 2;

// How far the two axes may disagree before something is docked in the window.
// A scrollbar moves this about 1%; a devtools pane moves it 30-40%.
const SKEW_TOLERANCE = 0.08;

function inFullscreen() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
  );
}

/**
 * Is something docked inside the window? Zoom-independent.
 *
 * In fullscreen with nothing docked, `outer / inner` is the same ratio on both
 * axes, because that ratio IS the browser zoom factor. Zoom shrinks width and
 * height together, so it cancels out. Anything docked shrinks one axis only and
 * breaks the symmetry — a pane at the bottom moves the height ratio, one at the
 * side moves the width ratio.
 *
 * That is what lets this catch devtools that was ALREADY OPEN when the exam
 * began, which a growth-from-baseline test cannot see, without reintroducing
 * the absolute threshold that flagged every student not at exactly 100% zoom:
 *
 *     clean, 125% zoom       ratios 1.250 / 1.249   skew  0.0%   clean
 *     devtools bottom, 125%  ratios 1.250 / 2.107   skew 40.7%   detected
 *     devtools side,   125%  ratios 1.867 / 1.249   skew 33.1%   detected
 *
 * Only meaningful in fullscreen, where the window fills the screen. Out of
 * fullscreen the window is an arbitrary shape and the ratios mean nothing.
 */
function dockedSkew() {
  const { innerWidth: iw, innerHeight: ih, outerWidth: ow, outerHeight: oh } = window;
  if (!iw || !ih || !ow || !oh) return false;

  const ratioWidth = ow / iw;
  const ratioHeight = oh / ih;
  const larger = Math.max(ratioWidth, ratioHeight);
  if (larger <= 0) return false;

  return Math.abs(ratioWidth - ratioHeight) / larger > SKEW_TOLERANCE;
}

function gaps() {
  return {
    width: Math.max(0, window.outerWidth - window.innerWidth),
    height: Math.max(0, window.outerHeight - window.innerHeight),
  };
}

export function createDevtoolsDetector({ report, isPaused, enabled = true }) {
  let timer = null;
  let running = false;
  let openNow = false;
  let sustained = 0;

  // The smallest gap seen so far — this window with nothing extra docked in it.
  let baseWidth = Infinity;
  let baseHeight = Infinity;

  /**
   * Has the window grown well beyond its own baseline?
   *
   * The baseline only ever moves down, so anything that makes the window
   * smaller — closing a toolbar, entering fullscreen, changing zoom — becomes
   * the new normal rather than leaving the student permanently flagged.
   */
  const grown = () => {
    // In fullscreen, axis skew is the better test: it is independent of zoom and
    // it sees devtools that was open before the exam started. The exam requires
    // fullscreen, so this is the case that matters.
    if (inFullscreen()) return dockedSkew();

    const { width, height } = gaps();

    if (width < baseWidth) baseWidth = width;
    if (height < baseHeight) baseHeight = height;

    return (
      width - baseWidth > GROWTH_THRESHOLD_PX || height - baseHeight > GROWTH_THRESHOLD_PX
    );
  };

  const check = () => {
    if (!running || !enabled) return;

    // Evaluated even while paused, because the warning dialog needs to know
    // whether the student has actually closed devtools yet.
    if (grown()) sustained += 1;
    else sustained = 0;

    const detected = sustained >= SUSTAIN_CHECKS;

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
      openNow = false;
      sustained = 0;

      // Establish the baseline from the window as it is now, before judging
      // anything against it.
      const { width, height } = gaps();
      baseWidth = width;
      baseHeight = height;

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
     * Re-measures rather than trusting the latch, so a student who has genuinely
     * closed devtools is released immediately and is never stuck on the dialog.
     */
    isOpen() {
      return grown();
    },
  };
}
