// routes/paymentRoutes.js (add this if it doesn't exist)
import express from "express";
import Wallet from "../models/Wallet.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /payments/balance
router.get("/balance", protect, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    res.json({ coins: wallet?.coins || 0 });
  } catch (error) {
    console.error("Fetch balance error:", error);
    res.status(500).json({ coins: 0 });
  }
});

export default router;