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
import activityRoutes from './routes/activityRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

// ✅ NEW: Import middleware to protect the upload route
import { protect, requirePermission } from './middleware/authMiddleware.js';

// ✅ NEW IMPORTS FOR IMAGE UPLOAD
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

const app = express();

// ✅ CLOUDINARY CONFIGURATION (SECURED WITH ENV VARIABLES)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const upload = multer();

// ✅ UPDATED CORS CONFIGURATION
const allowedOrigins = [
  // Local development
  'http://172.29.136.57:3000',
  'http://192.168.1.15:5173',
  'http://localhost:3000',
  'http://localhost:5173',
  
  // Production & Preview Vercel deployments
  'https://sulaitek1.vercel.app',
  'https://sulaitek1-git-main-zantechs-projects.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      // 🚨 CRITICAL FIX: Use `false` instead of `new Error()`
      // Throwing an error crashes the preflight response, causing the 0 B transferred bug
      callback(null, false); 
    }
  },
  credentials: true
};

// Apply CORS middleware (This automatically handles OPTIONS preflight requests!)
app.use(cors(corsOptions));

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
app.use('/api/activities', activityRoutes); 
app.use('/api/dashboard', dashboardRoutes);

// ✅ SECURED IMAGE UPLOAD ROUTE
app.post('/api/upload', protect, requirePermission('manage_products'), upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const uploadPromises = req.files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "products", resource_type: "image" },
            (error, result) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            }
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        })
    );

    const urls = await Promise.all(uploadPromises);
    res.status(200).json({ urls });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    res.status(500).json({ message: "Image upload failed" });
  }
});

// Seed demo users
async function seedDemoUsers() {
  const demoAccounts = [
    { name: "Sulaitek Communication Admin", email: "admin@Sulaitek Communication.com", phone: "+23481100001", password: "admin123", role: "admin", isVerified: true },
    { name: "Demo User", email: "user@Sulaitek Communication.com", phone: "+2348000000002", password: "user123", role: "user", isVerified: true },
    { 
      name: "Demo Sales Rep", 
      email: "sales@Sulaitek Communication.com", 
      phone: "+2348000000003", 
      password: "sales123", 
      role: "sales_rep", 
      isVerified: true, 
      permissions: ["manage_products", "manage_orders", "manage_categories"]
    }
  ];

  for (const acc of demoAccounts) {
    try {
      const exists = await User.findOne({ 
        $or: [{ email: acc.email }, { phone: acc.phone }] 
      });
      
      if (!exists) {
        await User.create(acc);
        console.log(`  🌱 Seeded: ${acc.email} (${acc.role})`);
      } else {
        await User.updateOne({ email: acc.email }, { $set: { permissions: acc.permissions || [] } });
        console.log(`  ⏭️ Skipped/Updated: ${acc.email} already exists`);
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