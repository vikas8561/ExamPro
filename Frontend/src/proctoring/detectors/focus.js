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
 *   visibilitychange → hidden   Conclusive. The tab really is not on screen.
 *                               Reported immediately.
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
// Long enough to ride out a click on browser chrome; short enough that
// genuinely switching to another app is still caught promptly.
const CONFIRM_MS = 2500;

// The fallback poll. Only ever *starts* a confirmation, never reports directly.
const POLL_INTERVAL_MS = 1000;

export function createFocusDetector({ report, isPaused }) {
  let running = false;
  let pollTimer = null;
  let confirmTimer = null;

  // present  — the student is here
  // pending  — focus was lost; deciding whether it means anything
  // away     — confirmed gone and already reported; stays quiet until they return
  let state = "present";

  const clearConfirm = () => {
    if (confirmTimer) {
      clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  /** The student is demonstrably back. Reset so the next departure can count. */
  const markPresent = () => {
    clearConfirm();
    state = "present";
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
      // Conclusive, and worth reporting at once: a hidden tab is unambiguous,
      // and waiting risks the browser suspending our timers first.
      clearConfirm();
      if (state !== "away") {
        state = "away";
        if (!isPaused?.()) report("tab_switch", "Switched away from the exam tab");
      }
    } else {
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

      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    },

    stop() {
      running = false;
      clearConfirm();

      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);

      const opts = { capture: true };
      document.removeEventListener("pointerdown", onProofOfPresence, opts);
      document.removeEventListener("keydown", onProofOfPresence, opts);
      document.removeEventListener("wheel", onProofOfPresence, opts);
      document.removeEventListener("mousemove", onProofOfPresence, opts);

      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
