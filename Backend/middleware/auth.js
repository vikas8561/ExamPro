const jwt = require('jsonwebtoken');
const AuthSession = require('../models/AuthSession');

const TOKEN_TTL_HOURS = 24;

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

  try {
    // Verify token - fail if JWT_SECRET is not configured
    if (!process.env.JWT_SECRET) {
      console.error('FATAL: JWT_SECRET environment variable is not set!');
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Single-session check. This used to read `User.activeSessions`, but a
    // student's record lives in the university's database now and ExamPro never
    // writes there, so the live token is tracked in `authsessions` instead.
    // One indexed lookup, no identity document loaded.
    const session = await AuthSession.exists({ token });
    if (!session) {
      return res.status(403).json({ message: 'Invalid or expired session' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
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
  await AuthSession.deleteMany({ principalId: String(principal._id) });
  await AuthSession.create({
    principalId: String(principal._id),
    role: principal.role,
    token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });
};

const endSession = async (token) => {
  await AuthSession.deleteMany({ token });
};

module.exports = { authenticateToken, generateToken, requireRole, startSession, endSession, TOKEN_TTL_HOURS };
