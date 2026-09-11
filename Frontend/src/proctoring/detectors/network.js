/**
 * Connection loss.
 *
 * Recorded, but deliberately free: `network_lost` carries a weight of zero on
 * the server, so a student on bad campus wifi is never failed for it. Cutting
 * the network genuinely is one way to try to silence the proctoring, but the
 * heartbeat is what catches that — the server notices the browser stopped
 * checking in, and charges for the silence itself.
 *
 * This detector exists so the student gets an honest "you are offline" message
 * instead of a screen that has quietly stopped working, and so the reviewer can
 * see a connection drop in the timeline and read the rest of it correctly.
 */

export function createNetworkDetector({ report, isPaused, onOffline, onOnline }) {
  let running = false;

  const handleOffline = () => {
    if (!running) return;
    if (!isPaused?.()) {
      report("network_lost", "Internet connection was lost");
    }
    onOffline?.();
  };

  const handleOnline = () => {
    if (!running) return;
    onOnline?.();
  };

  return {
    name: "network",

    start() {
      running = true;
      window.addEventListener("offline", handleOffline);
      window.addEventListener("online", handleOnline);
      if (!navigator.onLine) onOffline?.();
    },

    stop() {
      running = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    },
  };
}
