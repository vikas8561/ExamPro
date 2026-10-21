const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AuthSession = require('../models/AuthSession');

const TOKEN_TTL_HOURS = 24 * 30 * 6;

/**
 * Short-lived memo of "this token still has a live session".
 *
 * Every authenticated request used to open with a round trip to Atlas just to
 * confirm a row exists. The query itself is indexed and costs the database
 * nothing; the network hop costs 50-200ms, and it was paid once per request --
 * so a page that made two API calls paid it twice before either did any work.
 *
 * What is cached is only the *existence* of the session, and only for
 * SESSION_CACHE_MS. The JWT's own signature and expiry are still verified on
 * every request, unchanged. The single-session rule -- signing in on a new
 * device kicks the old one out -- is enforced by startSession(), which drops
 * the cached entry for every token it invalidates, as does endSession() on
 * logout. The residual window is a process that did not handle the sign-in
 * itself; it lasts at most SESSION_CACHE_MS, so keep this small.
 */
const SESSION_CACHE_MS = 10_000;
const sessionCache = new Map(); // token -> expiry timestamp

function rememberSession(token) {
  sessionCache.set(token, Date.now() + SESSION_CACHE_MS);
  // The map only ever holds tokens seen in the last few seconds, but sweep it
  // anyway so a long-running process cannot accumulate expired entries.
  if (sessionCache.size > 5000) {
    const now = Date.now();
    for (const [key, expiresAt] of sessionCache) {
      if (expiresAt <= now) sessionCache.delete(key);
    }
  }
}

function hasFreshSession(token) {
  const expiresAt = sessionCache.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessionCache.delete(token);
    return false;
  }
  return true;
}

function forgetSessions(tokens) {
  for (const token of tokens) sessionCache.delete(token);
}

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === "OPTIONS") {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  // Fail if JWT_SECRET is not configured
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET environment variable is not set!");
    return res.status(500).json({ message: "Server configuration error" });
  }

  // A bad signature or a passed expiry is the token's own fault, and it is the
  // only thing here that is.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }

  // Single-session check. This used to read `User.activeSessions`, but a
  // student's record lives in the university's database now and ExamPro never
  // writes there, so the live token is tracked in `authsessions` instead.
  // One indexed lookup, no identity document loaded.
  //
  // This lookup used to sit inside the same try/catch as the verify above, so
  // when Atlas had no primary to select and every query threw, the browser was
  // told "Invalid or expired token" -- on every authenticated request at once.
  // An unreachable database says nothing about the caller's credentials, and a
  // student sitting an exam read it as having been logged out. Infrastructure
  // failures go to the error handler instead, which answers 503: retryable, and
  // plainly not an authentication problem.
  if (!hasFreshSession(token)) {
    let session;
    try {
      // `expiresAt` is checked here as well as by the TTL index: Mongo's TTL
      // monitor runs once a minute, and a renewed token's predecessor is given
      // only a short overlap that must actually end.
      session = await AuthSession.exists({ token, expiresAt: { $gt: new Date() } });
    } catch (err) {
      return next(err);
    }
    if (!session) {
      sessionCache.delete(token);
      return res.status(403).json({ message: "Invalid or expired session" });
    }
    rememberSession(token);
  }

  req.user = decoded;
  // The raw token, for the routes that act on this sign-in itself: renewing it,
  // and marking it as sitting a live exam.
  req.authToken = token;
  next();
};

