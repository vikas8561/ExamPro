const crypto = require("crypto");

/**
 * The Safe Exam Browser configuration, and the Config Key derived from it.
 *
 * Both come from one object. That is the whole design: the settings are defined
 * once as plain data, serialised one way into the .seb file a student's SEB
 * loads, and another way into the canonical string whose hash is the Config Key.
 * Nothing parses XML back again, so the file and the key cannot drift apart.
 *
 * ## Why the Config Key rather than the Browser Exam Key
 *
 * Both prove a request came from SEB. The Browser Exam Key hashes SEB's own
 * program code as well as its settings, so it differs between the Windows and
 * macOS builds and changes with every SEB release — and it can only be read out
 * of SEB's Configuration Tool by hand, on each platform. That is a machine you
 * must own, and a chore repeated at every version bump.
 *
 * The Config Key hashes the configuration alone. It is identical on every
 * platform and every SEB version, and because this server writes the config, it
 * can compute the key itself. No copy-paste, nothing to re-do.
 *
 * ## The rule that makes this possible
 *
 * From SEB's specification: *"The SEB client only uses setting key/values to
 * calculate the checksum, which are actually contained in an opened config
 * file."* SEB does not merge in its several hundred defaults first. So the key
 * covers exactly the settings written below, which is why this can be computed
 * without reimplementing SEB's entire default set.
 *
 * ## The config must not vary per student
 *
 * Every student loads the same file. Anything student-specific here would change
 * the Config Key per student and no single key could verify them all. The
 * per-attempt nonce therefore lives in the exam page's URL, which SEB hashes
 * separately at page load and which has nothing to do with this file.
 */

/**
 * The settings themselves.
 *
 * `startURL` is the assignments list, never a per-student address — see above.
 */
function buildSebSettings({ appOrigin, apiOrigin, urlFilter = true }) {
  return {
    startURL: `${appOrigin}/student/assignments`,

    // Without this SEB sends no keys and nothing can ever be verified.
    sendBrowserExamKey: true,

    // "Prefer Modern" — and this one line is load-bearing on macOS.
    //
    // SEB for macOS has two browser engines. The classic WebView can put the keys
    // in HTTP headers but has **no JavaScript API**; the modern WebView (WKWebView)
    // is the reverse — no headers, but the API this whole integration depends on.
    // And for backward compatibility, `sendBrowserExamKey: true` above makes SEB
    // pick the *classic* one unless told otherwise.
    //
    // The result, if this is omitted: `window.SafeExamBrowser` simply does not
    // exist. The exam page concludes it is not running under SEB, shows the
    // "launch Safe Exam Browser" screen to a student who is already inside Safe
    // Exam Browser, and loops there with nothing in any log to explain why.
    browserWindowWebView: 3,

    // Arriving here makes SEB close and hand the machine back, so a student who
    // has submitted is not left in a locked kiosk.
    quitURL: `${appOrigin}/student/seb-exit`,
    allowQuit: true,

    allowedDisplaysMaxNumber: 1,
    allowVirtualMachine: false,
    allowScreenSharing: false,

    // The resume path depends on a reload working.
    browserWindowAllowReload: true,
    allowSpellCheck: false,
    enableZoomPage: false,
    allowDownUploads: false,
    enableLogging: false,

    URLFilterEnable: urlFilter,
    // Must stay false. Enabling the content filter forces SEB back to the classic
    // WebView regardless of `browserWindowWebView` above, which takes the
    // JavaScript API away again and breaks verification on macOS.
    URLFilterEnableContentFilter: false,
    URLFilterRules: urlFilter
      ? [filterRule(`${hostPattern(appOrigin)}/*`), filterRule(`${hostPattern(apiOrigin)}/*`)]
      : [],

    prohibitedProcesses: PROHIBITED_PROCESSES.map(([executable, description, os]) => ({
      active: true,
      currentUser: true,
      strongKill: true,
      os,
      executable,
      description,
    })),
  };
}

/** One entry in SEB's URL filter. `action` is 1 to allow, 0 to block. */
function filterRule(expression, action = 1) {
  return { action, active: true, expression, regex: false };
}

/**
 * A URL filter expression matches host and path, **without the scheme**.
 *
 * SEB's own worked example is `safeexambrowser.org/exams`, not
 * `https://safeexambrowser.org/exams`, and including the scheme stops the rule
 * matching anything. That failure is quiet and misleading: SEB auto-allows the
 * start URL's own domain, so the exam page loads normally and only calls to the
 * API host are blocked — which presents as the student being unable to log in,
 * with no indication that a filter is responsible.
 */
