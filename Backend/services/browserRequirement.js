/**
 * Which browser is this request coming from, and may it sit a proctored exam?
 *
 * Exams outside Safe Exam Browser are limited to Google Chrome and Microsoft
 * Edge (Vikas's decision, 2026-10-03). The reason is a single API:
 * `screen.isExtended`, which is how the exam page knows whether an external
 * monitor is connected. Chrome and Edge have had it since version 100 (March
 * 2022). Firefox and Safari have never shipped it, and Brave deliberately
 * blanks it as anti-fingerprinting. In any of those the honest answer to "is a
 * second monitor attached?" is "cannot tell", and an exam that blocks external
 * monitors cannot start on "cannot tell".
 *
 * Any Chrome or Edge from 100 onward is accepted, with no upper limit, so a new
 * release never needs a change here. Below 100 the browser has no way to report
 * displays at all. Every machine that can run Chrome or Edge can run 100 or
 * newer: the last builds for Windows 7/8.1 (109), macOS 10.13/10.14 (116) and
 * macOS 10.15 (128) are all past it.
 *
 * ── How the browser is identified ──
 *
 * Read from request headers, never from the JSON body:
 *
 *   1. `Sec-CH-UA`, the client-hint brand list. Chrome and Edge 89+ send it on
 *      every request to a secure origin, and it names the real product:
 *      "Google Chrome", "Microsoft Edge", "Brave", "Opera" -- where the
 *      User-Agent string of every one of them says "Chrome".
 *   2. The `User-Agent` string, when no brand list arrived (an http origin, or a
 *      browser too old to send one).
 *
 * Both are self-reported, and this is not attestation -- no website can get
 * that. What makes the rule hold is the pairing with the display check: Firefox
 * dressed up as Chrome still has no `screen.isExtended`, so it reports "cannot
 * tell" and is refused on that instead. See normalizeDisplayReport below.
 */

/** Oldest Chrome / Edge that can report whether a second display is attached. */
const MIN_BROWSER_MAJOR = 100;

/** The browsers an exam may be sat in, by the family names used below. */
const ALLOWED_FAMILIES = ["chrome", "edge"];

const FAMILY_LABELS = {
  chrome: "Google Chrome",
  edge: "Microsoft Edge",
  edge_legacy: "the old Microsoft Edge",
  brave: "Brave",
  opera: "Opera",
  vivaldi: "Vivaldi",
  yandex: "Yandex Browser",
  samsung: "Samsung Internet",
  chromium: "Chromium",
  firefox: "Firefox",
  safari: "Safari",
  ie: "Internet Explorer",
  headless: "an automated browser",
  other: "this browser",
};

/**
 * Parse a `Sec-CH-UA` header into `[{ brand, major }]`.
 *
 *   "Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"
 *
 * The order is shuffled by the browser on purpose, and one brand is always a
 * meaningless "GREASE" entry, so nothing here relies on position.
 */
function parseBrandList(header) {
  const list = [];
  const text = String(header || "");
  const pattern = /"([^"]*)"\s*;\s*v\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const major = parseInt(match[2], 10);
    list.push({ brand: match[1].trim(), major: Number.isFinite(major) ? major : null });
  }
  return list;
}

/** `?1` means mobile. Anything else, including absence, means not. */
function isMobileHint(value) {
  return String(value || "").trim() === "?1";
}

/** Identify from the client-hint brand list. Null when the list told us nothing. */
function fromBrands(brands) {
  if (!brands.length) return null;
  const find = (pattern) => brands.find((entry) => pattern.test(entry.brand));

  // Most specific first. Every Chromium browser also lists "Chromium".
  const checks = [
    ["edge", /^Microsoft Edge$/i],
    ["brave", /^Brave$/i],
    ["opera", /^Opera( GX)?$/i],
    ["yandex", /^YaBrowser$|^Yandex$/i],
    ["vivaldi", /^Vivaldi$/i],
    ["samsung", /^Samsung Internet$/i],
    ["headless", /^HeadlessChrome$/i],
    ["chrome", /^Google Chrome$/i],
  ];
  for (const [family, pattern] of checks) {
    const entry = find(pattern);
    if (entry) return { family, major: entry.major };
  }

  // A Chromium build with no product brand of its own: plain Chromium, or a
  // fork that hides its name. It reports displays exactly as Chrome does, but
  // the rule is Chrome or Edge.
  const chromium = find(/^Chromium$/i);
  if (chromium) return { family: "chromium", major: chromium.major };
  return null;
}

