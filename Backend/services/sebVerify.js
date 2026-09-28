const crypto = require("crypto");

/**
 * Proving that a request really came from Safe Exam Browser.
 *
 * SEB used to attach `X-SafeExamBrowser-RequestHash` to every request, and an
 * exam server checked that header. That stopped being reliable around 2020:
 * neither WebKit nor Chromium lets SEB inject request headers on cross-origin
 * or AJAX requests any more, and this app's frontend and API are separate
 * origins, so the header would never arrive. The supported replacement is SEB's
 * JavaScript API, which exposes the same values to the page:
 *
 *     window.SafeExamBrowser.version
 *     window.SafeExamBrowser.security.browserExamKey
 *     window.SafeExamBrowser.security.configKey
 *
 * The important and easily-missed detail is that `browserExamKey` is **not** the
 * key. It is already `SHA256(current page URL + key)`, hex encoded — byte for
 * byte what the old header carried. So verification means recomputing that hash
 * server-side and comparing.
 *
 * Which URL is the whole ballgame. The hash is a fixed value for a given page
 * URL and SEB build, so if every student's exam lived at the same URL, one
 * student could read the hash once and the rest of the class could replay it
 * from an ordinary browser forever. That is why each attempt gets its own
 * single-use nonce in the exam URL, and why nothing here ever hashes a URL the
 * client supplied — only the exact string the server stored when it generated
 * that attempt's config file.
 */

const HASH_HEX_LENGTH = 64; // SHA256, hex encoded.

/** `SHA256(url + key)`, matching what SEB computes for the page it is showing. */
function computeExpectedHash(examUrl, key) {
  return crypto.createHash("sha256").update(`${examUrl}${key}`, "utf8").digest("hex");
}

function isHexHash(value) {
  return (
    typeof value === "string" &&
    value.length === HASH_HEX_LENGTH &&
    /^[0-9a-f]+$/i.test(value)
  );
}

/**
 * Compare two equal-length hex hashes without leaking the answer through timing.
 *
 * `timingSafeEqual` throws on mismatched buffer lengths, which is why the caller
 * validates the shape first — a malformed hash must be a plain `false`, not a
 * 500.
 */
function hashesMatch(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Does `candidateHash` prove this request came from SEB running the expected
 * configuration?
 *
 * `keys` is a list so that more than one may be accepted. In practice it holds
 * the server-computed Config Key — one value, identical on every platform and
 * every SEB version — but the shape also allows a Browser Exam Key to be added
 * alongside it without changing this code. Every key is tested even after a
 * match, so the time taken does not reveal which one it was.
 */
function verifyKeyHash({ examUrl, candidateHash, keys }) {
  if (!examUrl || typeof examUrl !== "string") {
    return { ok: false, reason: "no_exam_url", matchedLabel: null };
  }
  if (!isHexHash(candidateHash)) {
    return { ok: false, reason: "malformed_hash", matchedLabel: null };
  }
  if (!Array.isArray(keys) || keys.length === 0) {
    return { ok: false, reason: "no_keys_configured", matchedLabel: null };
  }

  const normalized = candidateHash.toLowerCase();
  let matchedLabel = null;

  for (const entry of keys) {
    if (!entry || typeof entry.key !== "string" || !entry.key) continue;
    const expected = computeExpectedHash(examUrl, entry.key);
    if (hashesMatch(normalized, expected) && matchedLabel === null) {
      matchedLabel = entry.label || "unlabelled";
    }
  }

  return matchedLabel === null
    ? { ok: false, reason: "no_key_matched", matchedLabel: null }
    : { ok: true, reason: "verified", matchedLabel };
}

/**
 * Is the client's SEB new enough?
 *
 * Advisory only. The version is self-reported and the key match is what actually
 * proves anything — this exists so a student on an old build gets "update SEB"
 * rather than an unexplained failure.
 */
function isVersionAtLeast(reported, minimum) {
  const parse = (value) =>
    String(value || "")
      .trim()
      .split(/[^0-9]+/)
      .filter((part) => part !== "")
      .map((part) => Number(part));

  const actual = parse(reported);
  const required = parse(minimum);
  if (actual.length === 0) return false;

  for (let i = 0; i < required.length; i += 1) {
    const a = actual[i] || 0;
    const r = required[i] || 0;
    if (a > r) return true;
    if (a < r) return false;
  }
  return true;
}

// --- Launch tokens -------------------------------------------------------

/**
 * SEB fetches the .seb config file as a plain download, with no Authorization
 * header, so that endpoint cannot sit behind `authenticateToken`. A signed
 * token in the query string stands in for it.
 *
 * The token is bound to one student and one assignment, so a link shared with a
 * classmate opens nothing. It is deliberately *not* single-use: SEB refetches
 * the config whenever it relaunches, and a one-shot token would strand a
 * student whose machine restarted mid-exam.
 */
const LAUNCH_TOKEN_TTL_MS = 15 * 60 * 1000;

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signLaunchToken({ userId, assignmentId, nonce, secret }) {
  const payload = base64url(
    JSON.stringify({
      u: String(userId),
      a: String(assignmentId),
      n: String(nonce),
      e: Date.now() + LAUNCH_TOKEN_TTL_MS,
    })
  );
  const signature = base64url(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );
  return `${payload}.${signature}`;
}

function verifyLaunchToken({ token, secret }) {
  if (typeof token !== "string" || token.length > 2048) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = base64url(
    crypto.createHmac("sha256", secret).update(payload).digest()
  );

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return null;
  if (!crypto.timingSafeEqual(given, want)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }

  if (!claims || typeof claims.e !== "number" || Date.now() > claims.e) return null;

  return { userId: claims.u, assignmentId: claims.a, nonce: claims.n };
}

/** Per-attempt value that makes one student's key hash useless to anyone else. */
function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

// --- Platform ------------------------------------------------------------

/**
 * Which operating system is this request coming from?
 *
 * Read from the User-Agent header rather than from anything the page sends in
 * its JSON body, because the answer decides whether a student is allowed to skip
 * SEB entirely. Be clear about what this is worth: a User-Agent is still
 * self-reported and a determined student can change it. Server-side is simply
 * harder to fake than a field in a request body, and it is the best a web
 * application can do — there is no OS attestation available to a website.
 *
 * The consequence of a student faking Linux here is that they get the ordinary
 * browser-based proctoring, which is exactly what every student had before SEB
 * support existed. It is not an escalation, and the fallback is recorded on the
 * submission so a reviewer can see it.
 */
function detectOsFromUserAgent(userAgent) {
  const ua = String(userAgent || "");

  // Order matters: iPadOS and Android both carry "Linux" in their user agent.
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows NT|Win64|WOW64/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return "unknown";
}

/**
 * Safe Exam Browser ships for Windows, macOS and iOS only. There has never been
 * a Linux build and none is planned, and this application blocks phones and
 * tablets for unrelated reasons — so on desktop, these two are the whole list.
 */
function sebAvailableForOs(os) {
  return os === "windows" || os === "macos";
}

module.exports = {
  HASH_HEX_LENGTH,
  LAUNCH_TOKEN_TTL_MS,
  computeExpectedHash,
  isHexHash,
  verifyKeyHash,
  isVersionAtLeast,
  signLaunchToken,
  verifyLaunchToken,
  generateNonce,
  detectOsFromUserAgent,
  sebAvailableForOs,
};
