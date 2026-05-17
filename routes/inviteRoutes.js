// routes/inviteRoutes.js
import express from 'express';
import { generateInviteToken, getInviteTokens, deleteInviteToken } from '../controllers/inviteController.js';
import { protect, isAdmin } from '../middleware/authMiddleware.js'; // Adjust path based on your setup

const router = express.Router();

router.route('/')
  .get(protect, isAdmin, getInviteTokens)
  .post(protect, isAdmin, generateInviteToken);

router.route('/:id')
  .delete(protect, isAdmin, deleteInviteToken);

export default router;