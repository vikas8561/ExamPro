/**
 * What browser are we in, and what can it actually do?
 *
 * Every capability the proctoring system relies on is checked here once, up
 * front, rather than being assumed and silently failing later. The rule
 * throughout is: a missing feature reports "unavailable" and the exam carries
 * on. It never blocks an honest student, and it never invents a violation.
 */

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
 * ExamPro requires desktop Google Chrome only.
 * Explicitly rejects Brave, Edge, Opera, Firefox, Safari, Chromium, mobile and unknown browsers.
 */
export function isSupportedChrome(env) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!env) return false;
  if (env.isBrave || env.isEdge || env.isMobile) return false;
  if (env.browser && env.browser !== "Chrome" && env.browser !== "Google Chrome") return false;

  if (detectEdge()) return false;
  if (isMobileDevice()) return false;

  const ua = navigator.userAgent || "";
  const vendor = navigator.vendor || "";
  const brands = navigator.userAgentData?.brands;

  // Explicitly reject Edge
  if (/Edg\/|Edge\/|EdgA\/|EdgiOS\//i.test(ua)) return false;
  if (Array.isArray(brands) && brands.some((b) => /Edge|Microsoft Edge/i.test(b.brand))) {
    return false;
  }

  // Reject browsers identifying as Opera, Firefox, Safari
  if (
    /OPR\//i.test(ua) ||
    /Opera/i.test(ua) ||
    /Firefox\//i.test(ua) ||
    (/Safari\//i.test(ua) && /Version\//i.test(ua))
  ) {
    return false;
  }

  if (Array.isArray(brands) && brands.some((b) => /Opera|Brave/i.test(b.brand))) {
    return false;
  }

  // Reject unbranded Chromium or missing Google Chrome brand
  if (/Chromium\//i.test(ua)) return false;
  if (Array.isArray(brands)) {
    const hasGoogleChrome = brands.some((b) => b.brand === "Google Chrome");
    if (!hasGoogleChrome) return false;
  }

  // Strictly require desktop Google Chrome markers
  const hasChromeUa = /Chrome\//i.test(ua) && !/HeadlessChrome/i.test(ua);
  const hasGoogleVendor = /Google Inc\./i.test(vendor) || Boolean(window.chrome);
  const hasChromeBrand = Array.isArray(brands)
    ? brands.some((b) => b.brand === "Google Chrome")
    : true;

  return Boolean(hasChromeUa && hasGoogleVendor && hasChromeBrand);
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
 * Is a second display attached?
 *
 * A second monitor is a genuinely common way to cheat and the old system never
 * looked at all. Returns "yes", "no", or "unknown" — never a guess. Brave and
 * Firefox may withhold this, and an unanswered question must not become an
 * accusation.
 */
export function detectSecondMonitor() {
  try {
    if (typeof window.screen?.isExtended === "boolean") {
      return window.screen.isExtended ? "yes" : "no";
    }
  } catch {
    // Privacy protections can throw here rather than return a value.
  }
  return "unknown";
}

/**
 * One call at startup that answers everything the gate and the detectors need.
 */
export async function inspectEnvironment() {
  const isBrave = await detectBrave();
  const isEdge = detectEdge();
  const browser = detectBrowserName(isBrave);
  const isMobile = isMobileDevice();

  return {
    browser,
    isBrave,
    isEdge,
    isSupportedChrome: isSupportedChrome({ browser, isBrave, isEdge, isMobile }),
    platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
    isMobile,
    isSecureContext: typeof window !== "undefined" ? Boolean(window.isSecureContext) : false,
    keyboardLockSupported: keyboardLockSupported(),
    screenShareSupported: screenShareSupported(),
    fullscreenSupported: fullscreenSupported(),
    secondMonitor: detectSecondMonitor(),
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

  if (env.isEdge || !env.isSupportedChrome) {
    blockers.push("This exam can only be taken using Google Chrome.");
  }

  if (env.isMobile) {
    blockers.push(
      "This test needs a laptop or desktop computer. Phones and tablets cannot meet the exam security requirements."
    );
  }

  if (!env.fullscreenSupported) {
    blockers.push(
      "This browser cannot enter fullscreen mode, which this test requires. Please use Google Chrome."
    );
  }

  if (!env.screenShareSupported) {
    blockers.push(
      "This browser cannot share your screen, which this test requires. Please use Google Chrome."
    );
  }

  if (!env.isSecureContext) {
    warnings.push(
      "This page is not on a secure (HTTPS) connection, so some exam protections cannot be switched on."
    );
  }

  return { blockers, warnings, ready: blockers.length === 0 };
}
