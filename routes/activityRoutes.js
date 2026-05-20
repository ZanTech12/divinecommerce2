// routes/activityRoutes.js
import express from 'express';
import Activity from '../models/Activity.js';
import { protect, requirePermission } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/activities
// @desc    Fetch latest activities for admin dashboard
// @access  Private/Admin
router.get('/', protect, requirePermission('dashboard'), async (req, res) => {
  try {
    // Fetch the latest 15 activities, newest first
    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(15)
      .populate("performedBy", "name email"); // Show who did it

    res.json(activities);
  } catch (error) {
    console.error("Failed to fetch activities:", error);
    res.status(500).json({ message: "Server error fetching activities" });
  }
});

export default router;