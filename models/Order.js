// models/Order.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  name: { type: String, required: true },
  image: { type: String },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  sku: { type: String },
  variant: {
    size: { type: String },
    color: { type: String },
  },
}, { _id: false });

const shippingAddressSchema = new Schema({
  fullName: { type: String, required: true },
  street: { type: String, required: true },
  apartment: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, lowercase: true, trim: true }, // ✅ ADDED EMAIL FALLBACK HERE
}, { _id: false });

const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true, uppercase: true },
  user: { type: Schema.Types.ObjectId, ref: "User", default: null },
  guestEmail: { type: String, lowercase: true, trim: true },
  items: [orderItemSchema],
  shippingAddress: { type: shippingAddressSchema, required: true },
  
  // Pricing
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },

  // Status & Tracking
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"],
    default: "pending",
  },
  trackingNumber: { type: String, uppercase: true, sparse: true },
  estimatedDelivery: { type: Date },
  deliveredAt: { type: Date },
  
  // Metadata
  cancelReason: { type: String },
  notes: { type: String },
}, {
  timestamps: true,
});

export default mongoose.model("Order", orderSchema);