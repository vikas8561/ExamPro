/**
 * Has something been injected into the exam page?
 *
 * This is the closest a web page can get to the "no extensions" requirement,
 * and it is important to be straight about how close that is: **not very.**
 *
 * There is no browser API that lists installed extensions, and none that blocks
 * them. An extension runs above the page — it can read anything we render and
 * change anything we do, including switching this detector off. Nothing written
 * here changes that. Only a native lockdown application can.
 *
 * What this does catch is the clumsy end of the range: helpers that inject a
 * floating button, a sidebar or an answer panel into the exam, and anything
 * that removes our own blocking overlay to get at the page underneath. That is
 * worth having. It is not a guarantee, and it should never be described as one.
 */

const SWEEP_INTERVAL_MS = 4000;

/**
 * Page-world functions that extensions commonly replace.
 *
 * An extension's content script runs in an isolated world and cannot touch
 * these; to read or rewrite what the exam sends, it has to inject a script into
 * the page itself, and that injection shows up here. `attachShadow` is on the
 * list because patching it is how an extension gets at content inside closed
 * shadow roots — including its own competitors' — and no ordinary page has a
 * reason to.
 */
function nativeFunctionChecks() {
  const checks = [];
  try {
    checks.push(["fetch", window.fetch]);
    checks.push(["XMLHttpRequest.open", XMLHttpRequest.prototype.open]);
    checks.push(["Element.attachShadow", Element.prototype.attachShadow]);
  } catch {
    // Reading a global can throw in a hardened context; nothing to report.
  }
  return checks;
}

/**
 * Is this still the browser's own implementation?
 *
 * A patched function stringifies to its replacement's source; a native one
 * always contains `[native code]`. Anything unreadable returns true, because an
 * unanswerable question must never become an accusation.
 */
function isNativeFunction(fn) {
  try {
    if (typeof fn !== "function") return true;
    return Function.prototype.toString.call(fn).includes("[native code]");
  } catch {
    return true;
  }
}

// Attribute and class fragments that browser extensions commonly stamp on the
// nodes they inject. Matching is deliberately conservative: a false accusation
// during a real exam is worse than a missed detection.
const INJECTION_HINTS = [
  "chrome-extension://",
  "moz-extension://",
  "data-extension",
  "data-gramm", // Grammarly
  "grammarly-",
  "__firefox__",
];

function describeNode(node) {
  if (!node || node.nodeType !== 1) return null;

  const id = node.id || "";
  const className = typeof node.className === "string" ? node.className : "";
  const tag = (node.tagName || "").toLowerCase();

  // An injected iframe or script is the most meaningful thing to notice.
  if (tag === "iframe" || tag === "script") {
    const src = node.getAttribute?.("src") || "";
    if (INJECTION_HINTS.some((hint) => src.includes(hint))) {
      return `An extension injected a ${tag} into the exam page`;
    }
  }

  const haystack = `${id} ${className}`;
  if (INJECTION_HINTS.some((hint) => haystack.includes(hint))) {
    return "An extension injected content into the exam page";
  }

  for (const attr of node.getAttributeNames?.() || []) {
    if (INJECTION_HINTS.some((hint) => attr.includes(hint))) {
      return "An extension injected content into the exam page";
    }
  }

  return null;
}

/**
 * Has an extension mounted a panel inside a shadow root?
 *
 * This is how current AI sidebars hide. They append a plain `<div>` to the body,
 * give it a random id, and put everything real inside a shadow root — so a scan
 * of ids, classes and attributes, which is all the original check did, sees an
 * empty div and moves on.
 *
 * Deliberately narrow, because the exam page itself is free to use shadow DOM:
 * only a direct child of `<body>` counts, since that is where extensions attach
 * and where this application never renders. Everything of ours lives inside the
 * React root.
 */
function describeShadowHost(node, rootElement) {
  if (!node || node.nodeType !== 1) return null;
  if (node === rootElement) return null;

  try {
    if (!node.shadowRoot) return null;
  } catch {
    return null;
  }

  return "An extension mounted a hidden panel on the exam page";
}

