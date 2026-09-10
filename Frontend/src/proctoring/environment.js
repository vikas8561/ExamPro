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

/** A readable browser name, for the report and for support conversations. */
export function detectBrowserName(isBrave) {
  if (isBrave) return "Brave";

  const ua = navigator.userAgent || "";

  // Order matters: several browsers include "Chrome" in their user agent.
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Unknown";
}

/** Phones and tablets cannot meet the fullscreen and keyboard rules. */
export function isMobileDevice() {
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
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
  const browser = detectBrowserName(isBrave);

  return {
    browser,
    isBrave,
    platform: navigator.platform || "",
    isMobile: isMobileDevice(),
    isSecureContext: Boolean(window.isSecureContext),
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
 * the student's benefit — "this browser will make you re-enter fullscreen by
 * hand" — and never stop the exam.
 */
export function assessReadiness(env) {
  const blockers = [];
  const warnings = [];

  if (env.isMobile) {
    blockers.push(
      "This test needs a laptop or desktop computer. Phones and tablets cannot meet the exam security requirements."
    );
  }

  if (!env.fullscreenSupported) {
    blockers.push(
      "This browser cannot enter fullscreen mode, which this test requires. Please use Chrome, Edge or Brave."
    );
  }

  if (!env.screenShareSupported) {
    blockers.push(
      "This browser cannot share your screen, which this test requires. Please use Chrome, Edge or Brave."
    );
  }

  if (!env.isSecureContext) {
    warnings.push(
      "This page is not on a secure (HTTPS) connection, so some exam protections cannot be switched on."
    );
  }

  if (!env.keyboardLockSupported) {
    warnings.push(
      `${env.browser} cannot lock the keyboard during the exam. Keyboard shortcuts will still be blocked, but pressing Escape may drop you out of fullscreen — you will be asked to return to it, and it will be recorded.`
    );
  }

  return { blockers, warnings, ready: blockers.length === 0 };
}
