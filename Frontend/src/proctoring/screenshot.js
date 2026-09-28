/**
 * Capturing a frame of the student's screen when a violation is recorded.
 *
 * This reads the screen-share stream the student granted at the gate. No new
 * permission is requested and no prompt appears, because the permission already
 * exists — which is exactly why it deserves stating plainly rather than being
 * buried: until this file existed, the stream was held open and **never read**.
 * The pre-exam screen now says so, because a permission granted for one purpose
 * is not consent for another.
 *
 * What is captured is the whole screen, and it has to be: the point is to show
 * what else was in front of the student, which a capture of the exam window
 * alone would miss entirely. So the frame may contain anything else they had
 * open. Two things follow, and both are implemented rather than promised:
 *
 *   - Frames are downscaled and compressed hard — enough to identify an
 *     application, not enough to read someone's private correspondence.
 *   - They are deleted after 72 hours by a database TTL index, not by a job
 *     anyone has to remember.
 *
 * Nothing here may interrupt an exam. Every failure path returns null and the
 * violation is recorded exactly as it would have been anyway.
 */

/** Wide enough to tell which application is in front; not a readable document. */
const MAX_WIDTH = 1280;

/** Aggressive on purpose: smaller files, and less legible detail. */
const JPEG_QUALITY = 0.5;

/** A capture that has not produced a frame by now never will. */
const CAPTURE_TIMEOUT_MS = 2000;

let videoElement = null;

/**
 * A single hidden <video> kept alive for the exam, rather than one per capture.
 *
 * Attaching a stream and waiting for it to produce a frame costs far more than
 * drawing from one already running, and a violation is the worst moment to spend
 * that time.
 */
async function videoFor(stream) {
  if (videoElement && videoElement.srcObject === stream && videoElement.readyState >= 2) {
    return videoElement;
  }

  if (videoElement) {
    try {
      videoElement.pause();
      videoElement.srcObject = null;
      videoElement.remove();
    } catch {
      // Tearing down a dead element is not worth reporting.
    }
  }

  const video = document.createElement("video");
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  // Off-screen rather than display:none — a hidden element is not guaranteed to
  // decode frames, and this one exists only to be drawn from.
  video.style.cssText =
    "position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
  video.srcObject = stream;
  document.body.appendChild(video);

  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    video.onloadeddata = done;
    setTimeout(done, CAPTURE_TIMEOUT_MS);
    video.play().catch(done);
  });

  videoElement = video;
  return video;
}

/**
 * Grab one frame as a JPEG data URL, or null if anything at all goes wrong.
 *
 * `getStream` is a function rather than a stream so that a capture always uses
 * whatever share is current — a student who re-shared mid-exam has a new stream,
 * and holding the old one would quietly capture nothing.
 */
export async function captureScreenFrame(getStream) {
  try {
    const stream = typeof getStream === "function" ? getStream() : null;
    if (!stream) return null;

    const track = stream.getVideoTracks?.()[0];
    if (!track || track.readyState !== "live") return null;

    const video = await videoFor(stream);
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    // A capture failing is not a reason to disturb an exam, and not evidence of
    // anything either. The violation itself is already recorded.
    return null;
  }
}

/** Drop the hidden video when the exam ends, so no stream is held by it. */
export function releaseCapture() {
  if (!videoElement) return;
  try {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.remove();
  } catch {
    // Nothing useful to do while tearing down.
  }
  videoElement = null;
}
