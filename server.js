// ✅ THIS IMPORT MUST BE THE ABSOLUTE FIRST LINE
import dotenv from 'dotenv';
dotenv.config();

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
import messageRoutes from './routes/messageRoutes.js';
import inviteRoutes from './routes/inviteRoutes.js';
import paymentRoutes from "./routes/paymentRoutes.js";


const app = express();


// ✅ UPDATED CORS CONFIGURATION
const allowedOrigins = [
  'http://172.29.136.57:3000',      // running on your computer
  'http://192.168.1.15:5173',       // ✅ FIX: Removed /api from the end
  'http://localhost:3000',
  'http://localhost:5173',           // Standard Vite local port added
  'https://ecommerce-indol-psi.vercel.app', // Your main production URL
  'https://afootechnology.com.ng',
  'https://www.afootechnology.com.ng',
  'www.afootechnology.com.ng'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is in our list OR if it's a Vercel preview deployment
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
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
app.use('/api/messages', messageRoutes);
app.use('/api/invites', inviteRoutes);
app.use("/api/payments", paymentRoutes);

// Seed demo users
async function seedDemoUsers() {
  const demoAccounts = [
    { name: "MallHub Admin", email: "admin@mallhub.com", phone: "+23481100001", password: "admin123", role: "admin", isVerified: true },
    { name: "Demo User", email: "user@mallhub.com", phone: "+2348000000002", password: "user123", role: "user", isVerified: true }
  ];

  for (const acc of demoAccounts) {
    try {
      // ✅ FIX: Check if EITHER the email OR the phone already exists
      const exists = await User.findOne({ 
        $or: [{ email: acc.email }, { phone: acc.phone }] 
      });
      
      if (!exists) {
        await User.create(acc);
        console.log(`  🌱 Seeded: ${acc.email} (${acc.role})`);
      } else {
        // Optional: Log why it was skipped
        if (exists.email === acc.email) {
          console.log(`  ⏭️ Skipped: ${acc.email} already exists`);
        } else if (exists.phone === acc.phone) {
          console.log(`  ⏭️ Skipped: Phone number ${acc.phone} already exists`);
        }
      }
    } catch (error) {
      console.error(`  ❌ Error seeding ${acc.email}:`, error.message);
    }
  }
}

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  await seedDemoUsers();
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on http://0.0.0.0:${PORT}`));
});