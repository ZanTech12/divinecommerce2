// routes/userRoutes.js
import express from "express";
import User from "../models/User.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import {
  protect,
  isAdmin,
  isAdminOrSalesRep,
  requirePermission,
} from "../middleware/authMiddleware.js";
import { PERMISSION_KEYS, ADMIN_ONLY_PERMISSIONS } from "../config/permissions.js";

const router = express.Router();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET ALL USERS (Admin & Sales Rep with permission)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get(
  "/",
  protect,
  requirePermission("manage_users"),
  async (req, res) => {
    try {
      const { search, role, page = 1, limit = 20 } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ];
      }

      if (role) {
        query.role = role;
      }

      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .select("-password -otp -otpExpires");

      res.json({
        success: true,
        users,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    } catch (error) {
      console.error("Get users error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch users." });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET USER CART (Admin & Sales Rep with permission)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get(
  "/:userId/cart",
  protect,
  requirePermission("view_user_carts"),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select("name email");
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      const cart = await Cart.findOne({ user: req.params.userId }).populate(
        "cartItems.product",
        "name images price countInStock"
      );

      if (!cart || !cart.cartItems || cart.cartItems.length === 0) {
        return res.json({ success: true, cart: { items: [] } });
      }

      const items = cart.cartItems.map((item) => ({
        _id: item._id,
        product: item.product
          ? {
              _id: item.product._id,
              name: item.product.name,
              images: item.product.images || [],
              price: item.product.price,
              countInStock: item.product.countInStock,
            }
          : null,
        name: item.name,
        image: item.image,
        quantity: item.quantity,
        price: item.price,
        addedAt: item.addedAt || cart.updatedAt,
      }));

      items.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

      res.json({ success: true, cart: { items } });
    } catch (error) {
      console.error("Get user cart error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch user cart." });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREATE SALES REPRESENTATIVE (Admin only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/sales-rep", protect, isAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, permissions } = req.body;

    // ─── Validation ───
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Check duplicates
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is already in use.",
      });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is already in use.",
      });
    }

    // Validate permissions array
    const grantedPermissions = Array.isArray(permissions) ? permissions : [];

    const invalidPerms = grantedPermissions.filter(
      (p) => !PERMISSION_KEYS.includes(p)
    );
    if (invalidPerms.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid permission(s): ${invalidPerms.join(", ")}`,
      });
    }

    // Remove admin-only permissions from the granted list
    const safePermissions = grantedPermissions.filter(
      (p) => !ADMIN_ONLY_PERMISSIONS.includes(p)
    );
    const removedPerms = grantedPermissions.filter((p) =>
      ADMIN_ONLY_PERMISSIONS.includes(p)
    );

    // ─── Create ───
    const salesRep = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: "sales_rep",
      permissions: safePermissions,
      isVerified: true, // Auto-verify sales reps
      createdBy: req.user._id,
    });

    const created = await User.findById(salesRep._id).select(
      "-password -otp -otpExpires"
    );

    const response = {
      success: true,
      message: `Sales representative "${created.name}" created successfully.`,
      salesRep: created,
    };

    if (removedPerms.length > 0) {
      response.warning = `The following admin-only permissions were removed: ${removedPerms.join(", ")}`;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Create sales rep error:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ success: false, message: error.message });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${
          field.charAt(0).toUpperCase() + field.slice(1)
        } already exists.`,
      });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create sales representative." });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UPDATE SALES REP PERMISSIONS (Admin only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put(
  "/:id/permissions",
  protect,
  isAdmin,
  async (req, res) => {
    try {
      const { permissions } = req.body;
      const user = await User.findById(req.params.id);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      if (user.role !== "sales_rep") {
        return res.status(400).json({
          success: false,
          message: "Permissions can only be updated for sales representatives.",
        });
      }

      // Validate
      const newPermissions = Array.isArray(permissions) ? permissions : [];

      const invalidPerms = newPermissions.filter(
        (p) => !PERMISSION_KEYS.includes(p)
      );
      if (invalidPerms.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid permission(s): ${invalidPerms.join(", ")}`,
        });
      }

      // Strip admin-only permissions
      const safePermissions = newPermissions.filter(
        (p) => !ADMIN_ONLY_PERMISSIONS.includes(p)
      );

      user.permissions = safePermissions;
      await user.save();

      const updated = await User.findById(user._id).select(
        "-password -otp -otpExpires"
      );

      res.json({
        success: true,
        message: `Permissions updated for "${updated.name}".`,
        salesRep: updated,
      });
    } catch (error) {
      console.error("Update permissions error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update permissions.",
      });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET ALL SALES REPRESENTATIVES (Admin only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/sales-reps/list", protect, isAdmin, async (req, res) => {
  try {
    const salesReps = await User.find({ role: "sales_rep" })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .select("-password -otp -otpExpires");

    res.json({ success: true, salesReps });
  } catch (error) {
    console.error("Get sales reps error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch sales representatives." });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UPDATE/EDIT USER (Admin & Sales Rep with permission)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put(
  "/:id",
  protect,
  requirePermission("manage_users"),
  async (req, res) => {
    try {
      const { name, email, phone, role, password, permissions } = req.body;
      const user = await User.findById(req.params.id);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      // Self-demotion check
      if (
        user._id.toString() === req.user._id.toString() &&
        role &&
        role !== user.role
      ) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own role.",
        });
      }

      // Sales reps cannot promote anyone to admin
      if (
        req.user.role === "sales_rep" &&
        role === "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot promote users to admin.",
        });
      }

      // Sales reps cannot edit other admins
      if (
        req.user.role === "sales_rep" &&
        user.role === "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot edit admin accounts.",
        });
      }

      // Sales reps cannot change permissions (only admin can)
      if (
        req.user.role === "sales_rep" &&
        permissions !== undefined
      ) {
        return res.status(403).json({
          success: false,
          message: "Only admins can modify permissions.",
        });
      }

      if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        const existingEmail = await User.findOne({
          email: email.toLowerCase(),
        });
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: "Email is already in use by another account.",
          });
        }
        user.email = email.toLowerCase();
      }

      if (phone && phone !== user.phone) {
        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: "Phone number is already in use by another account.",
          });
        }
        user.phone = phone;
      }

      if (name) user.name = name;

      if (role) {
        if (!["user", "admin", "sales_rep", "engineer"].includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role.",
          });
        }
        user.role = role;
      }

      // Admin can update permissions for sales reps
      if (req.user.role === "admin" && permissions !== undefined && user.role === "sales_rep") {
        const safePermissions = Array.isArray(permissions)
          ? permissions.filter(
              (p) =>
                PERMISSION_KEYS.includes(p) &&
                !ADMIN_ONLY_PERMISSIONS.includes(p)
            )
          : [];
        user.permissions = safePermissions;
      }

      if (password) {
        if (password.length < 6) {
          return res.status(400).json({
            success: false,
            message: "Password must be at least 6 characters long.",
          });
        }
        user.password = password;
      }

      await user.save();

      const updatedUser = await User.findById(user._id).select(
        "-password -otp -otpExpires"
      );

      res.json({
        success: true,
        message: `User "${updatedUser.name}" updated successfully.`,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Update user error:", error);
      if (error.name === "ValidationError") {
        return res
          .status(400)
          .json({ success: false, message: error.message });
      }
      res
        .status(500)
        .json({ success: false, message: "Failed to update user." });
    }
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE USER (Admin & Sales Rep with permission)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete(
  "/:id",
  protect,
  requirePermission("manage_users"),
  async (req, res) => {
    try {
      const userToDelete = await User.findById(req.params.id);

      if (!userToDelete) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      // Self-deletion check
      if (userToDelete._id.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: "You cannot delete your own account.",
        });
      }

      // Sales reps cannot delete admins
      if (
        req.user.role === "sales_rep" &&
        userToDelete.role === "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot delete admin accounts.",
        });
      }

      // Sales reps cannot delete other sales reps (only admin can)
      if (
        req.user.role === "sales_rep" &&
        userToDelete.role === "sales_rep"
      ) {
        return res.status(403).json({
          success: false,
          message: "Only admins can delete sales representative accounts.",
        });
      }

      const deletedCart = await Cart.findOneAndDelete({
        user: req.params.id,
      });
      const deletedOrders = await Order.deleteMany({ user: req.params.id });
      await User.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: `User "${userToDelete.name}" has been deleted along with their cart and ${deletedOrders.deletedCount} order(s).`,
        deletedCart: !!deletedCart,
        deletedOrdersCount: deletedOrders.deletedCount,
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to delete user." });
    }
  }
);

export default router;