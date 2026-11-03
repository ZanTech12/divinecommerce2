
// middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Get JWT_SECRET when needed instead of during module import.
// This allows dotenv to load before authentication requests.
const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      'FATAL ERROR: JWT_SECRET environment variable is not defined.'
    );
  }

  return secret;
};

// ==========================================
// PROTECT ROUTES
// ==========================================

export const protect = (req, res, next) => {
  try {
    const JWT_SECRET = getJWTSecret();

    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = header.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });

    req.user = {
      _id: decoded.id,
      role: decoded.role
    };

    next();

  } catch (error) {
    if (error.message.includes('JWT_SECRET')) {
      console.error('JWT configuration error:', error.message);

      return res.status(500).json({
        success: false,
        message: 'Server authentication configuration error.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// ==========================================
// ADMIN ONLY
// ==========================================

export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, please log in'
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select('role')
      .lean();

    if (!freshUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (freshUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    req.user = {
      ...req.user,
      role: freshUser.role
    };

    next();

  } catch (error) {
    console.error('isAdmin middleware error:', error);

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// ==========================================
// ENGINEER OR ADMIN
// ==========================================

export const isEngineer = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, please log in'
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select('role')
      .lean();

    if (!freshUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (
      freshUser.role !== 'engineer' &&
      freshUser.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Engineer or Admin access required'
      });
    }

    req.user = {
      ...req.user,
      role: freshUser.role
    };

    next();

  } catch (error) {
    console.error('isEngineer middleware error:', error);

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// ==========================================
// ADMIN OR SALES REPRESENTATIVE
// ==========================================

export const isAdminOrSalesRep = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, please log in'
      });
    }

    const freshUser = await User.findById(req.user._id)
      .select('role permissions')
      .lean();

    if (!freshUser) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (
      freshUser.role !== 'admin' &&
      freshUser.role !== 'sales_rep'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Admin or Sales Rep access required'
      });
    }

    req.user = {
      ...req.user,
      role: freshUser.role,
      permissions: freshUser.permissions || []
    };

    next();

  } catch (error) {
    console.error('isAdminOrSalesRep middleware error:', error);

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// ==========================================
// PERMISSION-BASED MIDDLEWARE
// ==========================================

export const requirePermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated.'
        });
      }

      // Fetch fresh user data from the database.
      const freshUser = await User.findById(req.user._id)
        .select('role permissions')
        .lean();

      if (!freshUser) {
        return res.status(401).json({
          success: false,
          message: 'User not found.'
        });
      }

      // Update request user with fresh database information.
      req.user = {
        ...req.user,
        role: freshUser.role,
        permissions: freshUser.permissions || []
      };

      // Admin always has full access.
      if (freshUser.role === 'admin') {
        return next();
      }

      // Sales representative must have at least one permission.
      if (freshUser.role === 'sales_rep') {
        const hasPermission = requiredPermissions.some((perm) =>
          freshUser.permissions.includes(perm)
        );

        if (hasPermission) {
          return next();
        }

        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}.`
        });
      }

      // Other roles are denied.
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });

    } catch (error) {
      console.error('requirePermission middleware error:', error);

      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  };
};

// ==========================================
// DEFAULT EXPORT
// ==========================================

export default {
  protect,
  isAdmin,
  isEngineer,
  isAdminOrSalesRep,
  requirePermission
};
