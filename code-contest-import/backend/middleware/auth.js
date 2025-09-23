const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');

// Improved database connection check and token validation.
const authenticate = async (req, res, next) => {
  try {
    console.log('=== START AUTHENTICATION MIDDLEWARE ===');

    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided or invalid format.' 
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // attach user info to request
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid or expired token.' 
      });
    }

    const userId = decoded._id || decoded.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token: no user identifier found.' 
      });
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database connection unavailable.' 
      });
    }

    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found.' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Account is deactivated.' 
      });
    }

    req.user = user;
    console.log('Authorization Header:', authHeader);
    console.log('Decoded Token:', decoded);
    console.log('Database Connection State:', mongoose.connection.readyState);
    console.log('User ID from Token:', userId);
    next();
  } catch (error) {
    console.error('💥 Unexpected authentication error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication failed due to server error.' 
    });
  }
};

// Add middleware execution verification
const debugMiddlewareExecution = (req, res, next) => {
  console.log('\n=== MIDDLEWARE EXECUTION VERIFICATION ===');
  console.log('Route:', req.originalUrl);
  console.log('Middleware chain executing...');
  next();
};

// Update your route to include debugging
// In your routes file, add this before authenticate:
// router.get('/protected-route', debugMiddlewareExecution, authenticate, (req, res) => {...});

module.exports = {
  authenticate,
  authorize: (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required.' 
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ 
          success: false, 
          error: `Access denied. Required roles: ${roles.join(', ')}` 
        });
      }

      next();
    };
  },
  requireTeacher: (...roles) => authorize('teacher', 'admin')(...roles),
  requireAdmin: (...roles) => authorize('admin')(...roles),
  checkOwnership: (resourceUserField = 'userId') => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required.' 
        });
      }

      if (['admin', 'teacher'].includes(req.user.role)) {
        return next();
      }

      const resourceUserId = req.params.userId || req.body[resourceUserField] || req.query.userId;
      
      if (resourceUserId && resourceUserId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied. You can only access your own resources.' 
        });
      }

      next();
    };
  },
  optionalAuth: async (req, res, next) => {
    try {
      const authHeader = req.header('Authorization');
      
      if (!authHeader) {
        return next();
      }

      const token = authHeader.replace('Bearer ', '');
      
      if (!token) {
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-passwordHash');
      
      if (user && user.isActive) {
        req.user = user;
      }

      next();
    } catch (error) {
      next();
    }
  },
  debugMiddlewareExecution // Export for route debugging
};