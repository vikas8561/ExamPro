/**
 * Safe Exam Browser verification — the security properties, checked directly.
 *
 * Pure unit checks: no server, no database. Everything here is about the two
 * things that make SEB support worth having, and both are easy to break with a
 * change that looks harmless:
 *
 *   1. A key hash is only valid for the exact exam URL it was produced for.
 *      That is what stops one student reading their hash and the rest of the
 *      class replaying it, and it only holds because each attempt gets its own
 *      nonce in the URL.
 *
 *   2. Malformed input is rejected rather than thrown on. `timingSafeEqual`
 *      raises on mismatched buffer lengths, so a student sending a six-character
 *      hash must get a plain "no" and not a 500.
 */

const seb = require("../../services/sebVerify");
const policy = require("../../services/proctorPolicy");
const { buildSebConfig, computeConfigKey, toSebJson, buildSebSettings } = require("../../services/sebConfig");

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

const EXAM_URL = "https://exam.example.com/student/take-test/6500000000000000000000aa?n=deadbeefcafe";
const WINDOWS_KEY = "a".repeat(64);
const MACOS_KEY = "b".repeat(64);
const KEYS = [
  { label: "Windows 3.10.2", key: WINDOWS_KEY },
  { label: "macOS 3.7.1", key: MACOS_KEY },
];

const hashFor = (url, key) => seb.computeExpectedHash(url, key);

// ── Key verification ──────────────────────────────────────────────────────

const valid = hashFor(EXAM_URL, WINDOWS_KEY);

check(
  "a hash from the configured key verifies",
  seb.verifyKeyHash({ examUrl: EXAM_URL, candidateHash: valid, keys: KEYS }).ok === true
);

check(
  "the matching key is named, so a report can say which build was used",
  seb.verifyKeyHash({ examUrl: EXAM_URL, candidateHash: valid, keys: KEYS })
    .matchedLabel === "Windows 3.10.2"
);

check(
  "a key later in the list matches too (Windows and macOS differ)",
  seb.verifyKeyHash({
    examUrl: EXAM_URL,
    candidateHash: hashFor(EXAM_URL, MACOS_KEY),
    keys: KEYS,
  }).ok === true
);

check(
  "hex case does not matter",
  seb.verifyKeyHash({
    examUrl: EXAM_URL,
    candidateHash: valid.toUpperCase(),
    keys: KEYS,
  }).ok === true
);

// The replay defence. Another student's attempt has a different nonce, so the
// same SEB build on the same machine produces a different hash there.
check(
  "a hash harvested for one attempt does not verify against another",
  seb.verifyKeyHash({
    examUrl: EXAM_URL.replace("deadbeefcafe", "0000000different"),
    candidateHash: valid,
    keys: KEYS,
  }).ok === false
);

check(
  "a hash from an unconfigured key is rejected",
  seb.verifyKeyHash({
    examUrl: EXAM_URL,
    candidateHash: hashFor(EXAM_URL, "c".repeat(64)),
    keys: KEYS,
  }).ok === false
);

check(
  "verification fails closed when no keys are configured",
  seb.verifyKeyHash({ examUrl: EXAM_URL, candidateHash: valid, keys: [] }).reason ===
    "no_keys_configured"
);

check(
  "verification fails closed when the attempt has no stored exam URL",
  seb.verifyKeyHash({ examUrl: "", candidateHash: valid, keys: KEYS }).reason ===
    "no_exam_url"
);

// ── Malformed input must not throw ────────────────────────────────────────

for (const [label, candidate] of [
  ["too short", "abc"],
  ["too long", "a".repeat(65)],
  ["not hex", "z".repeat(64)],
  ["null", null],
  ["a number", 12345],
  ["an object", { toString: () => valid }],
]) {
  let threw = false;
  let result = null;
  try {
    result = seb.verifyKeyHash({ examUrl: EXAM_URL, candidateHash: candidate, keys: KEYS });
  } catch (error) {
    threw = true;
  }
  check(`malformed hash (${label}) is refused without throwing`, !threw && result?.ok === false);
}

