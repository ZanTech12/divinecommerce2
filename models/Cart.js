import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: 'Product' 
  },
  name: { type: String, required: true },
  image: { type: String, required: true },
  price: { type: Number, required: true },
  discountPrice: { type: Number, default: 0 }, // ✅ ADDED DISCOUNT PRICE
  quantity: { type: Number, required: true, default: 1 },
  addedAt: { 
    type: Date, 
    default: Date.now 
  },
});

const cartSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    unique: true 
  },
  cartItems: [cartItemSchema],
}, { timestamps: true });

export default mongoose.model('Cart', cartSchema);