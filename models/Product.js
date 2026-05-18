import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  engineeringPrice: { type: Number, default: null, select: false }, // Internal cost price (hidden from public by default)
  category: { type: String, required: true },
  image: { type: String, default: "" },
  images: [{ type: String }],
  countInStock: { type: Number, required: true, default: 0 },
  rating: { type: Number, default: 0 },
  numReviews: { type: Number, default: 0 },
  brand: { type: String, default: '' },
  sku: { type: String, default: '' },
  tags: [{ type: String }],
  isFeatured: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },
  isFlashSale: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  assignedSalesRep: {                    // ✅ NEW: Links a sales rep to this product
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    select: false,                       // Hidden from public by default
  },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

export default Product;