import { detectDisplays } from "../environment.js";

/**
 * External monitors, during the exam.
 *
 * The pre-exam screen will not let an exam begin while a second display is
 * connected. This is the other half: a monitor plugged in after Begin pauses
 * the exam behind an overlay until it is removed, and is reported once per
 * connection for the server to charge.
 *
 * Unlike every other detector this one keeps watching while the exam is paused,
 * because the thing it has to notice while paused -- the monitor going away --
 * is exactly what lets the student back in. It only *reports* while the exam
 * is running, so being stuck on the overlay never costs anything extra.
 *
 * `screen.isExtended` has no reliable change event (the specification's
 * `change` event covers resolution and orientation, not the display count), so
 * it is polled. Reading it is a property access, so once a second is free.
 * The `change` event is still listened to, because a monitor arriving usually
 * changes the available screen area too and this catches it a little sooner.
 */

const POLL_MS = 1000;

export function createDisplayDetector({ report, isPaused, onChange }) {
  let timer = null;
  let last = null;

  const check = () => {
    const { state } = detectDisplays();
    if (state === last) return;
    const previous = last;
    last = state;

    // Charged once per connection, and only while the exam is actually
    // running: a monitor that was already there is the gate's business.
    if (state === "multiple" && previous !== null && !isPaused?.()) {
      report("second_monitor_detected", "An external monitor was connected during the test");
    }
    onChange?.(state, previous);
  };

  const onScreenChange = () => check();

  return {
    name: "display",

    start() {
      last = null;
      check();
      timer = setInterval(check, POLL_MS);
      try {
        window.screen?.addEventListener?.("change", onScreenChange);
      } catch {
        // The poll covers it.
      }
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      try {
        window.screen?.removeEventListener?.("change", onScreenChange);
      } catch {
        // Nothing to undo.
      }
    },

    /** The state as of the last check, read fresh. */
    current() {
      return detectDisplays().state;
    },
  };
}
