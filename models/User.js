// models/User.js
import mongoose from "mongoose";
import crypto from "crypto";
// ✅ FIX: Import at the top of the file (ES Modules don't support require())
import { PERMISSION_KEYS } from "../config/permissions.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [function () {
        return this.isNew;
      }, "Please provide a phone number"],
      unique: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\+?0?[1-9]\d{8,13}$/.test(v);
        },
        message: (props) => `${props.value} is not a valid phone number!`,
      },
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["user", "admin", "sales_rep", "engineer"],
      default: "user",
    },
    // ──────────────────────────────────────────────
    // NEW: granular permissions for sales_rep role
    // Empty array  → no admin page access
    // Populated    → can access only those pages
    // Admin role   → permissions field is IGNORED 
    //                 (admin always has full access)
    // ──────────────────────────────────────────────
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: function (perms) {
          // Only relevant for sales_rep
          if (this.role !== "sales_rep") return true;
          // ✅ FIX: Use the imported PERMISSION_KEYS instead of require()
          return perms.every((p) => PERMISSION_KEYS.includes(p));
        },
        message: "One or more permission keys are invalid.",
      },
    },
    // Track who created this sales rep
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
      select: false,
    },
    coins: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", function () {
  if (!this.isModified("password")) return;

  this.password = crypto
    .createHash("sha256")
    .update(this.password)
    .digest("hex");
});

userSchema.methods.matchPassword = function (enteredPassword) {
  const hashed = crypto
    .createHash("sha256")
    .update(enteredPassword)
    .digest("hex");
  return this.password === hashed;
};

export default mongoose.model("User", userSchema);