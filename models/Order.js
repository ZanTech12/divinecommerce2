
import mongoose from "mongoose";

const { Schema } = mongoose;

// ==========================================
// ORDER ITEM SCHEMA
// ==========================================

const orderItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  discountPrice: {
    type: Number
  },
  sku: {
    type: String
  },
  variant: {
    size: { type: String },
    color: { type: String }
  }
}, { _id: false });

// ==========================================
// SHIPPING ADDRESS SCHEMA
// ==========================================

const shippingAddressSchema = new Schema({
  fullName: {
    type: String,
    required: true
  },
  street: {
    type: String,
    required: true
  },
  apartment: {
    type: String
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  zipCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  }
}, { _id: false });

// ==========================================
// WHATSAPP PAYMENT NOTIFICATION SCHEMA
// ==========================================

const whatsappPaymentNotificationSchema = new Schema({
  status: {
    type: String,
    enum: ["pending", "sent", "failed", "not_required"],
    default: "not_required"
  },
  sentAt: {
    type: Date,
    default: null
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  }
}, { _id: false });

// ==========================================
// MAIN ORDER SCHEMA
// ==========================================

const orderSchema = new Schema({

  orderNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },

  // ==========================================
  // CUSTOMER INFORMATION
  // ==========================================

  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  guestEmail: {
    type: String,
    lowercase: true,
    trim: true
  },

  whatsappPhone: {
    type: String,
    default: null,
    index: true
  },

  items: [orderItemSchema],

  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },

  // ==========================================
  // PRICING
  // ==========================================

  subtotal: {
    type: Number,
    required: true
  },

  shippingCost: {
    type: Number,
    default: 0
  },

  tax: {
    type: Number,
    default: 0
  },

  discount: {
    type: Number,
    default: 0
  },

  totalAmount: {
    type: Number,
    required: true
  },

  // ==========================================
  // PAYMENT INFORMATION
  // ==========================================

  paymentMethod: {
    type: String,
    default: "pending",
    lowercase: true,
    trim: true
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "refunded"],
    default: "pending"
  },

  paymentGateway: {
    type: String,
    default: null
  },

  paymentReference: {
    type: String,
    default: null,
    index: true
  },

  paystackReference: {
    type: String,
    default: null
  },

  bankTransferReference: {
    type: String,
    default: null
  },

  // Monnify reference.
  // Only actual string references must be unique.
  monnifyPaymentReference: {
    type: String,
    default: null
  },

  monnifyTransactionReference: {
    type: String,
    default: null
  },

  paidAt: {
    type: Date,
    default: null
  },

  // ==========================================
  // ORDER STATUS & TRACKING
  // ==========================================

  status: {
    type: String,
    enum: [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "returned"
    ],
    default: "pending"
  },

  trackingNumber: {
    type: String,
    uppercase: true,
    sparse: true
  },

  estimatedDelivery: {
    type: Date
  },

  deliveredAt: {
    type: Date
  },

  // ==========================================
  // LOYALTY COINS
  // ==========================================

  coinsCredited: {
    type: Boolean,
    default: false
  },

  coinsUsed: {
    type: Number,
    default: 0
  },

  coinDiscount: {
    type: Number,
    default: 0
  },

  amountPaid: {
    type: Number,
    default: 0
  },

  // ==========================================
  // WHATSAPP PAYMENT NOTIFICATION
  // ==========================================

  whatsappPaymentNotification: {
    type: whatsappPaymentNotificationSchema,
    default: () => ({})
  },

  // ==========================================
  // METADATA
  // ==========================================

  cancelReason: {
    type: String
  },

  notes: {
    type: String
  }

}, {
  timestamps: true
});

// ==========================================
// INDEXES
// ==========================================

// Prevent duplicate actual Monnify payment references.
// Multiple null or missing references are allowed.

orderSchema.index(
  { monnifyPaymentReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      monnifyPaymentReference: { $type: "string" }
    },
    name: "monnifyPaymentReference_1"
  }
);

// ==========================================
// BACKWARD COMPATIBILITY
// Preserve existing Paystack and coins logic.
// ==========================================

orderSchema.pre("validate", function () {

  if (
    this.paymentMethod === "paystack" &&
    this.paystackReference
  ) {
    this.paymentGateway = "paystack";
    this.paymentReference = this.paystackReference;
    this.paymentStatus = "paid";
    this.paidAt = this.paidAt || new Date();
  }

  if (this.paymentMethod === "coins") {
    this.paymentStatus = "paid";
    this.paymentGateway = "coins";
    this.paidAt = this.paidAt || new Date();
  }

  if (this.paymentMethod === "monnify") {
    this.paymentGateway = "monnify";

    if (!this.paymentStatus) {
      this.paymentStatus = "pending";
    }
  }

});

// ==========================================
// EXPORT MODEL
// ==========================================

export default mongoose.model("Order", orderSchema);
