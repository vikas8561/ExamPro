/**
 * The integrity detector, driven against a fake DOM.
 *
 * This is the check that stands in for "no browser extensions", and it matters
 * most where Safe Exam Browser cannot run — on Linux, where students keep the
 * ordinary browser-based proctoring. It cannot be made reliable: an extension
 * runs above the page and can switch any of this off. What it can do is catch
 * the clumsy and the commercial, and it must do that without ever accusing a
 * student who has done nothing.
 *
 * That second half is why these scenarios exist. Every violation this detector
 * raises is scored zero, so a false positive costs a line in a reviewer's report
 * rather than a cancelled paper — but a detector that cries wolf on every exam
 * teaches reviewers to ignore it, which is the same as not having it.
 *
 * Run with:  npm run test:integrity
 */

import { createIntegrityDetector } from "../src/proctoring/detectors/integrity.js";

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

// ── Fake DOM ───────────────────────────────────────────────────────────────

function element({ tag = "DIV", id = "", className = "", attrs = {}, shadow = null } = {}) {
  return {
    nodeType: 1,
    tagName: tag,
    id,
    className,
    shadowRoot: shadow,
    parentNode: null,
    getAttribute: (name) => attrs[name] ?? null,
    getAttributeNames: () => Object.keys(attrs),
    closest: () => null,
  };
}

let observerCallback = null;
let sweepCallback = null;

// The detector schedules its periodic sweep with setInterval. Capturing the
// callback lets each scenario run exactly one sweep, deterministically, instead
// of waiting four seconds of real time.
globalThis.setInterval = (fn) => {
  sweepCallback = fn;
  return 1;
};
globalThis.clearInterval = () => {
  sweepCallback = null;
};

function resetDom({ children = [], rootElement = null } = {}) {
  const body = {
    children,
    contains: (node) => children.includes(node),
  };
  globalThis.document = {
    body,
    getElementById: (id) => (id === "root" ? rootElement : null),
  };
  children.forEach((child) => {
    child.parentNode = body;
  });
  return body;
}

globalThis.MutationObserver = class {
  constructor(cb) {
    observerCallback = cb;
  }
  observe() {}
  disconnect() {
    observerCallback = null;
  }
};

// The detector asks whether a function still stringifies to `[native code]`.
// Node's own `fetch` is written in JavaScript, so it would read as "patched"
// here even though it is native in every browser — hence borrowing genuinely
// native functions for the unpatched baseline.
const NATIVE = Object.getOwnPropertyDescriptor(Map.prototype, "has").value;
globalThis.XMLHttpRequest = function XMLHttpRequest() {};
globalThis.XMLHttpRequest.prototype.open = Object.getOwnPropertyDescriptor(
  Map.prototype,
  "get"
).value;
globalThis.Element = function Element() {};
globalThis.Element.prototype.attachShadow = Object.getOwnPropertyDescriptor(
  Map.prototype,
  "set"
).value;
globalThis.window = { fetch: NATIVE };

/** Run a detector and collect what it reported, without any timers firing. */
function run({ children = [], rootElement = null, guarded = null, paused = false, extensionIds = [] } = {}) {
  const reports = [];
  resetDom({ children, rootElement });

  const detector = createIntegrityDetector({
    report: (type, details) => reports.push({ type, details }),
    isPaused: () => paused,
    getGuardedElement: () => guarded,
    extensionIds,
  });

  detector.start();
  return { detector, reports, sweep: () => sweepCallback?.() };
}

const EXTENSION_DIV = element({ id: "chrome-extension://abc-sidebar" });
const GRAMMARLY = element({ attrs: { "data-gramm": "true" } });

console.log("\n════ A clean exam page accuses nobody ════\n");

{
  const app = element({ id: "root" });
  const { detector, reports, sweep } = run({ children: [app], rootElement: app });
  sweep();
  detector.stop();
  check("nothing is reported on a clean page", reports.length === 0, JSON.stringify(reports));
}

console.log("\n════ Injected content ════\n");

{
  const { detector, reports } = run({ children: [] });
  observerCallback([{ addedNodes: [EXTENSION_DIV] }]);
  detector.stop();
  check("a node carrying a chrome-extension:// marker is reported", reports.length === 1);
  check("and is described as an injection", /injected/i.test(reports[0]?.details || ""));
}

{
  const { detector, reports } = run({ children: [] });
  observerCallback([{ addedNodes: [GRAMMARLY] }]);
  observerCallback([{ addedNodes: [EXTENSION_DIV] }]);
  detector.stop();
  check("injections are reported once, not per mutation", reports.length === 1);
}