/** Identify from the User-Agent string. Always returns something. */
function fromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  const major = (pattern) => {
    const match = ua.match(pattern);
    return match ? parseInt(match[1], 10) : null;
  };

  // Order matters throughout: nearly every browser here also says "Chrome/"
  // and "Safari/" somewhere in its User-Agent.
  if (/HeadlessChrome\//.test(ua)) return { family: "headless", major: major(/HeadlessChrome\/(\d+)/) };
  if (/Edg(A|iOS)?\/\d/.test(ua)) return { family: "edge", major: major(/Edg(?:A|iOS)?\/(\d+)/) };
  // EdgeHTML, the pre-2020 Edge. Not Chromium, no display API.
  if (/Edge\/\d/.test(ua)) return { family: "edge_legacy", major: major(/Edge\/(\d+)/) };
  if (/OPR\/|Opera/.test(ua)) return { family: "opera", major: major(/OPR\/(\d+)/) };
  if (/YaBrowser\//.test(ua)) return { family: "yandex", major: major(/YaBrowser\/(\d+)/) };
  if (/Vivaldi\//.test(ua)) return { family: "vivaldi", major: major(/Vivaldi\/(\d+)/) };
  if (/SamsungBrowser\//.test(ua)) return { family: "samsung", major: major(/SamsungBrowser\/(\d+)/) };
  if (/Firefox\/|FxiOS\//.test(ua)) return { family: "firefox", major: major(/(?:Firefox|FxiOS)\/(\d+)/) };
  if (/MSIE |Trident\//.test(ua)) return { family: "ie", major: null };
  // Chrome on iPhone and iPad is Safari's engine underneath, without the API.
  if (/CriOS\//.test(ua)) return { family: "chrome", major: major(/CriOS\/(\d+)/), ios: true };
  if (/Chromium\//.test(ua)) return { family: "chromium", major: major(/Chromium\/(\d+)/) };
  if (/Chrome\/\d/.test(ua)) return { family: "chrome", major: major(/Chrome\/(\d+)/) };
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return { family: "safari", major: major(/Version\/(\d+)/) };
  return { family: "other", major: null };
}

/**
 * Work out the browser behind a request.
 *
 * Returns `{ family, label, major, mobile, source }`. `source` says which
 * header decided it, for the record and for support conversations.
 */
function identifyBrowser(headers = {}) {
  const userAgent = headers["user-agent"] || "";
  const brands = parseBrandList(headers["sec-ch-ua"]);
  const viaBrands = fromBrands(brands);
  const viaUa = fromUserAgent(userAgent);

  const picked = viaBrands || viaUa;
  // The brand list carries only the major version; so does everything we need.
  const major = Number.isFinite(picked.major) ? picked.major : null;

  const mobile =
    isMobileHint(headers["sec-ch-ua-mobile"]) ||
    /^"?(Android|iOS)"?$/i.test(String(headers["sec-ch-ua-platform"] || "").trim()) ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    viaUa.ios === true;

  return {
    family: picked.family,
    label: FAMILY_LABELS[picked.family] || FAMILY_LABELS.other,
    major,
    mobile,
    source: viaBrands ? "client_hints" : "user_agent",
  };
}

/**
 * May this browser sit the exam? `{ ok, code, message }`.
 *
 * The message is written for the student: what is wrong and what to do, in
 * one or two sentences, with no jargon.
 */
function checkBrowser(identity, { allowedFamilies = ALLOWED_FAMILIES, minMajor = MIN_BROWSER_MAJOR } = {}) {
  const id = identity || { family: "other", label: FAMILY_LABELS.other, major: null, mobile: false };

  if (id.mobile) {
    return {
      ok: false,
      code: "browser_mobile",
      message:
        "This test needs a laptop or desktop computer. Open it in Google Chrome or Microsoft Edge on a computer.",
    };
  }

  if (!allowedFamilies.includes(id.family)) {
    const hint =
      id.family === "edge_legacy"
        ? " Update to the new Microsoft Edge from microsoft.com/edge, or use Google Chrome."
        : " Open this test in Google Chrome or Microsoft Edge instead.";
    return {
      ok: false,
      code: "browser_unsupported",
      message: `This test can only be taken in Google Chrome or Microsoft Edge, and you are using ${id.label}.${hint}`,
    };
  }

  // A browser we recognise but whose version we could not read is let through
  // here: the version only matters because of the display API, and the display
  // check refuses a browser that lacks it anyway.
  if (Number.isFinite(id.major) && id.major < minMajor) {
    return {
      ok: false,
      code: "browser_outdated",
      message:
        `Your ${id.label} is version ${id.major}, which is too old to run this test's monitor check. ` +
        `Update ${id.label} to the latest version (any version from ${minMajor} works) and open the test again.`,
    };
  }

  return { ok: true, code: "browser_ok", message: "" };
}

// ───────────────────────── Displays ─────────────────────────

/**
 * Turn what the exam page reported about the screens into one of three states.
 *
 *   single      exactly one display, and the browser was able to say so
 *   multiple    an external monitor is extending the desktop
 *   unverified  the browser could not answer, or the answer was blocked
 *
 * Only `single` lets an exam start. "Could not answer" is refused on purpose:
 * it is what Firefox, Safari and Brave say, and it is also what any page reports
 * once something has stripped the API or blocked it with a permissions policy.
 *
 * The report shape, from Frontend/src/proctoring/environment.js:
 *   { isExtended: true | false | null, policyAllowed: true | false | null }
 *
 * `policyAllowed: false` matters because the specification makes `isExtended`
 * return a plain `false` -- "one screen" -- when the page is not allowed to use
 * the window-management feature. A false that comes from a blocked feature is
 * not evidence of anything.
 */
function normalizeDisplayReport(report) {
  if (!report || typeof report !== "object") return "unverified";
  if (report.policyAllowed === false) return "unverified";
  if (report.isExtended === true) return "multiple";
  if (report.isExtended === false) return "single";
  return "unverified";
}

/** What the student is told when the display state stops the exam. */
const DISPLAY_MESSAGES = {
  multiple:
    "An external monitor is connected. Disconnect it (or switch it off in your display settings) to start the test. Chargers, mice and keyboards are fine.",
  unverified:
    "This browser could not confirm how many screens are connected. Use an up-to-date Google Chrome or Microsoft Edge, without extensions that change site permissions, and open the test again.",
};

module.exports = {
  MIN_BROWSER_MAJOR,
  ALLOWED_FAMILIES,
  FAMILY_LABELS,
  parseBrandList,
  identifyBrowser,
  checkBrowser,
  normalizeDisplayReport,
  DISPLAY_MESSAGES,
};
