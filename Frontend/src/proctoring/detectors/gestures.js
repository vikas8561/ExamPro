/**
 * Mouse and trackpad gestures.
 *
 * ── What this can and cannot do ──
 *
 * The three- and four-finger swipes that switch apps, show Mission Control or
 * Task View, or move to another desktop belong to the operating system. macOS
 * and Windows act on them in the trackpad driver and window manager; the
 * browser never receives an event for them, so no web page on any browser can
 * block one. That is the same limit as Alt+Tab and Cmd+Tab (see keyboard.js),
 * and it is handled the same way: the focus detector notices the exam went out
 * of view and charges it as leaving the exam.
 *
 * Blocking them outright takes a lockdown browser. Safe Exam Browser does it:
 * on macOS its Assessment Mode makes Mission Control and the Dock unavailable,
 * and on Windows its kiosk desktop blocks app switching and Task View. Turn on
 * "Require Safe Exam Browser" for exams where that matters, or have the lab
 * disable the gestures in the operating system's trackpad settings.
 *
 * ── What it does block ──
 *
 * The gestures the BROWSER acts on, which are the ones students trip over:
 *
 *  - Two-finger horizontal swipe (and, on Windows precision touchpads, the
 *    same): Chrome and Edge treat it as Back/Forward. In this single-page app
 *    that left the exam page mid-paper. `overscroll-behavior: none` on the
 *    document is the specified way to turn the gesture off.
 *  - The Back and Forward buttons on the side of a mouse, and anything else
 *    that still manages a history step (Alt+Left in a text field on Windows):
 *    the buttons are cancelled, and a guard history entry turns any Back that
 *    gets through into a no-op on the same address.
 *  - Pinch-to-zoom, and Ctrl+scroll zoom: the page has its own zoom controls,
 *    and a pinch half-way through a question scrambles the layout.
 *
 * None of these is reported. They are mis-gestures, not misconduct, and
 * blocking them is the whole of the job.
 */

// Mouse buttons 3 and 4 are Back and Forward (MouseEvent.button).
const HISTORY_BUTTONS = new Set([3, 4]);

export function createGestureGuard({ win = typeof window !== "undefined" ? window : null } = {}) {
  let running = false;
  let savedOverscroll = null;

  const doc = () => win?.document;

  const stopHistoryButton = (event) => {
    if (!running || !HISTORY_BUTTONS.has(event.button)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  // Trackpad pinch arrives as a wheel event with ctrlKey set (Chrome, Edge,
  // Firefox); so does Ctrl+scroll. Must be a non-passive listener to cancel.
  const stopZoomWheel = (event) => {
    if (!running || !event.ctrlKey) return;
    event.preventDefault();
  };

  // Safari's own pinch events. Harmless elsewhere.
  const stopGesture = (event) => {
    if (!running) return;
    event.preventDefault();
  };

  /**
   * A Back that got through lands on the entry below the guard -- the same
   * address -- so the router shows the same page and the exam stays mounted.
   * Put the guard back so the next one is caught too.
   */
  const onPopState = () => {
    if (!running) return;
    pushGuard();
  };

  const pushGuard = () => {
    try {
      const history = win.history;
      // The router's own state is copied so it still recognises the entry.
      history.pushState({ ...(history.state || {}), examGestureGuard: true }, "", win.location.href);
    } catch {
      // A sandboxed frame may refuse; the other guards still apply.
    }
  };

  return {
    name: "gestures",

    start() {
      if (!win || running) return;
      running = true;

      const root = doc()?.documentElement;
      const body = doc()?.body;
      savedOverscroll = {
        root: root?.style.overscrollBehavior ?? "",
        body: body?.style.overscrollBehavior ?? "",
      };
      if (root) root.style.overscrollBehavior = "none";
      if (body) body.style.overscrollBehavior = "none";

      const capture = { capture: true, passive: false };
      win.addEventListener("mousedown", stopHistoryButton, capture);
      win.addEventListener("mouseup", stopHistoryButton, capture);
      win.addEventListener("auxclick", stopHistoryButton, capture);
      win.addEventListener("wheel", stopZoomWheel, capture);
      win.addEventListener("gesturestart", stopGesture, capture);
      win.addEventListener("gesturechange", stopGesture, capture);
      win.addEventListener("popstate", onPopState);

      if (!win.history?.state?.examGestureGuard) pushGuard();
    },

    stop() {
      if (!running) return;
      running = false;

      const root = doc()?.documentElement;
      const body = doc()?.body;
      if (root) root.style.overscrollBehavior = savedOverscroll?.root ?? "";
      if (body) body.style.overscrollBehavior = savedOverscroll?.body ?? "";

      const capture = { capture: true };
      win.removeEventListener("mousedown", stopHistoryButton, capture);
      win.removeEventListener("mouseup", stopHistoryButton, capture);
      win.removeEventListener("auxclick", stopHistoryButton, capture);
      win.removeEventListener("wheel", stopZoomWheel, capture);
      win.removeEventListener("gesturestart", stopGesture, capture);
      win.removeEventListener("gesturechange", stopGesture, capture);
      win.removeEventListener("popstate", onPopState);
      // The guard entry is left in place: removing it would itself be a Back,
      // and it only ever duplicates the exam's own address.
    },
  };
}
