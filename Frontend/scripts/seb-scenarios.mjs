/**
 * Safe Exam Browser detection, driven against a fake window.
 *
 * The cases that matter are the awkward ones. SEB injects its JavaScript API at
 * different moments depending on the build: newer versions have the key hashes
 * filled in before the page runs, older ones need `updateKeys()` and answer
 * asynchronously, and a broken or half-loaded build may never answer at all.
 * None of those may hang the exam or throw, because an exception here would take
 * down a student who is doing everything right.
 *
 * Run with:  npm run test:seb
 */

import { detectSEB, isSebPresent, readSebKeyHash } from "../src/proctoring/seb.js";
import { detectOS, sebAvailableForOS, assessReadiness } from "../src/proctoring/environment.js";

let pass = 0,
  fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ""}`);
  }
};

const HASH = "a".repeat(64);

/** Replace the fake window with one shaped like a particular SEB build. */
function setWindow(safeExamBrowser, href = "https://exam.test/student/take-test/1?n=abc") {
  globalThis.window = {
    location: { href },
    isSecureContext: true,
    ...(safeExamBrowser ? { SafeExamBrowser: safeExamBrowser } : {}),
  };
}

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

console.log("\n════ Detection: is Safe Exam Browser there at all? ════\n");

setWindow(null);
check("an ordinary browser is not SEB", isSebPresent() === false);
check("no key hash to read in an ordinary browser", readSebKeyHash() === "");
check("detectSEB reports isSEB false", (await detectSEB()).isSEB === false);

// A modern build: SEB for Windows 3.3.2+ and macOS 3.1+ fill the values in
// before the page loads and expose no callback.
setWindow({ version: "3.10.2", security: { browserExamKey: "b".repeat(64), configKey: HASH } });
let result = await detectSEB();
check("a modern build is detected", result.isSEB === true);
check("its version is read", result.version === "3.10.2");
check("its key hash is read", result.configKeyHash === HASH);
check("the page URL is captured for diagnostics", result.pageUrl.includes("n=abc"));
check("the URL fragment is stripped", (await detectSEB()).pageUrl.indexOf("#") === -1);

console.log("\n════ Older builds: keys arrive asynchronously ════\n");

// SEB before Windows 3.3.2 / macOS 3.1: the variables are empty until
// updateKeys() calls back.
let callbackFired = false;
const older = {
  version: "3.2.0",
  security: {
    browserExamKey: "",
    configKey: "",
    updateKeys(cb) {
      setTimeout(() => {
        older.security.configKey = HASH;
        callbackFired = true;
        cb();
      }, 10);
    },
  },
};
setWindow(older);
result = await detectSEB();
check("updateKeys is called on builds that need it", callbackFired === true);
check("the key hash is read after the callback, not before", result.configKeyHash === HASH);

console.log("\n════ Broken builds must not hang or throw the exam ════\n");

// A build that accepts the call and never answers. Without a timeout this would
// leave the student on a blank loading screen forever.
setWindow({
  version: "3.0.0",
  security: { browserExamKey: "", configKey: "", updateKeys() {} },
});
const started = Date.now();
result = await detectSEB();
const elapsed = Date.now() - started;
check("a callback that never fires still resolves", result.isSEB === true);
check("it resolves via the timeout, not by hanging", elapsed >= 1000 && elapsed < 4000, `${elapsed}ms`);
check("an unanswered key reads as empty, never undefined", result.configKeyHash === "");

setWindow({
  version: "3.5.0",
  security: {
    get configKey() {
      throw new Error("hardened context");
    },
    updateKeys(cb) {
      throw new Error("nope");
    },
  },
});
let threw = false;
try {
  result = await detectSEB();
} catch {
  threw = true;
}
check("an API that throws on read does not throw the exam", threw === false);
check("it degrades to an empty hash", result.configKeyHash === "");

setWindow({ security: {} });
result = await detectSEB();
check("an API with no version is still SEB", result.isSEB === true);
check("a missing version reads as empty string", result.version === "");

setWindow({});
check("an API with no security block does not throw", readSebKeyHash() === "");

console.log("\n════ Waiting for a late-arriving JavaScript API ════\n");

// The failure seen on SEB for Windows 3.10.2: the API is real and supported, but
// the exam page checked for it before SEB had injected it, concluded it was an
// ordinary browser, and told a student already inside SEB to launch SEB.
{
  setNavigator({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 SEB/3.10.2" });
  globalThis.window = { location: { href: "https://exam.test/student/take-test/1?n=abc" } };

  // SEB injects 400ms after the page mounts.
  setTimeout(() => {
    globalThis.window.SafeExamBrowser = {
      version: "3.10.2",
      security: { browserExamKey: "b".repeat(64), configKey: HASH },
    };
  }, 400);

  const startedAt = Date.now();
  const late = await detectSEB();
  const waited = Date.now() - startedAt;
  check("an API that arrives late is still detected", late.isSEB === true, JSON.stringify(late));
  check("its key hash is read once it appears", late.configKeyHash === HASH);
  check("it returns as soon as the API appears, not after the full timeout", waited < 1500, waited + "ms");
}

{
  // An ordinary browser must never be delayed by that wait.
  setNavigator({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0" });
  globalThis.window = { location: { href: "https://exam.test/" } };
  const startedAt = Date.now();
  const plain = await detectSEB();
  check("an ordinary browser is not SEB", plain.isSEB === false);
  check("and is not delayed at all", Date.now() - startedAt < 100, Date.now() - startedAt + "ms");
}

{
  // A user agent claiming SEB that never produces an API gives up, rather than
  // hanging the exam page forever.
  setNavigator({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0.0.0 SEB/3.10.2" });
  globalThis.window = { location: { href: "https://exam.test/" } };
  const startedAt = Date.now();
  const never = await detectSEB();
  const waited = Date.now() - startedAt;
  check("a claimed SEB with no API eventually gives up", never.isSEB === false);
  check("after roughly the timeout, not forever", waited >= 2500 && waited < 6000, waited + "ms");
}

console.log("\n════ Operating system: where SEB can and cannot run ════\n");

const AGENTS = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  macos: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120",
  ios: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
};
for (const [expected, userAgent] of Object.entries(AGENTS)) {
  setNavigator({ userAgent });
  check(`${expected} is detected from the user agent`, detectOS() === expected);
}

setNavigator({ userAgent: AGENTS.linux, userAgentData: { platform: "Windows" } });
check("the modern platform API wins over the user agent", detectOS() === "windows");

check("SEB runs on Windows", sebAvailableForOS("windows") === true);
check("SEB runs on macOS", sebAvailableForOS("macos") === true);
check("SEB has never run on Linux", sebAvailableForOS("linux") === false);
check("SEB is not offered on an unknown OS", sebAvailableForOS("unknown") === false);

console.log("\n════ Readiness: the two gates that would reject every SEB student ════\n");

// Exactly the shape SEB presents: not Chrome, no getDisplayMedia, and a kiosk
// that is not the Fullscreen API.
const sebEnv = {
  isSEB: true,
  browser: "Unknown",
  isSupportedChrome: false,
  isEdge: false,
  isBrave: false,
  isMobile: false,
  fullscreenSupported: false,
  screenShareSupported: false,
  isSecureContext: true,
};
const sebReadiness = assessReadiness(sebEnv);
check("SEB is not rejected for failing the Chrome check", sebReadiness.ready === true, JSON.stringify(sebReadiness.blockers));
check("SEB is not rejected for having no screen sharing", sebReadiness.blockers.length === 0);

// The same environment without SEB must still be rejected — relaxing the gates
// for SEB must not relax them for an ordinary unsupported browser.
const plainEnv = { ...sebEnv, isSEB: false };
const plainReadiness = assessReadiness(plainEnv);
check("an ordinary browser failing the same checks is still blocked", plainReadiness.ready === false);
check("and is told about Chrome", plainReadiness.blockers.some((b) => b.includes("Google Chrome")));

// A phone claiming to be SEB is still a phone.
const mobileSeb = { ...sebEnv, isMobile: true };
check("a mobile device is blocked even inside SEB", assessReadiness(mobileSeb).ready === false);

console.log("\n──────────────");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
