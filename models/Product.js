
import mongoose from "mongoose";

const productSchema = new mongoose.Schema({

  // ==========================================
  // PRODUCT INFORMATION
  // ==========================================

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    required: true,
    trim: true
  },

  // ==========================================
  // PRICING
  // ==========================================

  price: {
    type: Number,
    required: true,
    min: 0
  },

  discountPrice: {
    type: Number,
    default: null,
    min: 0,
    validate: {
      validator: function(value) {
        if (value === null || value === undefined) {
          return true;
        }

        return value > 0 && value < this.price;
      },
      message: "Discount price must be greater than zero and lower than the normal price."
    }
  },

  // Internal cost price.
  // Never expose this field through public APIs.

  engineeringPrice: {
    type: Number,
    default: null,
    min: 0,
    select: false
  },

  // ==========================================
  // PRODUCT CLASSIFICATION
  // ==========================================

  category: {
    type: String,
    required: true,
    trim: true
  },

  brand: {
    type: String,
    default: "",
    trim: true
  },

  sku: {
    type: String,
    default: "",
    trim: true,
    uppercase: true
  },

  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],

  // ==========================================
  // PRODUCT IMAGES
  // ==========================================

  image: {
    type: String,
    default: ""
  },

  images: [{
    type: String
  }],

  // ==========================================
  // INVENTORY MANAGEMENT
  // ==========================================

  countInStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "Stock quantity must be a whole number."
    }
  },

  // ==========================================
  // PRODUCT RATINGS
  // ==========================================

  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  numReviews: {
    type: Number,
    default: 0,
    min: 0
  },

  // ==========================================
  // PRODUCT PROMOTIONS
  // ==========================================

  isFeatured: {
    type: Boolean,
    default: false
  },

  isNewArrival: {
    type: Boolean,
    default: false
  },

  isFlashSale: {
    type: Boolean,
    default: false
  },

  // ==========================================
  // PRODUCT VISIBILITY
  // ==========================================

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // ==========================================
  // SALES REPRESENTATIVE
  // ==========================================

  assignedSalesRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    select: false
  }

}, {
  timestamps: true
});

// ==========================================
// INDEXES
// ==========================================

// Product search and filtering.
productSchema.index({
  name: "text",
  description: "text",
  brand: "text",
  category: "text",
  tags: "text",
  sku: "text"
});

// Category filtering.
productSchema.index({
  category: 1,
  isActive: 1
});

// Featured products.
productSchema.index({
  isFeatured: 1,
  isActive: 1
});

// New arrivals.
productSchema.index({
  isNewArrival: 1,
  isActive: 1
});

// Flash sales.
productSchema.index({
  isFlashSale: 1,
  isActive: 1
});

// ==========================================
// EXPORT MODEL
// ==========================================

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema);

export default Product;
