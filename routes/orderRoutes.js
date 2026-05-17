// routes/orderRoutes.js
import express from "express";
import Order from "../models/Order.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import { protect, isAdmin } from "../middleware/authMiddleware.js";
import { sendOrderConfirmationEmail } from "../utils/sendEmail.js";

const router = express.Router();

// ═══════════════════════════════════════════════════
// HELPER: Credit earned coins to user's wallet
// ═══════════════════════════════════════════════════
const creditCoins = async (userId, baseAmount, orderId) => {
  // 1 coin per ₦10,000 of ACTUAL CASH spent
  const coinsToCredit = Math.floor(baseAmount / 10000);
  if (coinsToCredit <= 0) return 0;

  await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { coins: coinsToCredit } },
    { upsert: true, new: true }
  );

  await Order.findByIdAndUpdate(orderId, { coinsCredited: true });
  return coinsToCredit;
};

// ═══════════════════════════════════════════════════
// HELPER: Deduct earned coins if order is cancelled
// ═══════════════════════════════════════════════════
const deductEarnedCoins = async (userId, baseAmount, orderId) => {
  const coinsToDeduct = Math.floor(baseAmount / 10000);
  if (coinsToDeduct <= 0) return 0;

  await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { coins: -coinsToDeduct } }
  );

  await Order.findByIdAndUpdate(orderId, { coinsCredited: false });
  return coinsToDeduct;
};

// ═══════════════════════════════════════════════════
// CREATE ORDER — Auth required
// ═══════════════════════════════════════════════════
router.post("/", protect, async (req, res) => {
  try {
    const {
      items,
      subtotal,
      deliveryFee,
      total,
      coinsUsed = 0,
      coinDiscount = 0,
      amountPaid,
      paymentMethod,
      paystackReference,
      customerEmail,
      shippingAddress
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cannot place an empty order." });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street) {
      return res.status(400).json({ success: false, message: "A valid shipping address is required." });
    }

    // ✅ NEW: Deduct used coins from wallet before creating order
    if (coinsUsed > 0) {
      const wallet = await Wallet.findOne({ user: req.user._id });
      if (!wallet || wallet.coins < coinsUsed) {
        return res.status(400).json({ success: false, message: "Insufficient loyalty coins." });
      }
      wallet.coins -= coinsUsed;
      await wallet.save(); // Triggers min:0 validation
    }

    const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    let orderStatus = "pending";
    // ✅ UPDATED: Auto-confirm if Paystack paid OR fully paid with coins
    if ((paymentMethod === "paystack" && paystackReference) || paymentMethod === "coins") {
      orderStatus = "confirmed";
    }

    const newOrder = new Order({
      user: req.user._id,
      orderNumber,
      items,
      shippingAddress: {
        ...shippingAddress,
        email: shippingAddress.email || customerEmail || undefined
      },
      subtotal,
      shippingCost: deliveryFee || 0,
      totalAmount: total,
      coinsUsed,
      coinDiscount,
      amountPaid: amountPaid !== undefined ? amountPaid : total,
      paymentMethod,
      paystackReference: paystackReference || null,
      guestEmail: customerEmail || shippingAddress?.email || null,
      status: orderStatus,
    });

    const savedOrder = await newOrder.save();

    // ✅ UPDATED: Credit coins based on actual CASH paid (amountPaid), not total
    let coinsCreditedCount = 0;
    if (orderStatus === "confirmed" && savedOrder.user) {
      const baseForEarning = savedOrder.amountPaid;
      coinsCreditedCount = await creditCoins(savedOrder.user, baseForEarning, savedOrder._id);
    }

    const fullUser = await User.findById(req.user._id).select('name email');

    try {
      await sendOrderConfirmationEmail(savedOrder, fullUser);
    } catch (emailError) {
      console.error("Order confirmation email failed:", emailError.message);
    }

    res.status(201).json({
      success: true,
      order: savedOrder,
      coinsCredited: coinsCreditedCount,
    });

  } catch (error) {
    console.error("Create order error:", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Server error while placing order." });
  }
});

// ═══════════════════════════════════════════════════
// TRACK ORDER — Public
// ═══════════════════════════════════════════════════
router.get("/track", async (req, res) => {
  try {
    const { orderNumber, trackingNumber, phone, email } = req.query;

    if (!orderNumber && !trackingNumber && !phone && !email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an order number, tracking number, phone number, or email to track your order.",
      });
    }

    let query = {};

    if (orderNumber) {
      query.orderNumber = orderNumber.toUpperCase().trim();
    } else if (trackingNumber) {
      query.trackingNumber = trackingNumber.toUpperCase().trim();
    } else if (phone) {
      query["shippingAddress.phone"] = phone.replace(/[^0-9+]/g, "");
    } else if (email) {
      query.$or = [
        { guestEmail: email.toLowerCase().trim() },
        { "user.email": email.toLowerCase().trim() },
      ];
    }

    const order = await Order.findOne(query)
      .populate("items.product", "name image price discountPrice")
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "No order found with the provided information." });
    }

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const currentIndex = statusFlow.indexOf(order.status);
    const progress = order.status === "cancelled" || order.status === "returned"
      ? 0
      : Math.round((currentIndex / (statusFlow.length - 1)) * 100);

    const isOwner = req.user && order.user && order.user.toString() === req.user._id.toString();
    const trackedByEmail = email && !req.user;

    let safeOrder = { ...order };
    if (!isOwner && trackedByEmail) {
      safeOrder.shippingAddress = {
        ...order.shippingAddress,
        street: (order.shippingAddress.street || "").substring(0, 15) + "****",
        phone: (order.shippingAddress.phone || "").replace(/(\d{4})\d+(\d{2})/, "$1****$2"),
      };
    }

    res.json({
      success: true,
      order: {
        ...safeOrder,
        progress,
        estimatedDaysLeft: order.estimatedDelivery
          ? Math.max(0, Math.ceil((order.estimatedDelivery - new Date()) / (1000 * 60 * 60 * 24)))
          : null,
      },
    });
  } catch (error) {
    console.error("Track order error:", error);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
});

