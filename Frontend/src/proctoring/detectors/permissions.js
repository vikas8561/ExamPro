/**
 * Camera, microphone and location — a permission gate, nothing more.
 *
 * Be clear about what this does and does not do, because the distinction is the
 * whole design: the exam asks for these permissions, records whether they were
 * granted as plain text, and notices if they are switched off mid-exam. **No
 * frame is ever read. No audio is ever sampled. Nothing is uploaded or stored.**
 * There is no face recognition anywhere in this system.
 *
 * Why hold the camera stream open at all, then? Because it is the only way that
 * works in every browser to tell that a student revoked access halfway through.
 * The Permissions API can report changes in Chromium, but Safari does not
 * support querying camera or microphone at all, and a held track's own `ended`
 * and `mute` events are the reliable cross-browser signal.
 *
 * The visible trade-off: the camera indicator light stays on for the exam. That
 * is honest — something is holding the camera open — even though nothing is
 * looking through it.
 */

const POLL_INTERVAL_MS = 4000;

/** Ask for camera and microphone together, so the student sees one prompt. */
export async function requestMedia({ camera = true, microphone = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "This browser cannot access the camera or microphone." };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: camera ? { width: 320, height: 240, frameRate: 5 } : false,
      audio: microphone,
    });
    return { ok: true, stream };
  } catch (error) {
    const message =
      error?.name === "NotAllowedError"
        ? "Camera and microphone access was declined. It is required to take this test."
        : error?.name === "NotFoundError"
        ? "No camera or microphone was found on this device."
        : "Camera and microphone could not be started. Please check they are not in use by another app.";
    return { ok: false, error: message };
  }
}

export async function requestLocation() {
  if (!navigator.geolocation) {
    return { ok: false, error: "This browser cannot provide your location." };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      // The position itself is deliberately thrown away. Only the fact that
      // permission was granted is recorded.
      () => resolve({ ok: true }),
      (error) => {
        const message =
          error?.code === 1
            ? "Location access was declined. It is required to take this test."
            : "Your location could not be determined. Please check your device settings.";
        resolve({ ok: false, error: message });
      },
      { timeout: 15000, maximumAge: 0 }
    );
  });
}

export function createPermissionsDetector({ report, isPaused, getMediaStream, required = [] }) {
  let timer = null;
  let running = false;
  const reported = new Set();

  const flagOnce = (key, message) => {
    if (reported.has(key)) return;
    reported.add(key);
    report("permission_revoked", message);
  };

  /** Held tracks going dead is the cross-browser signal that access was cut. */
  const checkTracks = () => {
    const stream = getMediaStream?.();
    if (!stream) return;

    if (required.includes("camera")) {
      const track = stream.getVideoTracks?.()[0];
      if (track && (track.readyState === "ended" || track.muted)) {
        flagOnce("camera", "Camera access was turned off during the exam");
      } else if (track && track.readyState === "live" && !track.muted) {
        reported.delete("camera");
      }
    }

    if (required.includes("microphone")) {
      const track = stream.getAudioTracks?.()[0];
      if (track && track.readyState === "ended") {
        flagOnce("microphone", "Microphone access was turned off during the exam");
      } else if (track && track.readyState === "live") {
        reported.delete("microphone");
      }
    }
  };

  const check = () => {
    if (!running || isPaused?.()) return;
    checkTracks();
  };

  /**
   * The Permissions API, where it exists, catches a revocation made through the
   * browser's own site settings — which does not always kill the held track.
   * Safari does not support querying camera or microphone; that is fine,
   * the track check above covers it.
   */
  const watchPermissionApi = async () => {
    if (!navigator.permissions?.query) return;

    for (const name of required) {
      try {
        const status = await navigator.permissions.query({ name });
        status.onchange = () => {
          if (!running || isPaused?.()) return;
          if (status.state === "denied") {
            flagOnce(name, `${name} access was revoked during the exam`);
          } else if (status.state === "granted") {
            reported.delete(name);
          }
        };
      } catch {
        // This browser will not answer for this permission. Not a problem —
        // it simply means we rely on the track check instead.
      }
    }
  };

  return {
    name: "permissions",

    start() {
      running = true;
      reported.clear();
      watchPermissionApi();
      timer = setInterval(check, POLL_INTERVAL_MS);
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
