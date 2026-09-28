// Brute-force protection for the login form: 3 wrong passwords inside 5 minutes
// locks that identifier out for 30 minutes.
//
// Blocking used to be a flag on the User document. Student records belong to the
// university's database and their login state is not ExamPro's to keep there, so
// the counter lives in this process instead.
//
// It sits in its own module rather than inside routes/auth.js because the admin
// panel reads the same state - to show a student as locked out, and to clear the
// lock when an admin presses Unblock. Two separate Maps would mean an Unblock
// button that clears nothing.
//
// The state is deliberately not persisted, which has two consequences worth
// knowing: a server restart forgets every lockout, and if ExamPro is ever run as
// more than one process each keeps its own counters, so an unblock only reaches
// the process that happened to serve the request.

const MAX_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 30 * 60 * 1000;

// identifier -> { count, firstAt, lockedUntil }
const failedAttempts = new Map();

// Logins are accepted however the student typed them, so the counter has to be
// keyed case-insensitively or "24BTCSE095" and "24btcse095" would each get their
// own three attempts.
function keyFor(identifier) {
  return typeof identifier === "string" ? identifier.trim().toLowerCase() : "";
}

// Read an entry, discarding one that no longer means anything: a lockout that has
// run out, or a counting window that closed before reaching the limit. Pruning on
// read is what keeps a stale "2 failed attempts" from being reported to the admin
// panel hours after the window it belonged to expired.
function activeEntry(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return null;

  if (entry.lockedUntil) {
    if (entry.lockedUntil > Date.now()) return entry;
  } else if (Date.now() - entry.firstAt <= ATTEMPT_WINDOW_MS) {
    return entry;
  }

  failedAttempts.delete(key);
  return null;
}

// How much longer this identifier is locked out for, in ms. 0 means it is not.
function remainingFor(identifier) {
  const entry = activeEntry(keyFor(identifier));
  if (!entry?.lockedUntil) return 0;
  return entry.lockedUntil - Date.now();
}

function recordFailure(identifier) {
  const key = keyFor(identifier);
  if (!key) return;

  const entry = activeEntry(key);
  if (!entry) {
    failedAttempts.set(key, { count: 1, firstAt: Date.now(), lockedUntil: null });
    return;
  }

  entry.count += 1;
  // Only start the clock once. Attempts arriving against an identifier that is
  // already locked must not push the release time further out.
  if (entry.count >= MAX_ATTEMPTS && !entry.lockedUntil) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
}

function clear(identifier) {
  return failedAttempts.delete(keyFor(identifier));
}

// A student signs in with either a UniversityUID or a roll number, and may have
// an email on file too, so one person owns several keys and the wrong password
// could have been typed against any of them. The two calls below therefore take
// every identifier that person could have used, and report or clear the lot.

function statusFor(identifiers) {
  let lockRemainingMs = 0;
  let failedLoginAttempts = 0;

  for (const identifier of identifiers || []) {
    const entry = activeEntry(keyFor(identifier));
    if (!entry) continue;
    failedLoginAttempts = Math.max(failedLoginAttempts, entry.count);
    if (entry.lockedUntil) {
      lockRemainingMs = Math.max(lockRemainingMs, entry.lockedUntil - Date.now());
    }
  }

  return {
    isLocked: lockRemainingMs > 0,
    lockedUntil: lockRemainingMs > 0 ? new Date(Date.now() + lockRemainingMs).toISOString() : null,
    lockRemainingMs,
    failedLoginAttempts,
    maxLoginAttempts: MAX_ATTEMPTS,
  };
}

function clearAll(identifiers) {
  let cleared = 0;
  for (const identifier of identifiers || []) {
    if (clear(identifier)) cleared += 1;
  }
  return cleared;
}

module.exports = {
  MAX_ATTEMPTS,
  ATTEMPT_WINDOW_MS,
  LOCKOUT_MS,
  remainingFor,
  recordFailure,
  clear,
  clearAll,
  statusFor,
};
