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

// How often a device that could not be reopened is tried again.
const RETRY_LOST_MS = 15000;

// The camera is opened small and slow: nothing ever looks at the frames.
export const CAMERA_CONSTRAINTS = { width: 320, height: 240, frameRate: 5 };

/** Ask for camera and microphone together, so the student sees one prompt. */
export async function requestMedia({ camera = true, microphone = true } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "This browser cannot access the camera or microphone." };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: camera ? CAMERA_CONSTRAINTS : false,
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

/**
 * Notices a camera or microphone permission being withdrawn mid-exam.
 *
 * ── Why this was rewritten ──
 *
 * It used to charge `permission_revoked` whenever a held track was `muted` or
 * had ended. Neither means the student withdrew anything, and both happen to
 * students who are sitting perfectly still:
 *
 *   muted    The specification's meaning is "the source is temporarily unable
 *            to provide data". Chrome sets it whenever frames stop arriving
 *            for a moment -- a busy CPU, a webcam dropping its frame rate in a
 *            dim room, a USB hiccup -- and clears it when they resume. One
 *            unlucky poll during that moment cost the student a violation, and
 *            because the flag re-armed when frames came back, it could happen
 *            again and again in one exam.
 *   ended    The device went away: a USB camera unplugged or power-saved, a
 *            Bluetooth headset that disconnected or switched to a phone, the
 *            camera taken by another application. The permission is untouched.
 *
 * Now `muted` is ignored, and an ended track is first reopened -- silently,
 * since the permission is still granted and no prompt appears. Only a
 * permission that is actually no longer granted is charged. A device that
 * stays unavailable is recorded for the reviewer as `media_device_lost`
 * (weight 0) and retried in the background. Nothing is ever read from these
 * devices, so the exam loses nothing by carrying on without one.
 *
 * `reacquire(kind)` is supplied by the provider, which owns the stream: it opens
 * a fresh track and swaps it in, resolving `{ ok }` or `{ ok: false, name }`.
 */
export function createPermissionsDetector({ report, isPaused, getMediaStream, required = [], reacquire }) {
  let timer = null;
  let running = false;

  // Per device: "ok" | "recovering" | "lost" | "revoked".
  const state = new Map();
  const lostAt = new Map();
  const statuses = [];

  const kinds = required.filter((name) => name === "camera" || name === "microphone");
  const trackOf = (kind) => {
    const stream = getMediaStream?.();
    return kind === "camera" ? stream?.getVideoTracks?.()[0] : stream?.getAudioTracks?.()[0];
  };

  /** What the browser says about the permission now, or null if it will not say. */
  const permissionState = async (kind) => {
    if (!navigator.permissions?.query) return null;
    try {
      return (await navigator.permissions.query({ name: kind })).state;
    } catch {
      return null;
    }
  };

  const charge = (kind) => {
    if (state.get(kind) === "revoked") return;
    state.set(kind, "revoked");
    report("permission_revoked", `${kind === "camera" ? "Camera" : "Microphone"} permission was withdrawn during the exam`);
  };

  /** A held track has ended. Work out why before saying anything. */
  const handleEnded = async (kind) => {
    const current = state.get(kind) || "ok";
    if (current === "recovering" || current === "revoked") return;
    state.set(kind, "recovering");

    // "denied", or reset to "ask": the permission really is gone. Reopening
    // would only put a prompt in front of the student, which itself drops them
    // out of fullscreen.
    const permission = await permissionState(kind);
    if (!running) return;
    if (permission === "denied" || permission === "prompt") {
      charge(kind);
      return;
    }

    const result = (await reacquire?.(kind)) || { ok: false, name: "Unsupported" };
    if (!running) return;
    if (result.ok) {
      state.set(kind, "ok");
      lostAt.delete(kind);
      return;
    }
    if (result.name === "NotAllowedError" || result.name === "SecurityError") {
      charge(kind);
      return;
    }

    // Still permitted, but the device is not there or not free. Record it once
    // per loss and keep trying quietly.
    if (current !== "lost" && !isPaused?.()) {
      report(
        "media_device_lost",
        `The ${kind} stopped and could not be reopened (${result.name || "unavailable"}). Check it is connected and not in use by another app.`
      );
    }
    state.set(kind, "lost");
    lostAt.set(kind, Date.now());
  };

  const check = () => {
    if (!running || isPaused?.()) return;
    for (const kind of kinds) {
      const track = trackOf(kind);
      // No track at all means it was never held -- the bypass code waived it.
      if (!track) continue;

      const current = state.get(kind) || "ok";
      if (current === "lost") {
        if (Date.now() - (lostAt.get(kind) || 0) >= RETRY_LOST_MS) handleEnded(kind);
        continue;
      }
      if (current === "ok" && track.readyState === "ended") handleEnded(kind);
    }
  };

  /**
   * The Permissions API, where it answers, catches a revocation made through
   * the browser's site settings, which does not always end the held track.
   */
  const watchPermissionApi = async () => {
    if (!navigator.permissions?.query) return;

    for (const kind of kinds) {
      try {
        const status = await navigator.permissions.query({ name: kind });
        status.onchange = () => {
          if (!running) return;
          if (status.state === "denied") {
            if (!isPaused?.()) charge(kind);
          } else if (status.state === "granted" && state.get(kind) === "revoked") {
            // Given back. Reopen it, and let a later withdrawal count again.
            state.set(kind, "lost");
            lostAt.set(kind, 0);
          }
        };
        statuses.push(status);
      } catch {
        // This browser will not answer for this permission. The track check
        // covers it.
      }
    }
  };

  return {
    name: "permissions",

    start() {
      running = true;
      state.clear();
      lostAt.clear();
      watchPermissionApi();
      timer = setInterval(check, POLL_INTERVAL_MS);
    },

    stop() {
      running = false;
      statuses.forEach((status) => { status.onchange = null; });
      statuses.length = 0;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
