/**
 * What browser are we in, and what can it actually do?
 *
 * Every capability the proctoring system relies on is checked here once, up
 * front, rather than being assumed and silently failing later. The rule
 * throughout is: a missing feature reports "unavailable" and the exam carries
 * on. It never blocks an honest student, and it never invents a violation.
 */

// Explicit extension so this module also loads under plain Node, which is how
// scripts/seb-scenarios.mjs exercises assessReadiness without a bundler.
import { detectSEB, looksLikeSebWithoutApi, sebVersionFromUserAgent } from "./seb.js";

/**
 * Brave has to be detected on purpose: it reports itself as Chrome in the user
 * agent and only admits what it is through this promise-based check.
 *
 * It matters because Brave's anti-fingerprinting deliberately hides or fuzzes
 * some of the values we read — `screen.isExtended` in particular. Knowing we
 * are in Brave is what lets us record "unknown" instead of accusing someone of
 * using a second monitor because a privacy feature returned a blank.
 */
export async function detectBrave() {
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
      return (await navigator.brave.isBrave()) === true;
    }
  } catch {
    // Brave's own check failing is not something to act on.
  }
  return false;
}

/**
 * Detect Microsoft Edge.
 * Edge is Chromium-based and reports Chrome tokens, but includes Edg/ or Edge/
 * in its user agent or reports Edge in userAgentData brands.
 */
export function detectEdge() {
  if (typeof navigator === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    const brands = navigator.userAgentData?.brands;

    if (/Edg\/|Edge\/|EdgA\/|EdgiOS\//i.test(ua)) return true;
    if (Array.isArray(brands) && brands.some((b) => /Edge|Microsoft Edge/i.test(b.brand))) {
      return true;
    }
  } catch {
    // Fail safe
  }
  return false;
}

/** A readable browser name, for the report and for support conversations. */
export function detectBrowserName(isBrave) {
  if (isBrave) return "Brave";
  if (detectEdge()) return "Edge";
  if (typeof navigator === "undefined") return "Unknown";

  const ua = navigator.userAgent || "";
  const brands = navigator.userAgentData?.brands;

  // Order matters: several browsers include "Chrome" in their user agent.
  if (/Edg\/|Edge\//i.test(ua) || brands?.some((b) => /Edge/i.test(b.brand))) return "Edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua) || brands?.some((b) => /Opera/i.test(b.brand))) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (
    /Chromium\//.test(ua) ||
    (brands?.some((b) => b.brand === "Chromium") && !brands?.some((b) => b.brand === "Google Chrome"))
  ) {
    return "Chromium";
  }
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Unknown";
}

/**
 * Which operating system is this?
 *
 * Needed because Safe Exam Browser has never existed for Linux, so a student
 * there has to be offered the ordinary browser-based proctoring rather than an
 * instruction they cannot follow.
 *
 * `navigator.platform` is deprecated and lies on some browsers, so the modern
 * `userAgentData.platform` is preferred where it exists. This answer is only
 * used to shape what the student is shown — the server works the operating
 * system out for itself, from the User-Agent header, before it decides whether
 * anyone is allowed to skip SEB.
 */
export function detectOS() {
  if (typeof navigator === "undefined") return "unknown";

  try {
    const modern = navigator.userAgentData?.platform;
    if (typeof modern === "string" && modern) {
      const value = modern.toLowerCase();
      if (value.includes("win")) return "windows";
      if (value.includes("mac")) return "macos";
      if (value.includes("linux") || value.includes("chrome os")) return "linux";
      if (value.includes("android")) return "android";
      if (value.includes("ios")) return "ios";
    }
  } catch {
    // Fall through to the user agent.
  }

  const ua = navigator.userAgent || "";
  // Order matters: iPadOS and Android both mention Linux in their user agent.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows NT|Win64|WOW64/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Safe Exam Browser ships for Windows, macOS and iOS only — there has never been
 * a Linux build and none is planned. Phones and tablets are blocked from exams
 * for unrelated reasons, so on the desktop these two are the whole list.
 */
export function sebAvailableForOS(os) {
  return os === "windows" || os === "macos";
}

/** Phones and tablets cannot meet the fullscreen and keyboard rules. */
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|CriOS|Mobile/i.test(
    navigator.userAgent || ""
  );
}

/**
 * The Keyboard Lock API is what lets us capture keys the browser normally keeps
 * for itself — Escape, F11, Ctrl+W, Ctrl+T, Ctrl+N, and on some systems even
 * Alt+Tab. It exists only in Chromium browsers (Chrome, Edge, Brave), and it
 * silently does nothing outside a secure context, which is the easiest thing in
 * this whole system to get wrong: on plain HTTP it fails without any error.
 */
export function keyboardLockSupported() {
  return Boolean(
    window.isSecureContext &&
      navigator.keyboard &&
      typeof navigator.keyboard.lock === "function"
  );
}

/** Sharing the whole screen requires this. Absent in some embedded browsers. */
export function screenShareSupported() {
  return Boolean(
    navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function"
  );
}

export function fullscreenSupported() {
  const el = document.documentElement;
  return Boolean(
    el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
  );
}

/**
 * Is the page allowed to use the Window Management feature?
 *
 * This matters more than it looks. The specification makes `screen.isExtended`
 * return a plain `false` -- "one screen" -- whenever the page is not allowed to
 * use the feature, so a permissions policy that blocks it (set by a proxy, an
 * extension rewriting response headers, or an embedding page) would make every
 * second monitor invisible while looking exactly like an honest answer.
 *
 * Chrome renamed the feature in version 111 ("window-placement" before,
 * "window-management" after), so whichever name this browser knows is the one
 * asked about. Returns true / false, or null when the browser offers no way to
 * ask -- in which case `isExtended` is taken at its word.
 */
export function windowManagementAllowed() {
  try {
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== "function") return null;
    const known = typeof policy.features === "function" ? policy.features() : [];
    const name = ["window-management", "window-placement"].find((feature) => known.includes(feature));
    if (!name) return null;
    return policy.allowsFeature(name) === true;
  } catch {
    return null;
  }
}

