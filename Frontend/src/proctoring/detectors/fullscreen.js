/**
 * Keep the exam in fullscreen.
 *
 * Fullscreen matters for two reasons: it removes the address bar, tab strip and
 * bookmarks from reach, and on Chromium it is a precondition for locking the
 * keyboard at all.
 *
 * The important limitation to be honest about: a browser will only enter
 * fullscreen in response to a real click or keypress from the student. It can
 * never be forced from code alone. So when someone leaves fullscreen, we cannot
 * silently drag them back — we record it, and the overlay asks them to click a
 * button to return. That click is the only thing the browser will accept.
 */

export function isFullscreen() {
  return Boolean(
    document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
  );
}

/** Ask for fullscreen. Must be called from a real user gesture to succeed. */
export async function requestFullscreen() {
  if (isFullscreen()) return true;

  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" });
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
    } else {
      return false;
    }
    return isFullscreen();
  } catch {
    // Denied, or called outside a user gesture. The overlay asks the student.
    return false;
  }
}

export async function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    else if (document.msExitFullscreen) await document.msExitFullscreen();
  } catch {
    // Nothing useful to do if the browser refuses to leave fullscreen.
  }
}

const POLL_INTERVAL_MS = 1000;

export function createFullscreenDetector({ report, isPaused, onExit }) {
  let pollTimer = null;
  let running = false;
  let lastState = true;

  const check = () => {
    if (!running || isPaused?.()) return;

    const now = isFullscreen();
    if (lastState && !now) {
      lastState = false;
      report("fullscreen_exit", "Left fullscreen mode");
      // The provider shows a blocking overlay with a button, because only a
      // click from the student can put us back.
      onExit?.();
    } else if (now) {
      lastState = true;
    }
  };

  const handleChange = () => check();

  return {
    name: "fullscreen",

    start() {
      running = true;
      lastState = isFullscreen();
      document.addEventListener("fullscreenchange", handleChange);
      document.addEventListener("webkitfullscreenchange", handleChange);
      document.addEventListener("msfullscreenchange", handleChange);
      // Polled as well: some browsers drop out of fullscreen without ever
      // firing the change event, particularly when another app takes over.
      pollTimer = setInterval(check, POLL_INTERVAL_MS);
    },

    stop() {
      running = false;
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
      document.removeEventListener("msfullscreenchange", handleChange);
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  };
}
