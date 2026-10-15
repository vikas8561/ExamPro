/**
 * Did the student leave the exam?
 *
 * This is the safety net for everything the browser cannot block. Cmd+Tab,
 * Alt+Tab, the Windows key, clicking another application, minimising the
 * window — none of those can be prevented by a web page, because the operating
 * system takes them before the browser ever sees them. What a page *can* do is
 * notice that it stopped being the thing in front of the student.
 *
 * ── Why this was rewritten ──
 *
 * The previous version polled `document.hasFocus()` once a second and reported
 * a violation whenever it was false. That is wrong, and it was wrong in a way
 * that punished students for doing nothing:
 *
 *   `document.hasFocus() === false` does not mean "the student left the exam".
 *   It means "the page does not hold keyboard focus", which is equally true
 *   when focus sits in BROWSER CHROME — the address bar, an extension popup,
 *   the find bar, a native dialog, or Chrome's own "you are sharing your
 *   screen" bar.
 *
 * Clicking "Hide" on that sharing bar moves focus to browser chrome while the
 * exam stays fully visible. The old poll saw `hasFocus() === false`, reported a
 * violation, and then — having no notion of an episode — reported it again on
 * the next tick, and the next, for as long as focus stayed there. One harmless
 * click produced a stream of violations.
 *
 * ── What replaces it ──
 *
 * Signals are ranked by how much they actually prove:
 *
 *   visibilitychange → hidden   Conclusive that the tab is not on screen --
 *                               but not that the student caused it. Charged
 *                               once it has lasted HIDDEN_CONFIRM_MS; see there.
 *   blur                        Only a hint. Confirmed over a window, and
 *                               abandoned at the first sign the student is
 *                               still there.
 *   polling                     A fallback for a blur event that never fired,
 *                               requiring sustained absence. Never a primary.
 *
 * And the whole thing is an episode, not an instant: leaving is reported once,
 * and cannot be reported again until the student has demonstrably come back.
 */

// How long a blur must persist, uncontradicted, before it counts as leaving.
//
// Raised from 2.5s after students reported being warned for clicking "Hide" on
// Chrome's screen-sharing bar. That click moves focus into browser chrome, which
// is indistinguishable from switching to another application — the page simply
// does not have focus either way — and 2.5s was short enough to catch a student
// reaching for the mouse afterwards.
//
// Four seconds is the compromise. Fumbling with browser furniture resolves in
// one or two; a genuine glance at something else does not. It does not need to
// be longer than that, because `window_blur` is scored zero (see
// Backend/services/proctorPolicy.js) — it informs the reviewer and cannot warn
// the student or end the exam, so the cost of an occasional spurious entry is a
// line in a report rather than a cancelled paper.
const CONFIRM_MS = 4000;

// The fallback poll. Only ever *starts* a confirmation, never reports directly.
const POLL_INTERVAL_MS = 1000;

// How long the page must stay hidden before it is charged as a tab switch.
//
// It used to be charged the instant the page was hidden. But the operating
// system hides a page for a fraction of a second without anyone touching
// anything: macOS animating the exam into its fullscreen Space, a system overlay
// passing over the window, a display renegotiating. Every one of those was a
// charged "tab switch". Going to look at something else and reading it takes
// longer than this; a hide that ends sooner is recorded as `tab_switch_brief`,
// weight 0, so the reviewer still sees every one of them.
//
// Timers in a hidden page are throttled to about once a second, not stopped, so
// the confirmation still fires on time (within a second) while the student is away.
const HIDDEN_CONFIRM_MS = 1500;

// No input at all for this long before the page went out of view, on a machine
// where the screen could not be kept awake, is the operating system's idle timer
// turning the display off or locking the screen -- which Chrome reports exactly
// like a tab switch. One minute is the shortest display-off and screensaver delay
// Windows and macOS offer. Switching away deliberately takes a key press (Alt,
// Cmd, the Windows key) that the page sees first, so it is not idle.
const IDLE_SCREEN_OFF_MS = 60000;

/**
 * `isScreenKeptAwake` reports whether the screen wake lock was holding the
 * display on (see ../wakeLock.js). While it is, the operating system cannot
 * have turned the screen off for idleness, so the idle allowance does not apply.
 */
