/**
 * Did the student leave the exam?
 *
 * This is the safety net for everything the browser cannot block. Cmd+Tab,
 * Alt+Tab, the Windows key, clicking another application, minimising the
 * window — none of those can be prevented by a web page, because the operating
 * system takes them before the browser ever sees them.
 *
 * What a web page *can* do is notice, instantly, that it stopped being the
 * thing in front of the student. So we cannot stop someone alt-tabbing to their
 * notes, but they cannot do it without it being recorded.
 *
 * Three overlapping signals are used, because no single one is reliable
 * everywhere: `visibilitychange` misses a same-screen window switch, `blur`
 * sometimes fires for harmless reasons like a file dialog, and neither always
 * fires when a window is dragged behind another. The poll catches the rest.
 */

const POLL_INTERVAL_MS = 1000;

export function createFocusDetector({ report, isPaused }) {
  let pollTimer = null;
  let wasHidden = false;
  let running = false;

  // Ignore a very brief flicker — a permission prompt or the screen-share
  // picker steals focus for a moment through no fault of the student.
  const GRACE_MS = 400;
  let lostAt = 0;

  /**
   * The three signals overlap, and that used to cost the student twice: one tab
   * switch fires `visibilitychange` *and* `blur`, so it was reported as both
   * `tab_switch` and `window_blur` in the same instant and charged as two
   * violations.
   *
   * They are all the same fact — "the student is no longer on the exam" — so
   * only the first signal to notice reports it, and the rest stay quiet until
   * the student has been back for a while. The server enforces the same rule
   * independently (see VIOLATION_GROUPS in proctorPolicy.js), because a client
   * that has been tampered with cannot be relied on to hold back.
   */
  const REPORT_COOLDOWN_MS = 2000;
  let lastReportAt = 0;

  const flag = (type, details) => {
    if (!running || isPaused?.()) return;

    const now = Date.now();
    if (now - lastReportAt < REPORT_COOLDOWN_MS) return;
    lastReportAt = now;

    report(type, details);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
      lostAt = Date.now();
      // Report immediately: a hidden tab is unambiguous, and waiting risks the
      // browser suspending our timers before we get the chance.
      flag("tab_switch", "Switched away from the exam tab");
    } else if (wasHidden) {
      wasHidden = false;
    }
  };

  const handleBlur = () => {
    lostAt = Date.now();
    // Wait out the grace period, then confirm we really did lose focus rather
    // than blinking through a dialog.
    setTimeout(() => {
      if (!running || isPaused?.()) return;
      if (document.hasFocus()) return;
      // A hidden document is a tab switch, which handleVisibilityChange has
      // already reported. The cooldown covers the case where the student comes
      // back fast enough that this no longer reads as hidden.
      if (document.visibilityState === "hidden") return;
      flag("window_blur", "Moved to another window or application");
    }, GRACE_MS);
  };

  const poll = () => {
    if (!running || isPaused?.()) return;
    if (document.visibilityState === "hidden") return; // handled by visibilitychange
    if (document.hasFocus()) return;
    if (Date.now() - lostAt < GRACE_MS) return;

    lostAt = Date.now();
    flag("window_blur", "The exam window is not the active window");
  };

  return {
    name: "focus",

    start() {
      running = true;
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", handleBlur);
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    },

    stop() {
      running = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
