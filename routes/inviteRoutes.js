// routes/inviteRoutes.js
import express from 'express';
import { generateInviteToken, getInviteTokens, deleteInviteToken } from '../controllers/inviteController.js';
// ✅ UPDATED: Import requirePermission instead of isAdmin
import { protect, requirePermission } from '../middleware/authMiddleware.js'; 

const router = express.Router();

// Admin OR Sales Rep with "manage_engineers" permission
router.route('/')
  .get(protect, requirePermission('manage_engineers'), getInviteTokens)
  .post(protect, requirePermission('manage_engineers'), generateInviteToken);

router.route('/:id')
  .delete(protect, requirePermission('manage_engineers'), deleteInviteToken);

export default router;