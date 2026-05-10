// routes/userRoutes.js
import express from "express";
import User from "../models/User.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js"; // ✅ ADD THIS IMPORT
import { protect, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET ALL USERS (Admin only)
router.get("/", protect, isAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select("-password");

    res.json({
      success: true,
      users,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
});

// GET USER CART (Admin only)
router.get("/:userId/cart", protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("name email");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const cart = await Cart.findOne({ user: req.params.userId })
      .populate("cartItems.product", "name images price countInStock");

    if (!cart || !cart.cartItems || cart.cartItems.length === 0) {
      return res.json({ success: true, cart: { items: [] } });
    }

    const items = cart.cartItems.map(item => ({
      _id: item._id,
      product: item.product ? {
        _id: item.product._id,
        name: item.product.name,
        images: item.product.images || [],
        price: item.product.price,
        countInStock: item.product.countInStock
      } : null,
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      price: item.price,
      addedAt: item.addedAt || cart.updatedAt
    }));

    items.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    res.json({
      success: true,
      cart: { items }
    });
  } catch (error) {
    console.error("Get user cart error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user cart." });
  }
});

// UPDATE/EDIT USER (Admin only)
router.put("/:id", protect, isAdmin, async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user._id.toString() === req.user._id.toString() && role && role !== user.role) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own admin role."
      });
    }

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "Email is already in use by another account." });
      }
      user.email = email.toLowerCase();
    }

    if (phone && phone !== user.phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: "Phone number is already in use by another account." });
      }
      user.phone = phone;
    }

    if (name) user.name = name;
    if (role) user.role = role;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long."
        });
      }
      user.password = password;
    }

    await user.save();

    const updatedUser = await User.findById(user._id).select("-password");

    res.json({
      success: true,
      message: `User "${updatedUser.name}" updated successfully.`,
      user: updatedUser
    });
  } catch (error) {
    console.error("Update user error:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Failed to update user." });
  }
});

// DELETE USER (Admin only)
router.delete("/:id", protect, isAdmin, async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);

    if (!userToDelete) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (userToDelete._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own admin account."
      });
    }

    // ✅ DELETE user's cart
    const deletedCart = await Cart.findOneAndDelete({ user: req.params.id });

    // ✅ DELETE all user's orders
    const deletedOrders = await Order.deleteMany({ user: req.params.id });

    // ✅ DELETE the user
    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: `User "${userToDelete.name}" has been deleted along with their cart and ${deletedOrders.deletedCount} order(s).`,
      deletedCart: !!deletedCart,
      deletedOrdersCount: deletedOrders.deletedCount
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Failed to delete user." });
  }
});

export default router;