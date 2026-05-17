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

import { protect, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public route — anyone can view active slides
router.get("/", getMessages);
router.get("/:id", getMessage);

// isAdmin-only routes
router.post("/", protect, isAdmin, createMessage);
router.put("/reorder", protect, isAdmin, reorderMessages);
router.put("/:id", protect, isAdmin, updateMessage);
router.patch("/:id/toggle", protect, isAdmin, toggleMessage);
router.delete("/:id", protect, isAdmin, deleteMessage);

export default router;