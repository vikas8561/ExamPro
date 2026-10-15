/**
 * Drives the real camera/microphone detector against fake tracks, a fake
 * Permissions API and a fake "reopen the device" call, replaying what browsers
 * actually do. Covers the false "camera access was turned off" reports students
 * got without touching anything, and the real revocations that must still count.
 */

import { createPermissionsDetector } from "../src/proctoring/detectors/permissions.js";

let now = 0;
const timers = [];
globalThis.setInterval = (fn, ms) => { const t = { fn, at: now + ms, every: ms }; timers.push(t); return t; };
globalThis.clearInterval = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
const EPOCH = 1_700_000_000_000;
Date.now = () => EPOCH + now;

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Advance virtual time, letting the detector's async work finish after each tick. */
async function advance(ms) {
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    due.at = now + due.every;
    due.fn();
    for (let i = 0; i < 5; i++) await settle();
  }
  now = target;
}

// ── Fake browser ───────────────────────────────────────────────────────────
const fakeTrack = () => ({ readyState: "live", muted: false });
let permission = {};            // name -> "granted" | "denied" | "prompt"
let permissionStatuses = {};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    permissions: {
      query: async ({ name }) => {
        const status = permissionStatuses[name] || { onchange: null };
        Object.defineProperty(status, "state", { configurable: true, get: () => permission[name] });
        permissionStatuses[name] = status;
        return status;
      },
    },
  },
});
const changePermission = (name, state) => {
  permission[name] = state;
  permissionStatuses[name]?.onchange?.();
};

let pass = 0, fail = 0;

async function scenario(label, expected, script, { reacquireResults = [] } = {}) {
  now = 0; timers.length = 0;
  permission = { camera: "granted", microphone: "granted" };
  permissionStatuses = {};
  const stream = { video: fakeTrack(), audio: fakeTrack() };
  const reported = [];
  const reacquired = [];
  const results = [...reacquireResults];

  const det = createPermissionsDetector({
    report: (type) => reported.push(type),
    isPaused: () => false,
    getMediaStream: () => ({ getVideoTracks: () => [stream.video], getAudioTracks: () => [stream.audio] }),
    required: ["camera", "microphone"],
    reacquire: async (kind) => {
      reacquired.push(kind);
      const result = results.length ? results.shift() : { ok: true };
      if (result.ok) {
        if (kind === "camera") stream.video = fakeTrack();
        else stream.audio = fakeTrack();
      }
      return result;
    },
  });
  det.start();
  await settle();
  await script(stream);
  det.stop();

  const got = reported.join(",");
  const ok = got === expected.join(",");
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  expected [${expected.join(", ")}], got [${got}]${reacquired.length ? `  (reopened: ${reacquired.join(", ")})` : ""}   ${label}`);
}

console.log("\n════ Reported falsely before: nobody touched anything ════\n");

await scenario("Camera frames stall for a moment (track muted) on a busy CPU", [], async (s) => {
  s.video.muted = true;
  await advance(4000);
  s.video.muted = false;
  await advance(20000);
});

await scenario("Dim room: camera keeps flickering muted for a minute", [], async (s) => {
  for (let i = 0; i < 15; i++) {
    s.video.muted = i % 2 === 0;
    await advance(4000);
  }
});

await scenario("Bluetooth headset disconnects: mic track ends, default mic reopened", [], async (s) => {
  s.audio.readyState = "ended";
  await advance(8000);
});

await scenario("USB camera power-saves and comes straight back", [], async (s) => {
  s.video.readyState = "ended";
  await advance(8000);
});

await scenario("Camera taken by another app: recorded once (not charged), then recovers", ["media_device_lost"], async (s) => {
  s.video.readyState = "ended";
  await advance(60000);
}, { reacquireResults: [{ ok: false, name: "NotReadableError" }, { ok: false, name: "NotReadableError" }, { ok: true }] });

await scenario("Camera unplugged for good: recorded once, never charged", ["media_device_lost"], async (s) => {
  s.video.readyState = "ended";
  await advance(120000);
}, { reacquireResults: Array(20).fill({ ok: false, name: "NotFoundError" }) });

console.log("\n════ Real revocations, which must still be charged ════\n");

await scenario("Camera blocked in site settings (permission denied)", ["permission_revoked"], async () => {
  changePermission("camera", "denied");
  await advance(8000);
});

await scenario("Camera blocked in site settings, track ends too: charged once", ["permission_revoked"], async (s) => {
  changePermission("camera", "denied");
  s.video.readyState = "ended";
  await advance(30000);
});

await scenario("Site setting reset to 'Ask', track ends: charged, and no prompt is raised", ["permission_revoked"], async (s) => {
  permission.microphone = "prompt";
  s.audio.readyState = "ended";
  await advance(30000);
});

await scenario("Reopening is refused by the browser (NotAllowedError): charged", ["permission_revoked"], async (s) => {
  s.video.readyState = "ended";
  await advance(8000);
}, { reacquireResults: [{ ok: false, name: "NotAllowedError" }] });

await scenario("Revoked, given back, revoked again: charged twice", ["permission_revoked", "permission_revoked"], async () => {
  changePermission("camera", "denied");
  await advance(4000);
  changePermission("camera", "granted");
  await advance(20000);
  changePermission("camera", "denied");
  await advance(4000);
});

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
