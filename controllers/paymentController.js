// controllers/paymentController.js
import User from '../models/User.js';

// ✅ Helper: Calculate coins earned (1 coin per ₦10,000 spent)
const calculateCoinsEarned = (amountInNaira) => {
  return Math.floor(amountInNaira / 10000);
};

// ✅ Paystack Webhook Endpoint
export const paystackWebhook = async (req, res) => {
  // 1. Validate Paystack Signature (SECURITY CRITICAL)
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                     .update(JSON.stringify(req.body))
                     .digest('hex');
                     
  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).send('Invalid signature');
  }

  const event = req.body;

  // 2. Handle successful charge
  if (event.event === 'charge.success') {
    const { email, amount } = event.data; // Paystack amount is in KOBO (₦1 = 100 kobo)
    const amountInNaira = amount / 100;

    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(200).send('User not found'); // Return 200 so Paystack doesn't retry

      const earnedCoins = calculateCoinsEarned(amountInNaira);

      if (earnedCoins > 0) {
        user.coins += earnedCoins;
        await user.save();
        console.log(`Awarded ${earnedCoins} coins to ${email}`);
      }

      return res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).send('Server error');
    }
  }

  res.status(200).send('Event ignored');
};

// ✅ Endpoint to fetch user's current coin balance
export const getCoinBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('coins');
    res.json({ 
      coins: user.coins, 
      valueInNaira: user.coins * 100 // 1 Coin = ₦100
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};