// ═══════════════════════════════════════════════════
// GET USER ORDERS — Auth required
// ═══════════════════════════════════════════════════
router.get("/my-orders", protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { user: req.user._id };
    if (status && status !== "all") query.status = status;

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("items.product", "name image price discountPrice")
      .lean();

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const enriched = orders.map((o) => {
      const idx = statusFlow.indexOf(o.status);
      return {
        ...o,
        progress: o.status === "cancelled" || o.status === "returned" ? 0 : Math.round((idx / (statusFlow.length - 1)) * 100),
      };
    });

    res.json({ success: true, orders: enriched, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders." });
  }
});

// ═══════════════════════════════════════════════════
// GET SINGLE ORDER — Auth required
// ═══════════════════════════════════════════════════
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
      .populate("items.product", "name image price discountPrice")
      .lean();

    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const idx = statusFlow.indexOf(order.status);

    res.json({
      success: true,
      order: {
        ...order,
        progress: order.status === "cancelled" || order.status === "returned" ? 0 : Math.round((idx / (statusFlow.length - 1)) * 100),
      },
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch order." });
  }
});

// ═══════════════════════════════════════════════════
// UPDATE ORDER STATUS — Admin only
// ═══════════════════════════════════════════════════
router.patch("/:id/status", protect, isAdmin, async (req, res) => {
  try {
    const { status, trackingNumber, estimatedDelivery, cancelReason, notes } = req.body;

    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) return res.status(404).json({ success: false, message: "Order not found." });

    const previousStatus = existingOrder.status;

    const update = {};
    if (status) update.status = status;
    if (estimatedDelivery) update.estimatedDelivery = new Date(estimatedDelivery);
    if (cancelReason) update.cancelReason = cancelReason;
    if (notes) update.notes = notes;
    if (status === "delivered") update.deliveredAt = new Date();

    if (trackingNumber) {
      update.trackingNumber = trackingNumber;
    } else if (!existingOrder.trackingNumber && (status === "confirmed" || status === "shipped")) {
      update.trackingNumber = `TRK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    }

    const order = await Order.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate("items.product", "name image price discountPrice");

    let coinsCreditedCount = 0;

    // ✅ Credit earned coins when order is confirmed for the first time
    if (
      status === "confirmed" &&
      previousStatus !== "confirmed" &&
      !existingOrder.coinsCredited &&
      existingOrder.user
    ) {
      // Use amountPaid to calculate earned coins to avoid infinite coin loops
      coinsCreditedCount = await creditCoins(existingOrder.user, existingOrder.amountPaid, existingOrder._id);
    }

    // ✅ Handle Cancellation: Deduct earned coins AND Refund used coins
    if (
      status === "cancelled" &&
      previousStatus !== "cancelled" &&
      existingOrder.user
    ) {
      // 1. Deduct earned coins if they were previously credited
      if (existingOrder.coinsCredited) {
        await deductEarnedCoins(existingOrder.user, existingOrder.amountPaid, existingOrder._id);
      }

      // 2. Refund the coins the user spent on this order back to their wallet
      if (existingOrder.coinsUsed > 0) {
        await Wallet.findOneAndUpdate(
          { user: existingOrder.user },
          { $inc: { coins: existingOrder.coinsUsed } },
          { upsert: true }
        );
      }
    }

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const idx = statusFlow.indexOf(order.status);

    res.json({
      success: true,
      message: coinsCreditedCount > 0
        ? `Order confirmed & ${coinsCreditedCount} loyalty coins credited to customer!`
        : "Order updated successfully",
      order: {
        ...order.toObject(),
        progress: order.status === "cancelled" || order.status === "returned" ? 0 : Math.round((idx / (statusFlow.length - 1)) * 100),
      },
      coinsCredited: coinsCreditedCount,
    });
  } catch (error) {
    console.error("Update order error:", error);
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to update order." });
  }
});

// ═══════════════════════════════════════════════════
// CANCEL ORDER — User
// ═══════════════════════════════════════════════════
router.patch("/:id/cancel", protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in "${order.status}" status.`,
      });
    }

    order.status = "cancelled";
    order.cancelReason = reason || "Cancelled by customer";
    await order.save();

    if (order.user) {
      // ✅ Deduct earned coins if they were credited
      if (order.coinsCredited) {
        await deductEarnedCoins(order.user, order.amountPaid, order._id);
      }

      // ✅ Refund used coins back to the customer's wallet
      if (order.coinsUsed > 0) {
        await Wallet.findOneAndUpdate(
          { user: order.user },
          { $inc: { coins: order.coinsUsed } },
          { upsert: true }
        );
      }
    }

    res.json({ success: true, message: "Order cancelled successfully.", order });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel order." });
  }
});

// ═══════════════════════════════════════════════════
// GET ALL ORDERS — Admin only
// ═══════════════════════════════════════════════════
router.get("/", protect, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    if (status && status !== "all") query.status = status;

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("user", "name email")
      .lean();

    res.json({ success: true, orders, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error("Get all orders error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders." });
  }
});

export default router;