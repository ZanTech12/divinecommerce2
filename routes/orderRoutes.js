// routes/orderRoutes.js
import express from "express";
import Order from "../models/Order.js";
import User from "../models/User.js"; // ✅ ADDED: Import User model to fetch full user details
import { protect, isAdmin } from "../middleware/authMiddleware.js";
import { sendOrderConfirmationEmail } from "../utils/sendEmail.js";

const router = express.Router();

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
      paymentMethod, 
      paystackReference, 
      customerEmail, 
      // ✅ REMOVED: status — backend decides this, never trust frontend
      shippingAddress 
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Cannot place an empty order." 
      });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street) {
      return res.status(400).json({ 
        success: false, 
        message: "A valid shipping address is required." 
      });
    }

    const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    // ✅ FIX: Backend determines status based on payment method
    // "paid" is NOT a valid enum — use "confirmed" for paid orders
    let orderStatus = "pending";
    if (paymentMethod === "paystack" && paystackReference) {
      orderStatus = "confirmed";
    }

    const newOrder = new Order({
      user: req.user._id, 
      orderNumber,               
      items,
      // ✅ FIX: Ensure email is saved inside shippingAddress if sent from frontend
      shippingAddress: {
        ...shippingAddress,
        email: shippingAddress.email || customerEmail || undefined
      },       
      subtotal,
      shippingCost: deliveryFee || 0,         
      totalAmount: total,                     
      paymentMethod,
      paystackReference: paystackReference || null,
      
      // ✅ FIX: Save customerEmail properly for the fallback chain
      guestEmail: customerEmail || shippingAddress?.email || null, 
      
      status: orderStatus,  // ✅ FIX: Backend-controlled, never from req.body
    });

    const savedOrder = await newOrder.save();

    // ✅ FIX: Fetch the full user from DB to get their email address
    // req.user only has the _id and role from the JWT token, it lacks the email!
    const fullUser = await User.findById(req.user._id).select('name email');

    // ✅ SEND ORDER CONFIRMATION EMAIL
    try {
      await sendOrderConfirmationEmail(savedOrder, fullUser);
    } catch (emailError) {
      console.error("Order confirmation email failed:", emailError.message);
    }

    res.status(201).json({ 
      success: true, 
      order: savedOrder 
    });

  } catch (error) {
    console.error("Create order error:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error while placing order." 
    });
  }
});

// ═══════════════════════════════════════════════════
// TRACK ORDER — Public (guests + logged-in users)
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
      return res.status(404).json({
        success: false,
        message: "No order found with the provided information. Please double-check and try again.",
      });
    }

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const currentIndex = statusFlow.indexOf(order.status);
    const progress = order.status === "cancelled" || order.status === "returned"
      ? 0
      : Math.round((currentIndex / (statusFlow.length - 1)) * 100);

    // ✅ FIX: Safely check req.user (may not exist on public route)
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
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
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

    res.json({
      success: true,
      orders: enriched,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
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

    const statusFlow = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    const idx = statusFlow.indexOf(order.status);

    res.json({
      success: true,
      message: "Order updated successfully",
      order: {
        ...order.toObject(),
        progress: order.status === "cancelled" || order.status === "returned" ? 0 : Math.round((idx / (statusFlow.length - 1)) * 100),
      },
    });
  } catch (error) {
    console.error("Update order error:", error);
    if (error.name === "ValidationError") return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({ success: false, message: "Failed to update order." });
  }
});

// ═══════════════════════════════════════════════════
// CANCEL ORDER — User (only pending/confirmed orders)
// ═══════════════════════════════════════════════════
router.patch("/:id/cancel", protect, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in "${order.status}" status. Only pending or confirmed orders can be cancelled.`,
      });
    }

    order.status = "cancelled";
    order.cancelReason = reason || "Cancelled by customer";
    await order.save();

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

    res.json({
      success: true,
      orders,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get all orders error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders." });
  }
});

export default router;