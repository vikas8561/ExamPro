/**
 * Keep the screen on for the length of the exam.
 *
 * A student reading a question or thinking through a solution can go minutes
 * without touching anything, and the operating system's idle timer then turns
 * the display off, starts the screensaver or locks the machine. Chrome treats
 * all three as the page going out of view -- on Windows it marks every window
 * occluded when the display powers down or the session locks, on macOS the
 * screensaver occludes it -- and `visibilitychange` fires exactly as it does for
 * a real tab switch. Students were being charged with leaving the exam while
 * sitting in front of it.
 *
 * The Screen Wake Lock API asks the system not to do that. Chrome and Edge have
 * supported it since version 84, and exams already require 100 or later. The
 * browser drops the lock whenever the page is hidden, so it is taken again each
 * time the page comes back. When the request is refused (battery saver on some
 * systems, an administrator policy), `isHeld()` says so and the focus detector
 * judges idle screen-offs with that in mind.
 */
const RECENT_RELEASE_MS = 3000;

export function createScreenWakeLock() {
  let sentinel = null;
  let running = false;
  let pending = false;
  // When the browser last let go of the lock. It does so as the page is hidden
  // -- in the same moment the focus detector asks whether the screen was being
  // kept on -- so a release a moment ago still counts as held.
  let releasedAt = 0;

  const acquire = async () => {
    if (!running || sentinel || pending) return;
    if (typeof navigator === "undefined" || !navigator.wakeLock?.request) return;
    if (document.visibilityState !== "visible") return;

    pending = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!running) {
        lock.release().catch(() => {});
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) {
          sentinel = null;
          releasedAt = Date.now();
        }
        // Released by the system while the page is still in front of the
        // student (power settings changed, for one): ask again.
        if (running && document.visibilityState === "visible") acquire();
      });
    } catch {
      // Refused. The exam carries on; isHeld() reports false.
    } finally {
      pending = false;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") acquire();
  };

  return {
    name: "wakeLock",

    start() {
      running = true;
      document.addEventListener("visibilitychange", onVisibilityChange);
      acquire();
    },

    stop() {
      running = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const lock = sentinel;
      sentinel = null;
      lock?.release().catch(() => {});
    },

    /** Is the screen being kept on (or was it, until a moment ago)? */
    isHeld() {
      // A sentinel still referenced is held, or was released this instant with
      // its `release` event not yet delivered -- held until just now either way.
      if (sentinel) return true;
      return Date.now() - releasedAt < RECENT_RELEASE_MS;
    },
  };
}
