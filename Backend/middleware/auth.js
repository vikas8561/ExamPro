const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    console.log('🔧 Skipping auth for OPTIONS request');
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth middleware - Method:', req.method);
  console.log('🔐 Auth middleware - Token present:', !!token);

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('✅ Token verified for user:', decoded.userId);
    
    // Check if token is in user's active sessions
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('❌ User not found:', decoded.userId);
      return res.status(403).json({ message: 'User not found' });
    }
    
    if (!user.activeSessions || !user.activeSessions.includes(token)) {
      console.log('❌ Token not in active sessions. User sessions:', user.activeSessions?.length || 0);
      return res.status(403).json({ message: 'Invalid or expired session' });
    }
    
    console.log('✅ Authentication successful for user:', decoded.userId);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Role-based authorization middleware
const requireRole = (role) => {
  return (req, res, next) => {
    // console.log('Role check - User:', req.user);
    // console.log('Required role:', role);
    // console.log('User role:', req.user?.role);
    // console.log('User role type:', typeof req.user?.role);
    
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Allow array of roles
    const allowedRoles = Array.isArray(role) ? role : [role];
    
    // Normalize role to string and lowercase for comparison
    const userRole = String(req.user?.role || '').toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => String(r).toLowerCase());
    
    // console.log('Normalized user role:', userRole);
    // console.log('Normalized allowed roles:', normalizedAllowedRoles);
    
    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: `Access denied. ${allowedRoles.join(' or ')} role required. Your role: ${req.user.role}` 
      });
    }
    
    next();
  };
};

// Optional: Create token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
};

module.exports = { authenticateToken, generateToken, requireRole };