// ── Launch tokens ─────────────────────────────────────────────────────────

const SECRET = "s".repeat(64);
const token = seb.signLaunchToken({
  userId: "650000000000000000000001",
  assignmentId: "650000000000000000000002",
  nonce: "deadbeefcafe",
  secret: SECRET,
});

check("a launch token round-trips", seb.verifyLaunchToken({ token, secret: SECRET })?.nonce === "deadbeefcafe");
check(
  "it names the student, so a forwarded link opens nothing",
  seb.verifyLaunchToken({ token, secret: SECRET })?.userId === "650000000000000000000001"
);
check("a tampered signature is rejected", seb.verifyLaunchToken({ token: `${token.slice(0, -2)}xy`, secret: SECRET }) === null);
check("a tampered payload is rejected", seb.verifyLaunchToken({ token: `x${token.slice(1)}`, secret: SECRET }) === null);
check("a token signed with another secret is rejected", seb.verifyLaunchToken({ token, secret: "t".repeat(64) }) === null);
check("garbage is rejected", seb.verifyLaunchToken({ token: "nonsense", secret: SECRET }) === null);
check("an empty token is rejected", seb.verifyLaunchToken({ token: "", secret: SECRET }) === null);

const expired = seb.signLaunchToken({
  userId: "u",
  assignmentId: "a",
  nonce: "n",
  secret: SECRET,
});
// Re-sign with an expiry in the past by reaching through the same encoding.
const [payload] = expired.split(".");
const stale = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
stale.e = Date.now() - 1000;
const stalePayload = Buffer.from(JSON.stringify(stale))
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const staleSig = require("crypto")
  .createHmac("sha256", SECRET)
  .update(stalePayload)
  .digest("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
check(
  "a correctly signed but expired token is rejected",
  seb.verifyLaunchToken({ token: `${stalePayload}.${staleSig}`, secret: SECRET }) === null
);

// ── Versions ──────────────────────────────────────────────────────────────

check("3.10.2 satisfies a 3.10.0 minimum", seb.isVersionAtLeast("3.10.2", "3.10.0") === true);
check("3.9.0 does NOT satisfy 3.10.0 (numeric, not string, comparison)", seb.isVersionAtLeast("3.9.0", "3.10.0") === false);
check("an exact match satisfies the minimum", seb.isVersionAtLeast("3.6.0", "3.6.0") === true);
check("a missing version does not satisfy anything", seb.isVersionAtLeast("", "3.6.0") === false);

// ── Platform ──────────────────────────────────────────────────────────────

const AGENTS = {
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 SEB/3.10.2",
  macos: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0",
  ios: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
};
for (const [expected, agent] of Object.entries(AGENTS)) {
  check(`user agent is read as ${expected}`, seb.detectOsFromUserAgent(agent) === expected);
}
check("an unrecognised user agent is 'unknown', never a guess", seb.detectOsFromUserAgent("curl/8") === "unknown");
check("SEB is available on Windows", seb.sebAvailableForOs("windows") === true);
check("SEB is available on macOS", seb.sebAvailableForOs("macos") === true);
check("SEB is NOT available on Linux — there has never been a build", seb.sebAvailableForOs("linux") === false);

// ── Freshness: the check that makes SEB enforceable at all ────────────────

const now = Date.now();
check("a proof from just now is fresh", policy.isSebProofFresh({ verified: true, verifiedAt: new Date(now) }, now) === true);
check(
  "a proof from inside the grace window is fresh",
  policy.isSebProofFresh({ verified: true, verifiedAt: new Date(now - policy.SEB_GRACE_MS + 1000) }, now) === true
);
check(
  "a proof older than the grace window is stale — this is what stops the copy-the-token bypass",
  policy.isSebProofFresh({ verified: true, verifiedAt: new Date(now - policy.SEB_GRACE_MS - 1000) }, now) === false
);
check("an unverified session is never fresh", policy.isSebProofFresh({ verified: false, verifiedAt: new Date(now) }, now) === false);
check("a session that never verified is never fresh", policy.isSebProofFresh({ verified: true, verifiedAt: null }, now) === false);
check("a missing seb block is never fresh", policy.isSebProofFresh(null, now) === false);

// ── Policy adjustments under SEB ──────────────────────────────────────────

const base = policy.getPolicyForTest({ type: "mcq", allowedTabSwitches: 3 });
const underSeb = policy.applySebPolicy(base, { required: true, verified: true });
const notUnderSeb = policy.applySebPolicy(base, { required: true, verified: false, fallbackReason: "os_unsupported" });

check("SEB drops screen sharing, which it cannot do on any platform", underSeb.requiredPermissions.length === 0);
check("SEB drops the Fullscreen API requirement, since kiosk mode is not fullscreen", underSeb.requireFullscreen === false);
check("SEB drops second-monitor detection, which it enforces natively", underSeb.detectSecondMonitor === false);
check("SEB keeps the keyboard allowlist — only the page knows an answer field", underSeb.blockKeyboard === true);
check("SEB keeps clipboard blocking", underSeb.blockClipboard === true);
check("SEB keeps tamper detection", underSeb.detectTampering === true);
check("the violation allowance is untouched by SEB", underSeb.allowedViolations === 3);
check("the Linux fallback keeps every browser-based rule", notUnderSeb.requiredPermissions.includes("screen"));
check("the Linux fallback keeps fullscreen", notUnderSeb.requireFullscreen === true);
check("the fallback reason reaches the browser", notUnderSeb.seb.fallbackReason === "os_unsupported");

// ── Submission status ─────────────────────────────────────────────────────

check("SEB off is recorded as not_required", policy.sebSubmissionStatus({ required: false }).proctorSebStatus === "not_required");
check("a verified attempt is recorded as verified", policy.sebSubmissionStatus({ required: true, verified: true }).proctorSebStatus === "verified");
check(
  "a Linux attempt is recorded as a fallback, with the reason",
  policy.sebSubmissionStatus({ required: true, verified: false, fallbackReason: "os_unsupported" })
    .proctorSebFallbackReason === "os_unsupported"
);
check(
  "a required-but-unverified attempt is recorded, not silently passed",
  policy.sebSubmissionStatus({ required: true, verified: false }).proctorSebStatus === "fallback"
);

// ── The weight-0 rule ─────────────────────────────────────────────────────

check("seb_integrity_lost is a known violation type", policy.isKnownViolationType("seb_integrity_lost") === true);
check(
  "seb_integrity_lost costs nothing — a transient blank must never end an exam",
  policy.weightOf({ violationWeights: policy.VIOLATION_WEIGHTS }, "seb_integrity_lost") === 0
);

// ── The config file ───────────────────────────────────────────────────────
//
// A malformed plist does not produce an error a student can act on — SEB simply
// refuses to start, and nobody can tell them why. The XML shape is therefore
// worth asserting directly.

const ORIGINS = { appOrigin: "https://exam.test", apiOrigin: "https://api.exam.test" };
const config = buildSebConfig(ORIGINS);

check("the config declares itself a plist", config.includes("<plist version=\"1.0\">"));
check("it is well-formed to the closing tag", config.trimEnd().endsWith("</plist>"));
check(
  "no unescaped ampersand survives anywhere",
  !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(
    buildSebConfig({ appOrigin: "https://exam.test?a=1&b=2", apiOrigin: "https://api.exam.test" })
  )
);

// The reason this file must not vary. SEB derives the Browser Exam Key from its
// configuration, so if anything student-specific leaked in here, every student
// would produce a different key and no key an admin pasted could ever match.
const configAgain = buildSebConfig(ORIGINS);
check("the config is byte-identical between builds", config === configAgain);
check(
  "the start URL is the assignments list, not a per-student address",
  config.includes("<string>https://exam.test/student/assignments</string>")
);
check("no attempt id has leaked into the config", !/[0-9a-f]{24}/.test(config));
check("no nonce has leaked into the config", !config.includes("?n="));
check("every opened dict is closed", (config.match(/<dict>/g) || []).length === (config.match(/<\/dict>/g) || []).length);
check("every opened array is closed", (config.match(/<array>/g) || []).length === (config.match(/<\/array>/g) || []).length);
check("every opened string is closed", (config.match(/<string>/g) || []).length === (config.match(/<\/string>/g) || []).length);

check("SEB is told to send its exam key — without this nothing can be verified", config.includes("<key>sendBrowserExamKey</key>\n  <true/>"));
check("a start URL is set", config.includes("<key>startURL</key>"));
check("a quit URL is set, so a student is not trapped after submitting", config.includes("<string>https://exam.test/student/seb-exit</string>"));
check("quitting is allowed", config.includes("<key>allowQuit</key>\n  <true/>"));
check("only one display is permitted", config.includes("<key>allowedDisplaysMaxNumber</key>\n  <integer>1</integer>"));
check("virtual machines are refused", config.includes("<key>allowVirtualMachine</key>\n  <false/>"));
check("screen sharing and remote sessions are refused", config.includes("<key>allowScreenSharing</key>\n  <false/>"));
check("reloading stays allowed, because the resume path depends on it", config.includes("<key>browserWindowAllowReload</key>\n  <true/>"));
check("the URL filter is on", config.includes("<key>URLFilterEnable</key>\n  <true/>"));
// Scheme-less, which is the documented format. Including "https://" makes the
// rule match nothing — and because SEB auto-allows the start URL's own domain,
// the only visible symptom is students unable to reach the API to log in.
check("the app origin is allowed through", config.includes("<string>exam.test/*</string>"));
check("the API origin is allowed through", config.includes("<string>api.exam.test/*</string>"));
check("filter expressions carry no scheme", !/<string>https?:\/\/[^<]*\/\*<\/string>/.test(config));
check("remote desktop tools are named as prohibited", config.includes("teamviewer.exe"));

// The file is plain XML and the student can read it, so anything secret in here
// would not be secret.
check("the config holds no quit password", !config.includes("hashedQuitPassword"));
check("the config holds no admin password", !config.includes("hashedAdminPassword"));
check(
  "the config holds no Browser Exam Key",
  !config.toLowerCase().includes("browserexamkey</key>") || !config.includes(WINDOWS_KEY)
);

// ── The Config Key ────────────────────────────────────────────────────────
//
// This is what replaced the Browser Exam Key, and the reason SEB support needs
// no manual setup at all: SEB derives the Config Key from the settings in the
// file it loaded, and this server writes that file, so it can derive the same
// value. Get the canonical serialisation wrong by one character and every
// student fails verification, so the rules are asserted individually.

const json = toSebJson(buildSebSettings(ORIGINS));

check("no whitespace anywhere in the canonical JSON", !/\s/.test(json.replace(/"[^"]*"/g, '""')));
check("it is a JSON object", json.startsWith("{") && json.endsWith("}"));
check("booleans are bare true/false, not quoted", json.includes('"allowQuit":true'));
check("integers are bare numbers, not quoted", json.includes('"allowedDisplaysMaxNumber":1'));
check("strings are quoted", json.includes('"startURL":"https://exam.test/student/assignments"'));

// Case-insensitive alphabetical ordering, the rule easiest to get wrong. Under a
// case-SENSITIVE sort every capitalised key would sort before every lowercase
// one and the hash would differ.
// This config contains no characters that need escaping, so it happens to be
// valid JSON and the key order can be read back directly.
const topLevel = Object.keys(JSON.parse(json));
const sorted = [...topLevel].sort((a, b) =>
  a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0
);
check("top-level keys are sorted case-insensitively", JSON.stringify(topLevel) === JSON.stringify(sorted));
check(
  "which is not the same as a case-sensitive sort",
  JSON.stringify(topLevel) !== JSON.stringify([...topLevel].sort())
);
check("nested dictionary keys are sorted too", json.includes('{"action":1,"active":true,"expression":'));
check("array order is preserved, not sorted", json.indexOf("teamviewer.exe") < json.indexOf("anydesk.exe"));

// Escaping. SEB's own worked example carries raw backslashes inside strings, so
// JSON.stringify would produce a different hash.
const escaped = toSebJson({ a: "x\\y" });
check("backslashes are left unescaped, per the specification", escaped === '{"a":"x\\y"}');
check("which differs from JSON.stringify", escaped !== JSON.stringify({ a: "x\\y" }));

check("originatorVersion is removed", !toSebJson({ originatorVersion: "1", a: 1 }).includes("originatorVersion"));
check("empty dictionaries are removed", toSebJson({ a: {}, b: 1 }) === '{"b":1}');
check("empty arrays are kept", toSebJson({ a: [] }) === '{"a":[]}');

const configKey = computeConfigKey(ORIGINS);
check("the Config Key is a 64-character hex hash", /^[0-9a-f]{64}$/.test(configKey));
check("it is deterministic", configKey === computeConfigKey(ORIGINS));
check(
  "it changes when the configuration changes",
  configKey !== computeConfigKey({ ...ORIGINS, appOrigin: "https://other.test" })
);

// End to end: what SEB reports, and what the server checks it against.
const sebWouldReport = seb.computeExpectedHash(EXAM_URL, configKey);
check(
  "a hash built from the server-computed Config Key verifies",
  seb.verifyKeyHash({
    examUrl: EXAM_URL,
    candidateHash: sebWouldReport,
    keys: [{ label: "Config Key", key: configKey }],
  }).ok === true
);
check(
  "and does not verify against another attempt's URL",
  seb.verifyKeyHash({
    examUrl: EXAM_URL.replace("deadbeefcafe", "0000000different"),
    candidateHash: sebWouldReport,
    keys: [{ label: "Config Key", key: configKey }],
  }).ok === false
);

// ── Trying to sit the exam in an ordinary browser ─────────────────────────
//
// The real guard, not a copy of it: this is the function every protected route
// consults, so these assertions are the enforcement itself.

const { sebFailureReason } = require("../../middleware/proctorSession");

const SEB_FRESH = { required: true, verified: true, verifiedAt: new Date() };
const SEB_GONE_QUIET = {
  required: true,
  verified: true,
  verifiedAt: new Date(Date.now() - policy.SEB_GRACE_MS - 5000),
};
const SEB_NEVER_USED = { required: true, verified: false, verifiedAt: null };
const SEB_LINUX = { required: true, verified: false, fallbackReason: "os_unsupported" };

const verdict = (sebState, options) => sebFailureReason({ seb: sebState }, options);

check("SEB switched off: nothing is refused", verdict({ required: false }) === null);
check("no seb block at all (old session): nothing is refused", verdict(undefined) === null);
check("verified and checking in: allowed", verdict(SEB_FRESH) === null);
check(
  "opened the exam in Chrome instead: refused as seb_required",
  verdict(SEB_NEVER_USED) === "seb_required"
);
check(
  "started in SEB then went quiet: refused as seb_stale",
  verdict(SEB_GONE_QUIET) === "seb_stale"
);
check("Linux fallback: allowed, and recorded on the submission", verdict(SEB_LINUX) === null);

// The submit exemption, which only the submission route passes. A student whose
// SEB crashed must never lose a paper they wrote legitimately inside it.
check("a crashed SEB can still hand the paper in", verdict(SEB_GONE_QUIET, { allowStale: true }) === null);
check(
  "but someone who never opened SEB still cannot submit",
  verdict(SEB_NEVER_USED, { allowStale: true }) === "seb_required"
);
check(
  "and the exemption does not leak to answer-saving or question-fetching",
  verdict(SEB_GONE_QUIET, { allowStale: false }) === "seb_stale"
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