export function createFocusDetector({ report, isPaused, isScreenKeptAwake = () => true }) {
  let running = false;
  let pollTimer = null;
  let confirmTimer = null;
  let hiddenTimer = null;
  let hiddenAt = 0;
  let idleWhenHidden = 0;
  let awakeWhenHidden = true;

  // present  — the student is here
  // pending  — focus was lost; deciding whether it means anything
  // hidden   — the page went out of view; deciding whether it was a tab switch
  // away     — confirmed gone and already reported; stays quiet until they return
  let state = "present";

  const clearConfirm = () => {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  const clearHidden = () => {
    if (hiddenTimer) {
      clearTimeout(hiddenTimer);
      hiddenTimer = null;
    }
  };

  /** The student is demonstrably back. Reset so the next departure can count. */
  const markPresent = () => {
    // A focus event can arrive before the page is visible again on some
    // systems. The hidden episode is settled by visibilitychange, not by that.
    if (document.visibilityState === "hidden") return;
    clearConfirm();
    state = "present";
  };

  /** The page has been hidden for HIDDEN_CONFIRM_MS: rule on it. */
  const confirmHidden = () => {
    hiddenTimer = null;
    if (!running || state !== "hidden") return;
    state = "away";
    if (isPaused?.()) return;

    if (!awakeWhenHidden && idleWhenHidden >= IDLE_SCREEN_OFF_MS) {
      const minutes = Math.round(idleWhenHidden / 60000);
      report(
        "screen_idle_off",
        `The screen turned off or locked after ${minutes} min with no activity`
      );
      return;
    }
    report("tab_switch", "Switched away from the exam tab");
  };

  // When the student last did something on the page. Input is the strongest
  // evidence of presence there is: someone typing an answer has not gone
  // anywhere, whatever the focus flags happen to say.
  let lastInputAt = 0;

  /**
   * Any of these prove the student is still at the exam, so a pending
   * confirmation is abandoned.
   */
  const onProofOfPresence = () => {
    if (!running) return;
    lastInputAt = Date.now();
    if (state === "pending") markPresent();
    else if (state === "away" && document.hasFocus()) markPresent();
  };

  /**
   * Begin confirming a suspected departure. Reports only if nothing contradicts
   * it for the whole window.
   */
  const beginConfirm = (details) => {
    if (!running || isPaused?.()) return;
    if (state !== "present") return; // already pending, or already reported

    state = "pending";
    clearConfirm();

    confirmTimer = setTimeout(() => {
      confirmTimer = null;
      if (!running || isPaused?.()) {
        state = "present";
        return;
      }

      // Re-check at the end of the window rather than trusting the old reading.
      if (document.hasFocus()) {
        state = "present";
        return;
      }
      // Became hidden in the meantime: that is a tab switch, and
      // handleVisibilityChange has already reported it.
      if (document.visibilityState === "hidden") {
        state = "away";
        return;
      }

      state = "away";
      report("window_blur", details);
    }, CONFIRM_MS);
  };

  const handleVisibilityChange = () => {
    if (!running) return;

    if (document.visibilityState === "hidden") {
      clearConfirm();
      if (state === "away" || state === "hidden") return;
      if (isPaused?.()) {
        state = "away";
        return;
      }
      // Sampled now: the wake lock is released as the page hides, and the idle
      // time is what it was at the moment the screen went.
      state = "hidden";
      hiddenAt = Date.now();
      idleWhenHidden = hiddenAt - lastInputAt;
      awakeWhenHidden = isScreenKeptAwake() !== false;
      clearHidden();
      hiddenTimer = setTimeout(confirmHidden, HIDDEN_CONFIRM_MS);
    } else {
      if (state === "hidden") {
        // Back before it counted. Recorded, never charged.
        clearHidden();
        if (!isPaused?.()) {
          const seconds = ((Date.now() - hiddenAt) / 1000).toFixed(1);
          report("tab_switch_brief", `The exam was out of view for ${seconds}s`);
        }
      }
      // Back on screen. Only truly "present" once focus is ours as well.
      if (document.hasFocus()) markPresent();
      else state = "present"; // allow a fresh blur to be judged on its own merits
    }
  };

  const handleBlur = () => {
    if (!running) return;
    beginConfirm("Moved to another window or application");
  };

  const handleFocus = () => {
    if (!running) return;
    markPresent();
  };

  /**
   * Fallback only. Some window managers move a window behind another without
   * firing `blur` at all, so this notices a focus loss that went unannounced —
   * but it goes through exactly the same confirmation as a real blur event, and
   * it cannot report on its own.
   */
  const poll = () => {
    if (!running || isPaused?.()) return;
    if (document.visibilityState === "hidden") return; // visibilitychange owns this
    if (document.hasFocus()) {
      if (state === "away") markPresent();
      return;
    }
    if (state !== "present") return;

    // Someone still working on the page is present, whatever `hasFocus()` says.
    // Without this the poll would restart a confirmation the instant the last
    // one was cancelled, and the student would be reported over and over for a
    // single click on browser chrome — which is the behaviour being fixed.
    if (Date.now() - lastInputAt < CONFIRM_MS) return;

    beginConfirm("The exam window is no longer the active window");
  };

  return {
    name: "focus",

    start() {
      running = true;
      state = "present";
      // Counted from the start of the exam, not from the epoch, or the first
      // departure would always look like a machine left idle for decades.
      lastInputAt = Date.now();

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("focus", handleFocus);

      // Proof the student is still at the exam. Passive so they never delay
      // input, and capture so they are seen even if something stops propagation.
      const opts = { passive: true, capture: true };
      document.addEventListener("pointerdown", onProofOfPresence, opts);
      document.addEventListener("keydown", onProofOfPresence, opts);
      document.addEventListener("wheel", onProofOfPresence, opts);
      document.addEventListener("mousemove", onProofOfPresence, opts);
      // Also on the window. The keyboard lockdown stops modifier keys from
      // propagating past the window, so Alt, Cmd and the Windows key -- exactly
      // the presses that begin a switch to another app -- never reach the
      // document. Listeners on the same target still see them.
      window.addEventListener("keydown", onProofOfPresence, opts);

      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    },

    stop() {
      running = false;
      clearConfirm();
      clearHidden();

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);

      const opts = { capture: true };
      document.removeEventListener("pointerdown", onProofOfPresence, opts);
      document.removeEventListener("keydown", onProofOfPresence, opts);
      document.removeEventListener("wheel", onProofOfPresence, opts);
      document.removeEventListener("mousemove", onProofOfPresence, opts);
      window.removeEventListener("keydown", onProofOfPresence, opts);

      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
