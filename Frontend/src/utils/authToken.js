/**
 * Reading the sign-in token, and deciding when to renew it.
 *
 * A token lives 24 hours from sign-in (Backend/middleware/auth.js). It used to
 * be left to run out, and the login page skips the form while one is still
 * valid -- so a student who signed in yesterday at 10:05 sat today's 10:00 exam
 * on a token with five minutes left. When it expired the exam page carried on,
 * every autosave was refused, and nothing said so until Submit.
 *
 * Any page that talks to the server now swaps the token for a fresh one once it
 * has less than RENEW_WHEN_LEFT_MS to go. The exam page's heartbeat talks to
 * the server every few seconds, so a token in use never gets near its end.
 *
 * No imports on purpose, so the scenarios can load this under plain Node
 * (scripts/auth-token-scenarios.mjs). Callers pass the time in -- the server's
 * clock, from utils/serverClock.js.
 */

/** Renew once less than this is left. Half the token's life. */
export const RENEW_WHEN_LEFT_MS = 12 * 60 * 60 * 1000;

/** The token's expiry in epoch milliseconds, or null if it cannot be read. */
export function tokenExpiryMs(token) {
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = JSON.parse(json)?.exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True once the token has run out. Unreadable tokens are left to the server. */
export function isTokenExpired(token, nowMs) {
  const expiry = tokenExpiryMs(token);
  return expiry !== null && expiry <= nowMs;
}

/** True while the token is still valid but due for renewal. */
export function shouldRenewToken(token, nowMs) {
  const expiry = tokenExpiryMs(token);
  if (expiry === null) return false;
  const left = expiry - nowMs;
  return left > 0 && left < RENEW_WHEN_LEFT_MS;
}

/**
 * Where to send someone whose sign-in has ended: the login page, told why, and
 * told to bring them back here afterwards -- for a student mid-exam, straight
 * back into the exam, where their saved answers are restored.
 *
 * `reason` is "session_timeout" (the sign-in ran out) or "session_expired"
 * (it was replaced by a sign-in elsewhere).
 */
export function loginRedirectUrl(reason, location) {
  const params = new URLSearchParams({ message: reason });
  const back = `${location?.pathname || ""}${location?.search || ""}`;
  if (back.startsWith("/") && !back.startsWith("//") && !back.startsWith("/login")) {
    params.set("redirect", back);
  }
  return `/login?${params.toString()}`;
}