/**
 * How many screens does this computer have, as far as the browser can tell?
 *
 * Returns the report the server judges (services/browserRequirement.js):
 *
 *   { isExtended: true | false | null, policyAllowed: true | false | null, state }
 *
 * where `state` is the same verdict the server will reach:
 *
 *   "single"      one display, and the browser could say so
 *   "multiple"    an external monitor is extending the desktop
 *   "unverified"  the browser cannot answer (Firefox, Safari, Brave, Chrome or
 *                 Edge older than 100) or the answer is blocked
 *
 * Only extended monitors can be seen. A monitor set to *mirror* the laptop
 * screen is presented to the browser as one screen by every operating system,
 * so no web page can detect it. Chargers, mice, keyboards and USB hubs are not
 * displays and never appear here at all.
 */
export function detectDisplays() {
  let isExtended = null;
  try {
    if (typeof window !== "undefined" && typeof window.screen?.isExtended === "boolean") {
      isExtended = window.screen.isExtended;
    }
  } catch {
    // Privacy protections can throw here rather than return a value.
  }

  const policyAllowed = typeof document !== "undefined" ? windowManagementAllowed() : null;

  let state = "unverified";
  if (policyAllowed !== false && isExtended === true) state = "multiple";
  else if (policyAllowed !== false && isExtended === false) state = "single";

  return { isExtended, policyAllowed, state };
}

/**
 * Is a second display attached? "yes", "no" or "unknown" -- never a guess.
 *
 * The older, coarser answer, still recorded on the session for the reviewer.
 * The exam's monitor rule uses detectDisplays() above.
 */
export function detectSecondMonitor() {
  const { state } = detectDisplays();
  if (state === "multiple") return "yes";
  if (state === "single") return "no";
  return "unknown";
}

/**
 * One call at startup that answers everything the gate and the detectors need.
 */
export async function inspectEnvironment() {
  const isBrave = await detectBrave();
  const browser = detectBrowserName(isBrave);
  const isMobile = isMobileDevice();
  const seb = await detectSEB();
  const os = detectOS();

  return {
    browser,
    isBrave,
    platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
    os,
    sebAvailableForOS: sebAvailableForOS(os),
    isMobile,
    isSecureContext: typeof window !== "undefined" ? Boolean(window.isSecureContext) : false,
    keyboardLockSupported: keyboardLockSupported(),
    screenShareSupported: screenShareSupported(),
    fullscreenSupported: fullscreenSupported(),
    secondMonitor: detectSecondMonitor(),
    display: detectDisplays(),
    // Safe Exam Browser, when the exam is running inside it.
    isSEB: seb.isSEB,
    // Running inside SEB, but with no JavaScript API to prove it. Distinguished
    // so the exam page can explain the misconfiguration instead of offering a
    // launch button that reloads into the same dead end.
    sebWithoutApi: looksLikeSebWithoutApi(),
    // Read from the user agent, which is the only source left when the
    // JavaScript API is missing — and the version is usually why it is missing.
    sebUserAgentVersion: sebVersionFromUserAgent(),
    sebVersion: seb.version,
    sebBrowserExamKeyHash: seb.browserExamKeyHash,
    sebConfigKeyHash: seb.configKeyHash,
    sebPageUrl: seb.pageUrl,
  };
}

/**
 * Things that must be true before an exam can begin at all, in plain language.
 *
 * Returns a list of blocking problems and a list of warnings. Warnings are for
 * the student's benefit and never stop the exam.
 */
export function assessReadiness(env) {
  const blockers = [];
  const warnings = [];

  // Any desktop browser can sit the exam; what is checked is capability, not
  // brand. Inside Safe Exam Browser the fullscreen and screen-share checks are
  // skipped rather than softened: SEB's kiosk is not the Fullscreen API, and it
  // supports no `getDisplayMedia` on any platform, so demanding either would
  // block every SEB student forever. A phone pretending to be a desktop is
  // still checked exactly as before.
  if (env.isMobile) {
    blockers.push(
      "This test needs a laptop or desktop computer. Phones and tablets cannot meet the exam security requirements."
    );
  }

  if (!env.isSEB && !env.fullscreenSupported) {
    blockers.push(
      "This browser cannot enter fullscreen mode, which this test requires. Please use an up-to-date Google Chrome or Microsoft Edge."
    );
  }

  if (!env.isSEB && !env.screenShareSupported) {
    blockers.push(
      "This browser cannot share your screen, which this test requires. Please use an up-to-date Google Chrome or Microsoft Edge."
    );
  }

  if (!env.isSecureContext) {
    warnings.push(
      "This page is not on a secure (HTTPS) connection, so some exam protections cannot be switched on."
    );
  }

  return { blockers, warnings, ready: blockers.length === 0 };
}
