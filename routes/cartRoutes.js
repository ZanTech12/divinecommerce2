// routes/cartRoutes.js
import express from 'express';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import User from '../models/User.js'; 
// Import both protect and requirePermission in case you add admin-override routes later
import { protect, requirePermission } from '../middleware/authMiddleware.js'; 
import { sendCartReminderToUser, sendAbandonedCartAlertToAdmin } from '../utils/sendEmail.js';

const router = express.Router();

// In-memory Map to track 2-minute timers per user ID
const cartEmailTimers = new Map(); 

// Helper function to format cart response
const formatCartResponse = (cart) => {
  if (!cart) return { cartItems: [], totalPrice: 0, totalQty: 0 };
  const availableItems = cart.cartItems.filter(item => item.product);
  
  // Calculate total using discountPrice if it exists
  const totalPrice = availableItems.reduce((acc, item) => {
    const effectivePrice = item.discountPrice && item.discountPrice < item.price ? item.discountPrice : item.price;
    return acc + (effectivePrice * item.quantity);
  }, 0);
  
  const totalQty = availableItems.reduce((acc, item) => acc + item.quantity, 0);
  return { cartItems: availableItems, totalPrice, totalQty };
};

// ==========================================
// GENERAL ROUTES (Logged-in User's Own Cart)
// ==========================================

// @route   GET /api/cart
router.get('/', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate('cartItems.product', 'countInStock');
    res.json(formatCartResponse(cart));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/cart
router.post('/', protect, async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.countInStock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        cartItems: [{ product: productId, name: product.name, image: product.image, price: product.price, discountPrice: product.discountPrice || 0, quantity, addedAt: new Date() }]
      });
    } else {
      const existingItemIndex = cart.cartItems.findIndex(item => item.product.toString() === productId);
      if (existingItemIndex > -1) {
        const newQty = cart.cartItems[existingItemIndex].quantity + quantity;
        if (product.countInStock < newQty) return res.status(400).json({ message: 'Insufficient stock' });
        cart.cartItems[existingItemIndex].quantity = newQty;
      } else {
        cart.cartItems.push({ product: productId, name: product.name, image: product.image, price: product.price, discountPrice: product.discountPrice || 0, quantity, addedAt: new Date() });
      }
      await cart.save();
    }

    // Fixed Timer Logic
    const userIdStr = req.user._id.toString();

    if (cartEmailTimers.has(userIdStr)) {
      clearTimeout(cartEmailTimers.get(userIdStr));
    }

    const timerId = setTimeout(async () => {
      try {
        const freshUser = await User.findById(userIdStr);
        const latestCart = await Cart.findOne({ user: userIdStr });
        
        if (freshUser && latestCart && latestCart.cartItems.length > 0) {
          const totalPrice = latestCart.cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          
          await Promise.all([
            sendCartReminderToUser(freshUser, latestCart.cartItems, totalPrice),
            sendAbandonedCartAlertToAdmin(freshUser, latestCart.cartItems, totalPrice)
          ]);

          console.log(`✅ Cart reminders sent for user: ${freshUser.email}`);
        }
      } catch (emailError) {
        console.error(`Failed to send cart emails:`, emailError);
      } finally {
        cartEmailTimers.delete(userIdStr);
      }
    }, 2 * 60 * 1000); 

    cartEmailTimers.set(userIdStr, timerId);

    const populatedCart = await Cart.findOne({ user: req.user._id }).populate('cartItems.product', 'countInStock');
    return res.status(201).json(formatCartResponse(populatedCart));

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/cart/:productId
router.put('/:productId', protect, async (req, res) => {
  const { quantity } = req.body;
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    
    const itemIndex = cart.cartItems.findIndex(item => item.product.toString() === req.params.productId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not in cart' });
    
    if (quantity <= 0) { 
      cart.cartItems.splice(itemIndex, 1); 
    } else { 
      cart.cartItems[itemIndex].quantity = quantity;
      
      const currentProduct = await Product.findById(req.params.productId);
      if (currentProduct) {
        cart.cartItems[itemIndex].price = currentProduct.price;
        cart.cartItems[itemIndex].discountPrice = currentProduct.discountPrice || 0;
      }
    }
    
    await cart.save();
    const populatedCart = await Cart.findOne({ user: req.user._id }).populate('cartItems.product', 'countInStock');
    res.status(200).json(formatCartResponse(populatedCart));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/cart/:productId
router.delete('/:productId', protect, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    cart.cartItems = cart.cartItems.filter(item => item.product.toString() !== req.params.productId);
    await cart.save();
    const populatedCart = await Cart.findOne({ user: req.user._id }).populate('cartItems.product', 'countInStock');
    res.status(200).json(formatCartResponse(populatedCart));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/cart
router.delete('/', protect, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ user: req.user._id });
    res.json({ cartItems: [], totalPrice: 0, totalQty: 0, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;