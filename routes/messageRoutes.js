// routes/messageRoutes.js
import express from "express";
import {
  getMessages,
  getMessage,
  createMessage,
  updateMessage,
  deleteMessage,
  reorderMessages,
  toggleMessage,
} from "../controllers/messageController.js";

// ✅ UPDATED: Import requirePermission instead of isAdmin
import { protect, requirePermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes — anyone can view active slides
router.get("/", getMessages);
router.get("/:id", getMessage);

// Admin OR Sales Rep with "manage_banners" permission
router.post("/", protect, requirePermission("manage_banners"), createMessage);
router.put("/reorder", protect, requirePermission("manage_banners"), reorderMessages);
router.put("/:id", protect, requirePermission("manage_banners"), updateMessage);
router.patch("/:id/toggle", protect, requirePermission("manage_banners"), toggleMessage);
router.delete("/:id", protect, requirePermission("manage_banners"), deleteMessage);

export default router;