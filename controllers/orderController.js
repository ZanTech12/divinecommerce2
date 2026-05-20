// controllers/orderController.js
import Order from '../models/Order.js';
import Activity from '../models/Activity.js'; // ✅ IMPORT

// ... inside your addOrderItems function ...
export const addOrderItems = async (req, res) => {
  try {
    const { orderItems, shippingAddress, paymentMethod, itemsPrice, taxPrice, shippingPrice, totalPrice } = req.body;

    if (orderItems && orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    } else {
      const order = new Order({
        orderItems,
        user: req.user._id,
        shippingAddress,
        paymentMethod,
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice,
      });

      const createdOrder = await order.save();

      // ✅ LOG THE ACTIVITY (Fire and forget)
      Activity.create({
        type: "order",
        message: `New order #${createdOrder._id.toString().slice(-6).toUpperCase()} placed by ${req.user.name || 'User'} (₦${totalPrice.toLocaleString()})`,
        referenceId: createdOrder._id,
        performedBy: req.user._id
      }).catch(err => console.error("Activity Log Error:", err));

      res.status(201).json(createdOrder);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};