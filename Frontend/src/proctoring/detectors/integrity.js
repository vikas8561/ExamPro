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

export function createIntegrityDetector({ report, isPaused, getGuardedElement, enabled = true }) {
  let observer = null;
  let sweepTimer = null;
  let running = false;
  let reportedInjection = false;

  const active = () => running && enabled && !isPaused?.();

  const handleMutations = (mutations) => {
    if (!active()) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        const description = describeNode(node);
        if (description && !reportedInjection) {
          reportedInjection = true;
          report("page_tampered", description);
          return;
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
    for (const node of document.body.children) {
      const description = describeNode(node);
      if (description && !reportedInjection) {
        reportedInjection = true;
        report("page_tampered", description);
        return;
      }
    }
  };

  return {
    name: "integrity",

    start() {
      if (!enabled) return;
      running = true;
      reportedInjection = false;

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