// Role-based authorization middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Allow array of roles
    const allowedRoles = Array.isArray(role) ? role : [role];

    // Normalize role to string and lowercase for comparison
    const userRole = String(req.user?.role || "").toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map((r) =>
      String(r).toLowerCase(),
    );

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. ${allowedRoles.join(" or ")} role required. Your role: ${req.user.role}`,
      });
    }

    next();
  };
};

// Issue a token for an authenticated principal. `principal` is the normalized
// shape from services/principals - a student, mentor or admin alike.
//
// Every token carries its own random id. Without it, two tokens for the same
// person minted in the same second were byte-identical, so "replace the old
// session with the new one" could replace a token with itself.
const generateToken = (principal) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("FATAL: JWT_SECRET environment variable is not set!");
  }
  return jwt.sign(
    { userId: principal._id, email: principal.email, role: principal.role },
    process.env.JWT_SECRET,
    { expiresIn: `${TOKEN_TTL_HOURS}h`, jwtid: crypto.randomUUID() }
  );
};

/**
 * Sign-ins that are sitting a live exam.
 *
 * Signing in somewhere new used to revoke every other session at once. A
 * student who glanced at the portal on their phone, or signed in again in a
 * second browser, was thrown out of the exam on their laptop -- and every answer
 * the page had not yet saved went with it. A session the proctoring heartbeat
 * has vouched for in the last EXAM_BIND_MS is now left alone instead; the
 * single-session rule still applies to everything else, and takes the exam
 * session too once the exam is over.
 *
 * What the old rule protected -- one account, one person -- is kept by refusing
 * to open the same exam on a second device while the first is live (see
 * examOpenElsewhere and POST /proctor/session/start).
 *
 * The heartbeat runs every 5 seconds; marking at most every EXAM_MARK_EVERY_MS
 * keeps this to one small write per student per quarter-minute. EXAM_BIND_MS is
 * also how long a crashed browser keeps the exam "open elsewhere" before another
 * device may take it over.
 */
const EXAM_BIND_MS = 60_000;
const EXAM_MARK_EVERY_MS = 15_000;
const examMarkedAt = new Map(); // token -> when this process last marked it

/** A filter for sessions that are bound to a live exam right now. */
function liveExamFilter(now = new Date()) {
  return { inExamUntil: { $gt: now }, expiresAt: { $gt: now }, replacedAt: null };
}

/** Keep this sign-in bound to the exam it is sitting. Throttled per token. */
const markExamSession = async (token) => {
  if (!token) return;
  const now = Date.now();
  const last = examMarkedAt.get(token);
  if (last && now - last < EXAM_MARK_EVERY_MS) return;
  examMarkedAt.set(token, now);
  if (examMarkedAt.size > 5000) {
    for (const [key, at] of examMarkedAt) {
      if (now - at > EXAM_BIND_MS) examMarkedAt.delete(key);
    }
  }
  await AuthSession.updateOne(
    { token, replacedAt: null },
    { $set: { inExamUntil: new Date(now + EXAM_BIND_MS) } }
  );
};

/** The exam is over for this sign-in: it is an ordinary session again. */
const clearExamSession = async (token) => {
  if (!token) return;
  examMarkedAt.delete(token);
  await AuthSession.updateOne({ token }, { $set: { inExamUntil: null } });
};

/** Is another of this person's sign-ins sitting a live exam right now? */
const examOpenElsewhere = async (principalId, token) =>
  Boolean(
    await AuthSession.exists({
      principalId: String(principalId),
      token: { $ne: token },
      ...liveExamFilter(),
    })
  );

/**
 * Revoke a person's sessions -- all of them, or all but those sitting a live
 * exam. Returns how many were revoked.
 */
const revokeSessions = async (principalId, { keepLiveExam = true, exceptToken = null } = {}) => {
  const filter = { principalId: String(principalId) };
  if (keepLiveExam) filter.$nor = [liveExamFilter()];
  if (exceptToken) filter.token = { $ne: exceptToken };
  // Read the tokens before deleting them, so the ones being invalidated are
  // dropped from the cache too -- otherwise the revoked device would keep
  // working for up to SESSION_CACHE_MS.
  const revoked = await AuthSession.find(filter).select('token').lean();
  forgetSessions(revoked.map((s) => s.token));
  if (revoked.length) {
    await AuthSession.deleteMany({ _id: { $in: revoked.map((s) => s._id) } });
  }
  return revoked.length;
};

// Replace this principal's other sessions with the new one, so signing in on a
// new device still kicks the old one out -- unless the old one is sitting a
// live exam (see above).
const startSession = async (principal, token) => {
  await revokeSessions(principal._id, { keepLiveExam: true });
  await AuthSession.create({
    principalId: String(principal._id),
    role: principal.role,
    token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });
};

/**
 * Renewing a token.
 *
 * A token lived exactly 24 hours from sign-in and nothing renewed it. The login
 * page skips the form while a token is still valid, so a student who signed in
 * yesterday at 10:05 walked into today's 10:00 exam with five minutes left on
 * it. When it ran out, every autosave was refused and the page said nothing;
 * the student found out at Submit, signed in again, and came back to the
 * answers saved before 10:05.
 *
 * The browser now swaps its token for a fresh one well before it runs out (see
 * Frontend/src/services/api.js). The old token is not revoked outright: requests
 * already in flight with it -- the exam page sends one every few seconds -- get
 * REFRESH_OVERLAP_MS to land. It is marked replaced at once, so it cannot be
 * renewed a second time and no longer counts as the exam's sign-in.
 */
const REFRESH_OVERLAP_MS = 2 * 60 * 1000;
// A token with more than this left is handed back unchanged.
const REFRESH_MIN_AGE_REMAINING_MS = (TOKEN_TTL_HOURS - 1) * 60 * 60 * 1000;

/**
 * Returns `{ token }` (possibly the same one), or `null` when this token has
 * already been replaced and must not be renewed again.
 */
const refreshSession = async (oldToken, decoded) => {
  const now = Date.now();
  const current = await AuthSession.findOne({ token: oldToken, expiresAt: { $gt: new Date(now) } }).lean();
  if (!current || current.replacedAt) return null;

  if (decoded?.exp && decoded.exp * 1000 - now > REFRESH_MIN_AGE_REMAINING_MS) {
    return { token: oldToken };
  }

  const token = generateToken({ _id: decoded.userId, email: decoded.email, role: decoded.role });

  // Claim the old row first, so two tabs renewing at once cannot both do it.
  const claimed = await AuthSession.updateOne(
    { _id: current._id, replacedAt: null },
    {
      $set: {
        replacedAt: new Date(now),
        inExamUntil: null,
        expiresAt: new Date(Math.min(new Date(current.expiresAt).getTime(), now + REFRESH_OVERLAP_MS)),
      },
    }
  );
  if (claimed.modifiedCount !== 1) return null;
  examMarkedAt.delete(oldToken);

  await AuthSession.create({
    principalId: current.principalId,
    role: current.role,
    token,
    expiresAt: new Date(now + TOKEN_TTL_HOURS * 60 * 60 * 1000),
    // The exam this sign-in is sitting carries over to the renewed token.
    inExamUntil: current.inExamUntil,
  });
  return { token };
};

const endSession = async (token) => {
  forgetSessions([token]);
  examMarkedAt.delete(token);
  await AuthSession.deleteMany({ token });
};

module.exports = {
  authenticateToken,
  generateToken,
  requireRole,
  startSession,
  endSession,
  refreshSession,
  revokeSessions,
  markExamSession,
  clearExamSession,
  examOpenElsewhere,
  TOKEN_TTL_HOURS,
  EXAM_BIND_MS,
  REFRESH_OVERLAP_MS,
};
