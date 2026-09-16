const jwt = require('jsonwebtoken');
const AuthSession = require('../models/AuthSession');

const TOKEN_TTL_HOURS = 24;

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
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  // Fail if JWT_SECRET is not configured
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set!');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  // A bad signature or a passed expiry is the token's own fault, and it is the
  // only thing here that is.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
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
      session = await AuthSession.exists({ token });
    } catch (err) {
      return next(err);
    }
    if (!session) {
      sessionCache.delete(token);
      return res.status(403).json({ message: 'Invalid or expired session' });
    }
    rememberSession(token);
  }

  req.user = decoded;
  next();
};

// Role-based authorization middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Allow array of roles
    const allowedRoles = Array.isArray(role) ? role : [role];

    // Normalize role to string and lowercase for comparison
    const userRole = String(req.user?.role || '').toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => String(r).toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Access denied. ${allowedRoles.join(' or ')} role required. Your role: ${req.user.role}`
      });
    }

    next();
  };
};

// Issue a token for an authenticated principal. `principal` is the normalized
// shape from services/principals - a student, mentor or admin alike.
const generateToken = (principal) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set!');
  }
  return jwt.sign(
    { userId: principal._id, email: principal.email, role: principal.role },
    process.env.JWT_SECRET,
    { expiresIn: `${TOKEN_TTL_HOURS}h` }
  );
};

// Replace any existing session for this principal, so signing in on a new
// device still kicks the old one out exactly as it did before.
const startSession = async (principal, token) => {
  // Read the tokens before deleting them, so the ones this sign-in invalidates
  // are dropped from the cache too -- otherwise the kicked-out device would
  // keep working for up to SESSION_CACHE_MS.
  const replaced = await AuthSession.find({ principalId: String(principal._id) })
    .select('token')
    .lean();
  forgetSessions(replaced.map((s) => s.token));

  await AuthSession.deleteMany({ principalId: String(principal._id) });
  await AuthSession.create({
    principalId: String(principal._id),
    role: principal.role,
    token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });
};

const endSession = async (token) => {
  forgetSessions([token]);
  await AuthSession.deleteMany({ token });
};

module.exports = { authenticateToken, generateToken, requireRole, startSession, endSession, TOKEN_TTL_HOURS };
