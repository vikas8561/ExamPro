/**
 * Are we running inside Safe Exam Browser, and can we prove it?
 *
 * SEB used to attach its keys as HTTP request headers, and an exam server just
 * read them. That stopped working: neither WebKit nor Chromium lets SEB inject
 * headers on cross-origin requests any more, and this app's API is a different
 * origin from its frontend, so those headers would never arrive. The supported
 * replacement is a JavaScript API that SEB injects into the page.
 *
 * The value it exposes is **not** the Browser Exam Key. It is already
 * `SHA256(current page URL + key)` — exactly what the old header carried. So the
 * page never sees a secret; it reads a proof and forwards it, and the server
 * checks that proof against the URL it expects. A student in an ordinary browser
 * has nothing to forward.
 *
 * Detection is by the presence of this API, not by sniffing the user agent. SEB's
 * own documentation says not to trust the user agent, because any browser can be
 * made to claim anything.
 *
 * Everything here degrades honestly, the same rule the rest of the proctoring
 * follows: a missing API means "not SEB", never a crash and never an accusation.
 */

/** How long to wait for older SEB builds to populate the keys asynchronously. */
const UPDATE_KEYS_TIMEOUT_MS = 1500;

function sebGlobal() {
  try {
    return typeof window !== "undefined" && window.SafeExamBrowser
      ? window.SafeExamBrowser
      : null;
  } catch {
    // Reading an injected global can throw in a hardened context.
    return null;
  }
}

/** Cheap synchronous check, safe to call anywhere including render. */
export function isSebPresent() {
  return sebGlobal() !== null;
}

function readKeys() {
  const seb = sebGlobal();
  if (!seb) return { browserExamKeyHash: "", configKeyHash: "" };

  try {
    return {
      browserExamKeyHash:
        typeof seb.security?.browserExamKey === "string" ? seb.security.browserExamKey : "",
      configKeyHash:
        typeof seb.security?.configKey === "string" ? seb.security.configKey : "",
    };
  } catch {
    return { browserExamKeyHash: "", configKeyHash: "" };
  }
}

/**
 * The current Config Key hash, re-read fresh.
 *
 * Used by the heartbeat: the server treats a session as genuine only while SEB
 * keeps re-proving itself, so this is read again on every check-in rather than
 * captured once at startup. Re-reading also covers the case where the keys were
 * still being filled in when the exam page first mounted.
 *
 * The Config Key rather than the Browser Exam Key, because the server can derive
 * it from the configuration file it wrote — the same value on Windows and macOS
 * and across SEB releases, with nothing for an administrator to copy by hand.
 */
export function readSebKeyHash() {
  return readKeys().configKeyHash;
}

/**
 * Ask SEB to populate its key variables, on the builds that need asking.
 *
 * SEB for Windows 3.3.2 and macOS 3.1 onwards fill these in before the page
 * loads and expose no callback at all. Older builds require `updateKeys` and
 * answer asynchronously. Both shapes are handled, and a build that never calls
 * back is not allowed to hang the exam.
 */
function updateKeys() {
  const seb = sebGlobal();
  if (!seb || typeof seb.security?.updateKeys !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(finish, UPDATE_KEYS_TIMEOUT_MS);

    try {
      seb.security.updateKeys(() => {
        clearTimeout(timer);
        finish();
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

/**
 * Everything the exam page and the server need to know about SEB, in one call.
 *
 * `pageUrl` is reported for diagnostics only. The server deliberately ignores it
 * and hashes against the URL it stored when it generated this attempt's config
 * file — trusting a URL from the page would undo the per-attempt nonce that stops
 * one student's proof being replayed by another.
 */
export async function detectSEB() {
  if (!isSebPresent()) {
    return {
      isSEB: false,
      version: "",
      browserExamKeyHash: "",
      configKeyHash: "",
      pageUrl: "",
    };
  }

  await updateKeys();

  const seb = sebGlobal();
  const keys = readKeys();

  let version = "";
  try {
    version = typeof seb?.version === "string" ? seb.version : "";
  } catch {
    version = "";
  }

  let pageUrl = "";
  try {
    pageUrl = window.location.href.split("#")[0];
  } catch {
    pageUrl = "";
  }

  return {
    isSEB: true,
    version,
    browserExamKeyHash: keys.browserExamKeyHash,
    configKeyHash: keys.configKeyHash,
    pageUrl,
  };
}
