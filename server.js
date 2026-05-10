// ✅ THIS IMPORT MUST BE THE ABSOLUTE FIRST LINE
import './setEnv.js';

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import siteSettingsRoutes from './routes/siteSettings.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import User from './models/User.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

// ✅ UPDATED CORS CONFIGURATION
// Replace 192.168.1.15 with the actual local IP address of your computer
const allowedOrigins = [
  'http://172.29.136.57:3000',//ing on your computer
  'http://192.168.1.15:5173/api',   // For testing on your phone
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      // Origin is allowed
      callback(null, true);
    } else {
      // Origin is not allowed
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Optional: only add this if you are sending cookies/sessions
}));
// ✅ END OF CORS CONFIGURATION

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/site-settings', siteSettingsRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/users', userRoutes);

// Seed demo users
async function seedDemoUsers() {
  const demoAccounts = [
    { name: "MallHub Admin", email: "admin@mallhub.com", phone: "+23481100001", password: "admin123", role: "admin", isVerified: true },
    { name: "Demo User", email: "user@mallhub.com", phone: "+2348000000002", password: "user123", role: "user", isVerified: true }
  ];

  for (const acc of demoAccounts) {
    const exists = await User.findOne({ email: acc.email });
    if (!exists) {
      await User.create(acc);
      console.log(`  🌱 Seeded: ${acc.email} (${acc.role})`);
    }
  }
}

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seedDemoUsers();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://0.0.0.0:${PORT}`));
});