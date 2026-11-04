import express from "express";
import Wallet from "../models/Wallet.js";
import { protect } from "../middleware/authMiddleware.js";

import {
  initializeMonnifyPayment,
  verifyMonnifyPayment,
  monnifyWebhook,
} from "../controllers/monnifyController.js";

const router = express.Router();

// Existing wallet balance route
router.get("/balance", protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });

    res.json({
      coins: wallet?.coins || 0,
    });
  } catch (error) {
    console.error("Fetch balance error:", error);

    res.status(500).json({
      coins: 0,
    });
  }
});

// Initialize Monnify payment
router.post(
  "/monnify/initialize",
  protect,
  initializeMonnifyPayment
);

// Verify Monnify payment
router.get(
  "/monnify/verify/:paymentReference",
  protect,
  verifyMonnifyPayment
);

// Monnify webhook
// This endpoint must remain public because Monnify calls it.
router.post(
  "/monnify/webhook",
  monnifyWebhook
);

export default router;