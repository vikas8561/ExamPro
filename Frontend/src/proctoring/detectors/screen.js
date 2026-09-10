import { detectSecondMonitor } from "../environment";

/**
 * Screen sharing and second monitors.
 *
 * Screen sharing here is a gate and a tripwire, not a recording: **not one
 * frame is ever read, stored or uploaded.** What it gives us is two things a
 * page cannot otherwise know — whether the student agreed to expose their whole
 * screen rather than just this tab, and whether they later switched that off.
 *
 * The entire-screen check is the valuable part and is kept from the old system,
 * which got this right: `displaySurface` tells us whether the student picked
 * their whole monitor, a single window, or just the exam tab. Picking a tab
 * would leave everything outside it invisible, so it is refused.
 *
 * Second-monitor detection is new. A second display is a common and effective
 * way to cheat, and the old system never looked. Where the browser will not say
 * — Brave's privacy protections may withhold it — the answer is recorded as
 * "unknown" and nobody is accused of anything.
 */

const RECHECK_INTERVAL_MS = 5000;

/**
 * Ask for the whole screen. Returns the stream on success so the caller can
 * keep it alive; returns an error message the student can act on if not.
 */
export async function requestScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return { ok: false, error: "This browser cannot share your screen. Please use Chrome, Edge or Brave." };
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      // A low frame rate because nothing ever reads these frames; we only need
      // the track to exist so we can tell when it ends.
      video: { frameRate: 1, displaySurface: "monitor" },
      audio: false,
    });
  } catch (error) {
    const message =
      error?.name === "NotAllowedError"
        ? "Screen sharing was declined. It is required to take this test."
        : "Screen sharing could not be started. Please try again.";
    return { ok: false, error: message };
  }

  const track = stream.getVideoTracks()[0];
  const surface = track?.getSettings?.().displaySurface;

  // "monitor" is the whole screen. "window" and "browser" would hide everything
  // else the student is doing, which defeats the point.
  if (surface && surface !== "monitor") {
    stream.getTracks().forEach((t) => t.stop());
    return {
      ok: false,
      error:
        'You must share your ENTIRE SCREEN, not a single window or tab. Please try again and choose "Entire Screen".',
    };
  }

  return { ok: true, stream, track };
}

export function createScreenDetector({ report, isPaused, getStream, detectSecondMonitor: enabled = true }) {
  let timer = null;
  let running = false;
  let stopReported = false;
  let lastMonitorState = null;

  const check = () => {
    if (!running || isPaused?.()) return;

    // Has screen sharing been switched off? Browsers show a "stop sharing"
    // button outside the page, so this is a real and easy thing to do.
    const stream = getStream?.();
    const track = stream?.getVideoTracks?.()[0];
    const live = track && track.readyState === "live";

    if (!live && !stopReported) {
      stopReported = true;
      report("screen_share_stopped", "Screen sharing was turned off");
    } else if (live) {
      stopReported = false;
    }

    if (enabled) {
      const monitors = detectSecondMonitor();
      // Report only when it changes to "yes", and only once — plugging a second
      // screen in mid-exam is the event worth flagging.
      if (monitors === "yes" && lastMonitorState !== "yes") {
        report("second_monitor_detected", "A second display was detected");
      }
      lastMonitorState = monitors;
    }
  };

  return {
    name: "screen",

    start() {
      running = true;
      stopReported = false;
      lastMonitorState = enabled ? detectSecondMonitor() : null;

      // A second monitor present from the very start is still worth recording,
      // so the reviewer sees the full picture of the environment.
      if (lastMonitorState === "yes") {
        report("second_monitor_detected", "A second display was connected when the test began");
      }

      // The track's own end event is faster than polling when it works; the
      // poll below is the fallback for browsers where it does not fire.
      const track = getStream?.()?.getVideoTracks?.()[0];
      if (track) {
        track.addEventListener("ended", () => {
          if (!running || isPaused?.()) return;
          if (stopReported) return;
          stopReported = true;
          report("screen_share_stopped", "Screen sharing was turned off");
        });
      }

      timer = setInterval(check, RECHECK_INTERVAL_MS);
    },

    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
