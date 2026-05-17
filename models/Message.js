// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    bg: {
      type: String,
      required: [true, "Background gradient or color is required"],
      default: "linear-gradient(135deg, #f68b1e 0%, #e8590c 100%)",
    },
    tag: {
      type: String,
      required: [true, "Tag label is required"],
      trim: true,
      maxlength: [30, "Tag cannot exceed 30 characters"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    sub: {
      type: String,
      trim: true,
      maxlength: [200, "Subtitle cannot exceed 200 characters"],
      default: "",
    },
    price: {
      type: String,
      trim: true,
      maxlength: [100, "Price text cannot exceed 100 characters"],
      default: "",
    },
    img: {
      type: String,
      trim: true,
      default: "",
    },
    link: {
      type: String,
      trim: true,
      default: "/products",
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for sorting by order
messageSchema.index({ order: 1 });

export default mongoose.model("Message", messageSchema);