function hostPattern(origin) {
  return String(origin).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Remote-control, screen-sharing and messaging tools — the realistic way an
 * off-site helper would see the paper or drive the machine.
 *
 * SEB blocks a default set of its own; naming these covers the ones students
 * actually have installed. `os` is 0 for macOS, 1 for Windows.
 */
const PROHIBITED_PROCESSES = [
  ["teamviewer.exe", "Remote desktop", 1],
  ["anydesk.exe", "Remote desktop", 1],
  ["rustdesk.exe", "Remote desktop", 1],
  ["quickassist.exe", "Remote assistance", 1],
  ["obs64.exe", "Screen recording", 1],
  ["discord.exe", "Messaging", 1],
  ["TeamViewer", "Remote desktop", 0],
  ["AnyDesk", "Remote desktop", 0],
  ["OBS", "Screen recording", 0],
  ["Discord", "Messaging", 0],
];

// --- The .seb file -------------------------------------------------------

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Serialise one value as a plist XML element. */
function toPlistValue(value, indent) {
  const pad = "  ".repeat(indent);

  if (typeof value === "boolean") return `${pad}<${value}/>`;
  if (typeof value === "number") return `${pad}<integer>${value}</integer>`;
  if (typeof value === "string") return `${pad}<string>${escapeXml(value)}</string>`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<array/>`;
    const items = value.map((item) => toPlistValue(item, indent + 1)).join("\n");
    return `${pad}<array>\n${items}\n${pad}</array>`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return `${pad}<dict/>`;
  const body = entries
    .map(
      ([key, item]) =>
        `${pad}  <key>${escapeXml(key)}</key>\n${toPlistValue(item, indent + 1)}`
    )
    .join("\n");
  return `${pad}<dict>\n${body}\n${pad}</dict>`;
}

/** The .seb file: a plain, unencrypted Apple property list. */
function buildSebConfig(options) {
  const settings = buildSebSettings(options);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${toPlistValue(settings, 0)}
</plist>
`;
}

// --- The Config Key ------------------------------------------------------

/**
 * SEB's canonical "SEB-JSON" serialisation.
 *
 * Ordinary JSON with three rules taken from SEB's specification, each of which
 * changes the hash if it is got wrong:
 *
 *   - Dictionary keys are sorted alphabetically, compared case-insensitively.
 *     Array order is left alone.
 *   - No whitespace or line formatting anywhere.
 *   - **No character escaping.** This is the one that would catch a reader out:
 *     the specification's own worked example contains raw backslashes inside
 *     strings, unescaped. `JSON.stringify` would escape them and produce a
 *     different hash, which is why the string is assembled by hand here.
 *
 * `originatorVersion` is removed, and so are empty dictionaries.
 */
function toSebJson(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${value}"`;

  if (Array.isArray(value)) {
    return `[${value.map(toSebJson).join(",")}]`;
  }

  const keys = Object.keys(value)
    .filter((key) => key !== "originatorVersion")
    .filter((key) => {
      const item = value[key];
      const isEmptyDict =
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        Object.keys(item).length === 0;
      return !isEmptyDict;
    })
    .sort((a, b) => {
      const left = a.toLowerCase();
      const right = b.toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });

  return `{${keys.map((key) => `"${key}":${toSebJson(value[key])}`).join(",")}}`;
}

/**
 * The Config Key for this configuration: the Base16 SHA-256 of its SEB-JSON.
 *
 * SEB computes the same value from the file it loaded, then reports
 * `SHA256(page URL + Config Key)` through its JavaScript API. Verification
 * recomputes that and compares — see services/sebVerify.js.
 */
function computeConfigKey(options) {
  const json = toSebJson(buildSebSettings(options));
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * The one place the config options are assembled.
 *
 * Every caller goes through this — the file students download, the file the
 * admin downloads, and the Config Key the server verifies against. If any of
 * them built its options differently, the key would stop matching the file and
 * nobody could be verified.
 */
function optionsFor(req, sebConfig) {
  return {
    appOrigin: (process.env.FRONTEND_URL || "").replace(/\/+$/, ""),
    apiOrigin: `${req.protocol}://${req.get("host")}`,
    urlFilter: sebConfig?.urlFilter !== false,
  };
}

module.exports = {
  optionsFor,
  buildSebSettings,
  buildSebConfig,
  computeConfigKey,
  toSebJson,
  escapeXml,
  PROHIBITED_PROCESSES,
};
