// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
}

export const protect = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    
    req.user = { 
      _id: decoded.id,
      role: decoded.role 
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }

    const freshUser = await User.findById(req.user._id).select('role').lean();
    
    if (!freshUser) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    if (freshUser.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    req.user = { ...req.user, role: freshUser.role };
    next();
  } catch (error) {
    console.error('isAdmin middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const isEngineer = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }

    const freshUser = await User.findById(req.user._id).select('role').lean();
    
    if (!freshUser) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    if (freshUser.role !== 'engineer' && freshUser.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Engineer or Admin access required' });
    }
    
    req.user = { ...req.user, role: freshUser.role };
    next();
  } catch (error) {
    console.error('isEngineer middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Admin OR Sales Rep can pass.
 * Use this on general admin routes that don't require granular permission checks.
 */
export const isAdminOrSalesRep = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }

    const freshUser = await User.findById(req.user._id).select('role permissions').lean();
    
    if (!freshUser) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    if (freshUser.role !== 'admin' && freshUser.role !== 'sales_rep') {
      return res.status(403).json({ success: false, message: 'Admin or Sales Rep access required' });
    }
    
    // Attach permissions to req.user so downstream controllers can use them if needed
    req.user = { 
      ...req.user, 
      role: freshUser.role, 
      permissions: freshUser.permissions || [] 
    };
    
    next();
  } catch (error) {
    console.error('isAdminOrSalesRep middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Permission-based middleware factory.
 * Admin ALWAYS passes (full access).
 * Sales Rep passes ONLY if they have the required permission.
 * Other roles are blocked.
 *
 * Usage:
 *   router.get("/", protect, requirePermission("manage_users"), handler)
 *   router.get("/", protect, requirePermission("manage_users", "manage_orders"), handler)  // OR logic
 */
export const requirePermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user._id) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
      }

      // Fetch fresh user data including role and permissions from DB
      // This ensures that if an admin revokes a permission, it takes effect immediately
      const freshUser = await User.findById(req.user._id).select('role permissions').lean();

      if (!freshUser) {
        return res.status(401).json({ success: false, message: 'User not found.' });
      }

      // Update req.user with fresh DB data
      req.user = { 
        ...req.user, 
        role: freshUser.role, 
        permissions: freshUser.permissions || [] 
      };

      // Admin always has full access
      if (freshUser.role === 'admin') {
        return next();
      }

      // Sales rep: check if they have at least ONE of the required permissions
      if (freshUser.role === 'sales_rep') {
        const hasPermission = requiredPermissions.some((perm) =>
          freshUser.permissions.includes(perm)
        );
        
        if (hasPermission) {
          return next();
        }
        
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${requiredPermissions.join(' or ')}.`,
        });
      }

      // All other roles (user, engineer, etc.)
      return res.status(403).json({
        success: false,
        message: 'Access denied.',
      });
    } catch (error) {
      console.error('requirePermission middleware error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
};

// ✅ UPDATED: Include new middlewares in the default export
export default { protect, isAdmin, isEngineer, isAdminOrSalesRep, requirePermission };