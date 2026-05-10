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
    // ✅ ADDED SAFETY CHECK: Prevent crash if protect middleware was skipped
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
    }

    // Re-fetch user from DB to get the latest role
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

export default { protect, isAdmin };