export function createIntegrityDetector({
  report,
  isPaused,
  getGuardedElement,
  enabled = true,
  // Chrome extension ids to probe for, supplied by the server so a school can
  // name the ones it cares about without waiting for a deploy. See probeExtensions.
  extensionIds = [],
}) {
  let observer = null;
  let sweepTimer = null;
  let running = false;
  let reportedInjection = false;
  let reportedShadow = false;
  let reportedPatch = false;

  const active = () => running && enabled && !isPaused?.();

  const handleMutations = (mutations) => {
    if (!active()) return;

    const rootElement = document.getElementById("root");

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        const description = describeNode(node);
        if (description && !reportedInjection) {
          reportedInjection = true;
          report("page_tampered", description);
          return;
        }

        // A shadow root is usually attached a moment after the host element is
        // inserted, so the periodic sweep is what normally catches these. This
        // covers the case where it is already attached on arrival.
        if (node.parentNode === document.body) {
          const shadow = describeShadowHost(node, rootElement);
          if (shadow && !reportedShadow) {
            reportedShadow = true;
            report("page_tampered", shadow);
            return;
          }
        }
      }
    }
  };

  /**
   * Confirm our own blocking overlay is still in the document. An extension or
   * a devtools user removing it is the most direct way to try to keep working
   * through a warning, and it is easy to check for.
   */
  const sweep = () => {
    if (!active()) return;

    const guarded = getGuardedElement?.();
    if (guarded && !document.body.contains(guarded)) {
      report("page_tampered", "The exam security overlay was removed from the page");
      return;
    }

    // Cheap periodic scan of the top level, which catches injections that
    // happened while the observer was not yet attached.
    const rootElement = document.getElementById("root");
    for (const node of document.body.children) {
      const description = describeNode(node);
      if (description && !reportedInjection) {
        reportedInjection = true;
        report("page_tampered", description);
        return;
      }

      const shadow = describeShadowHost(node, rootElement);
      if (shadow && !reportedShadow) {
        reportedShadow = true;
        report("page_tampered", shadow);
        return;
      }
    }

    checkNativeFunctions();
  };

  /**
   * Have the page's own functions been replaced?
   *
   * Re-checked on every sweep rather than once at startup, because an extension
   * that waits for the exam to begin before patching is exactly the one worth
   * noticing. Reported at most once.
   */
  const checkNativeFunctions = () => {
    if (reportedPatch || !active()) return;

    for (const [name, fn] of nativeFunctionChecks()) {
      if (!isNativeFunction(fn)) {
        reportedPatch = true;
        report("page_tampered", `Something replaced the browser's own ${name}`);
        return;
      }
    }
  };

  /**
   * Ask whether particular extensions are installed.
   *
   * A page can load `chrome-extension://<id>/<file>` only when that extension
   * declares the file web-accessible; if it does, the request succeeding proves
   * the extension is there even before it has injected anything.
   *
   * Be clear about the limits. Manifest V3 lets extensions randomise these URLs
   * per session, and most no longer expose `manifest.json` at all, so a silent
   * result means "not detected", never "not installed". It is worth having for
   * the specific extensions a school knows it has a problem with, which is why
   * the list comes from the server rather than being hardcoded here.
   */
  const probeExtensions = async () => {
    if (!Array.isArray(extensionIds) || extensionIds.length === 0) return;

    for (const id of extensionIds) {
      if (!running || typeof id !== "string" || !/^[a-p]{32}$/.test(id)) continue;

      try {
        const response = await fetch(`chrome-extension://${id}/manifest.json`);
        if (response && response.ok && active()) {
          report("page_tampered", `A blocked browser extension is installed (${id})`);
        }
      } catch {
        // The overwhelmingly common outcome: not installed, or not exposing any
        // web-accessible resource. Neither is evidence of anything.
      }
    }
  };

  return {
    name: "integrity",

    start() {
      if (!enabled) return;
      running = true;
      reportedInjection = false;
      reportedShadow = false;
      reportedPatch = false;

      try {
        observer = new MutationObserver(handleMutations);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false,
        });
      } catch {
        // Without a MutationObserver we still have the periodic sweep.
      }

      sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);

      checkNativeFunctions();
      // Deliberately not awaited: a slow or hanging probe must not delay the
      // exam starting.
      probeExtensions();
    },

    stop() {
      running = false;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
      }
    },
  };
}