console.log("\n════ Shadow DOM: where current AI sidebars hide ════\n");

{
  // The pattern: a bare div on the body with everything real inside a shadow
  // root. Nothing in its id, class or attributes gives it away.
  const sidebar = element({ id: "aslkdj2", shadow: { mode: "open" } });
  const app = element({ id: "root" });
  const { detector, reports, sweep } = run({ children: [app, sidebar], rootElement: app });
  sweep();
  detector.stop();
  check(
    "a shadow-root panel on the body is caught, despite no markers",
    reports.some((r) => /hidden panel/i.test(r.details))
  );
}

{
  // The application's own root may use shadow DOM without being an extension.
  const app = element({ id: "root", shadow: { mode: "open" } });
  const { detector, reports, sweep } = run({ children: [app], rootElement: app });
  sweep();
  detector.stop();
  check("the app's own root using shadow DOM is NOT reported", reports.length === 0);
}

{
  const app = element({ id: "root" });
  const sidebar = element({ shadow: { mode: "open" } });
  const { detector, reports } = run({ children: [app], rootElement: app });
  // Not a direct child of body — the detector deliberately ignores it.
  observerCallback([{ addedNodes: [sidebar] }]);
  detector.stop();
  check("a shadow host deeper in the page is NOT reported", reports.length === 0);
}

console.log("\n════ Patched page functions ════\n");

{
  const app = element({ id: "root" });
  const { detector, reports } = run({ children: [app], rootElement: app });
  detector.stop();
  check("unpatched natives are not reported", reports.length === 0, JSON.stringify(reports));
}

{
  const original = globalThis.window.fetch;
  globalThis.window.fetch = () => Promise.resolve();
  const app = element({ id: "root" });
  const { detector, reports } = run({ children: [app], rootElement: app });
  detector.stop();
  globalThis.window.fetch = original;
  check("a replaced fetch is reported", reports.some((r) => /replaced.*fetch/i.test(r.details)));
}

{
  const original = globalThis.Element.prototype.attachShadow;
  globalThis.Element.prototype.attachShadow = function () {};
  const app = element({ id: "root" });
  const { detector, reports } = run({ children: [app], rootElement: app });
  detector.stop();
  globalThis.Element.prototype.attachShadow = original;
  check(
    "a replaced attachShadow is reported — how an extension reaches into closed roots",
    reports.some((r) => /attachShadow/i.test(r.details))
  );
}

console.log("\n════ The overlay must stay in the page ════\n");

{
  const app = element({ id: "root" });
  const overlay = element({ id: "overlay" });
  // Overlay is NOT among the body's children: it has been removed.
  const { detector, reports, sweep } = run({ children: [app], rootElement: app, guarded: overlay });
  sweep();
  detector.stop();
  check(
    "removing the security overlay is reported",
    reports.some((r) => /overlay was removed/i.test(r.details))
  );
}

console.log("\n════ Nothing is reported while the exam is paused ════\n");

{
  const { detector, reports } = run({ children: [], paused: true });
  observerCallback([{ addedNodes: [EXTENSION_DIV] }]);
  detector.stop();
  check("a paused exam reports nothing", reports.length === 0);
}

console.log("\n════ Extension probing ════\n");

{
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(url);
    return { ok: url.includes("kbfnbcaeplbcioakkpcpgfkobkghlhen") };
  };

  const app = element({ id: "root" });
  const { detector, reports } = run({
    children: [app],
    rootElement: app,
    extensionIds: [
      "kbfnbcaeplbcioakkpcpgfkobkghlhen", // installed
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // not installed
      "not-a-valid-extension-id", // malformed, must be skipped
    ],
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  detector.stop();
  globalThis.fetch = realFetch;

  check("only well-formed extension ids are probed", asked.length === 2, JSON.stringify(asked));
  check(
    "an installed extension is named in the report",
    reports.some((r) => r.details.includes("kbfnbcaeplbcioakkpcpgfkobkghlhen"))
  );
  check("an absent extension is not reported", reports.length === 1);
}

{
  // The common case under Manifest V3: the request simply fails. That is not
  // evidence of anything and must stay silent.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("net::ERR_FAILED");
  };
  const app = element({ id: "root" });
  const { detector, reports } = run({
    children: [app],
    rootElement: app,
    extensionIds: ["kbfnbcaeplbcioakkpcpgfkobkghlhen"],
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  detector.stop();
  globalThis.fetch = realFetch;
  check("a failed probe is silent, never an accusation", reports.length === 0);
}

console.log("\n──────────────");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
