// routes/dashboardRoutes.js
import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { protect, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get real-time dashboard statistics
// @access  Private/Admin
router.get('/stats', protect, requirePermission('dashboard'), async (req, res) => {
  try {
    // 1. Get Total Orders & Total Revenue
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" } // Make sure this matches your Order schema
        }
      }
    ]);

    // 2. Get Total Active Products
    const totalProducts = await Product.countDocuments({ isActive: true });

    // 3. Get Total Customers (users with role 'user')
    const totalCustomers = await User.countDocuments({ role: 'user' });

    // Extract from aggregation result (aggregation returns an array)
    const stats = orderStats[0] || { totalOrders: 0, totalRevenue: 0 };

    res.json({
      totalOrders: stats.totalOrders,
      revenue: stats.totalRevenue,
      totalProducts,
      totalCustomers
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Failed to fetch dashboard statistics" });
  }
});

export default router;