
import "dotenv/config";

import express from "express";
import cors from "cors";
import multer from "multer";
import streamifier from "streamifier";
import { v2 as cloudinary } from "cloudinary";

import connectDB from "./config/db.js";
import User from "./models/User.js";

// ==========================================
// ROUTES
// ==========================================

import authRoutes from "./routes/authRoutes.js";
import siteSettingsRoutes from "./routes/siteSettings.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import whatsappBotRoutes from "./routes/whatsappBotRoutes.js";

import {
  protect,
  requirePermission
} from "./middleware/authMiddleware.js";

// ==========================================
// EXPRESS
// ==========================================

const app = express();

app.disable("x-powered-by");

// ==========================================
// ROOT
// ==========================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "DIVINE SOLAR HUB API is running.",
    health: "/api/health"
  });
});

// ==========================================
// CLOUDINARY
// ==========================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// ==========================================
// CORS
// ==========================================

const allowedOrigins = [
  "https://shop.divinesolarhub.com",
  "https://divinesolarhub.com",
  "https://www.divinesolarhub.com",

  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:3001",

  "http://172.29.136.57:3000",
  "http://192.168.1.15:5173"
];

const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  : [];

const allAllowedOrigins = new Set([
  ...allowedOrigins,
  ...envOrigins
]);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allAllowedOrigins.has(origin);

    const isVercelPreview =
      process.env.ALLOW_VERCEL_ORIGINS === "true" &&
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

    if (isAllowed || isVercelPreview) {
      return callback(null, true);
    }

    console.warn("CORS blocked:", origin);

    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-bot-secret"
  ],

  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// ==========================================
// BODY PARSERS
// ==========================================

// Preserve Monnify's original webhook body.

app.use(express.json({
  limit: "1mb",

  verify: (req, res, buffer) => {
    const requestPath = req.originalUrl?.split("?")[0];

    if (
      requestPath === "/api/payments/monnify/webhook"
    ) {
      req.rawBody = Buffer.from(buffer);
    }
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: "1mb"
}));

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "DIVINE SOLAR HUB API is running.",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// DATABASE MIDDLEWARE
// ==========================================

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error.message
    );

    return res.status(503).json({
      success: false,
      message: "Database connection failed. Please try again."
    });
  }
});

// ==========================================
// API ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

app.use("/api/site-settings", siteSettingsRoutes);

app.use("/api/categories", categoryRoutes);

app.use("/api/products", productRoutes);

app.use("/api/cart", cartRoutes);

app.use("/api/orders", orderRoutes);

app.use("/api/users", userRoutes);

app.use("/api/messages", messageRoutes);

app.use("/api/invites", inviteRoutes);

app.use("/api/payments", paymentRoutes);

app.use("/api/activities", activityRoutes);

app.use("/api/dashboard", dashboardRoutes);

// ==========================================
// WHATSAPP BOT
// PRESERVED - NO CHANGES
// ==========================================

app.use("/api/whatsapp", whatsappBotRoutes);

// ==========================================
// MULTER
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  },

  fileFilter: (req, file, callback) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      return callback(null, true);
    }

    return callback(
      new Error(
        "Only JPEG, PNG, WEBP and GIF images are allowed."
      )
    );
  }
});

// ==========================================
// CLOUDINARY UPLOAD
// ==========================================

app.post(
  "/api/upload",
  protect,
  requirePermission("manage_products"),
  upload.array("images", 10),

  async (req, res) => {
    try {
      if (!req.files?.length) {
        return res.status(400).json({
          success: false,
          message: "No images uploaded."
        });
      }

      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(500).json({
          success: false,
          message: "Cloudinary is not configured."
        });
      }

      // Limit simultaneous uploads to avoid
      // overwhelming the server or Cloudinary.

      const uploadImage = file => {
        return new Promise((resolve, reject) => {
          const uploadStream =
            cloudinary.uploader.upload_stream(
              {
                folder: "products",
                resource_type: "image"
              },
              (error, result) => {
                if (error) {
                  return reject(error);
                }

                resolve(result.secure_url);
              }
            );

          streamifier
            .createReadStream(file.buffer)
            .pipe(uploadStream);
        });
      };

      const urls = [];

      for (let i = 0; i < req.files.length; i += 3) {
        const batch = req.files.slice(i, i + 3);

        const batchUrls = await Promise.all(
          batch.map(uploadImage)
        );

        urls.push(...batchUrls);
      }

      return res.status(200).json({
        success: true,
        message: "Images uploaded successfully.",
        urls
      });

    } catch (error) {
      console.error(
        "Cloudinary upload error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Image upload failed."
      });
    }
  }
);

// ==========================================
// DEMO USER SEEDING
// ==========================================

async function seedDemoUsers() {
  if (process.env.NODE_ENV === "production") {
    console.log(
      "Demo user seeding disabled in production."
    );

    return;
  }

  const demoAccounts = [
    {
      name: "DIVINE SOLAR HUB",
      email: "admin@email.com",
      phone: "+23481100001",
      password: "admin123",
      role: "admin",
      isVerified: true
    },
    {
      name: "Demo User",
      email: "user@divinesolarhub.com",
      phone: "+2348000000002",
      password: "user123",
      role: "user",
      isVerified: true
    },
    {
      name: "Demo Sales Rep",
      email: "sales@divinesolarhub.com",
      phone: "+2348000000003",
      password: "sales123",
      role: "sales_rep",
      isVerified: true,
      permissions: [
        "manage_products",
        "manage_orders",
        "manage_categories"
      ]
    }
  ];

  for (const acc of demoAccounts) {
    try {
      const exists = await User.findOne({
        $or: [
          { email: acc.email },
          { phone: acc.phone }
        ]
      });

      if (!exists) {
        await User.create(acc);
        console.log(`Seeded: ${acc.email}`);
      } else {
        console.log(`Skipped: ${acc.email}`);
      }

    } catch (error) {
      console.error(
        `Demo user error (${acc.email}):`,
        error.message
      );
    }
  }
}

// ==========================================
// 404
// ==========================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API route not found.",
    path: req.originalUrl
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err.message?.startsWith("Only JPEG")) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed by CORS."
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// ==========================================
// LOCAL DEVELOPMENT SERVER
// ==========================================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    console.log("MongoDB connected successfully.");

    await seedDemoUsers();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("====================================");
      console.log("DIVINE SOLAR HUB API STARTED");
      console.log(`PORT: ${PORT}`);
      console.log(
        `ENV: ${process.env.NODE_ENV || "development"}`
      );
      console.log("====================================");
    });

  } catch (error) {
    console.error(
      "Server startup failed:",
      error.message
    );

    process.exit(1);
  }
}

// ==========================================
// VERCEL + LOCAL COMPATIBILITY
// ==========================================

if (!process.env.VERCEL) {
  startServer();
}

export default app;
