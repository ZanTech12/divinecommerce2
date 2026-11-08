import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    // PRODUCT INFORMATION
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

    // PRICING
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
        validator: function (value) {
          if (value === null || value === undefined) return true;
          return value > 0 && value < this.price;
        },
        message:
          'Discount price must be greater than zero and lower than the normal price.'
      }
    },

    // Internal cost price: never expose through public APIs.
    engineeringPrice: {
      type: Number,
      default: null,
      min: 0,
      select: false
    },

    // PRODUCT CLASSIFICATION
    category: {
      type: String,
      required: true,
      trim: true
    },

    brand: {
      type: String,
      default: '',
      trim: true
    },

    sku: {
      type: String,
      default: '',
      trim: true,
      uppercase: true
    },

    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],

    // PRODUCT IMAGES
    image: {
      type: String,
      default: ''
    },

    images: [
      {
        type: String
      }
    ],

    // INVENTORY
    countInStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Stock quantity must be a whole number.'
      }
    },

    // RATINGS
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

    // PROMOTIONS
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

    // VISIBILITY
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    // SALES REPRESENTATIVE
    assignedSalesRep: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      select: false
    }
  },
  {
    timestamps: true
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Text search.
productSchema.index({
  name: 'text',
  description: 'text',
  brand: 'text',
  category: 'text',
  tags: 'text',
  sku: 'text'
});

// Category filtering and newest-first listings.
productSchema.index({
  category: 1,
  isActive: 1,
  createdAt: -1
});

// Main public product listing.
productSchema.index({
  isActive: 1,
  createdAt: -1
});

// Common storefront sorting.
productSchema.index({
  isActive: 1,
  price: 1
});

productSchema.index({
  isActive: 1,
  price: -1
});

productSchema.index({
  isActive: 1,
  name: 1
});

productSchema.index({
  isActive: 1,
  rating: -1
});

// Promotion filters.
productSchema.index({
  isActive: 1,
  isFeatured: 1,
  createdAt: -1
});

productSchema.index({
  isActive: 1,
  isNewArrival: 1,
  createdAt: -1
});

productSchema.index({
  isActive: 1,
  isFlashSale: 1,
  createdAt: -1
});

// Discount products.
productSchema.index({
  isActive: 1,
  discountPrice: 1,
  createdAt: -1
});

// ==========================================
// EXPORT MODEL
// ==========================================

const Product =
  mongoose.models.Product ||
  mongoose.model('Product', productSchema);

export default Product;