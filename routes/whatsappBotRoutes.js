import express from "express";

import botAuth from "../middleware/botAuth.js";

import {
  searchProducts,
  getProductDetails,
  getCategories,
  createWhatsAppOrder,
  trackWhatsAppOrder
} from "../controllers/whatsappBotController.js";

const router = express.Router();

// All routes require WhatsApp bot authentication.
router.use(botAuth);

// Product operations
router.get("/products", searchProducts);
router.get("/products/:id", getProductDetails);
router.get("/categories", getCategories);

// Order operations
router.post("/orders", createWhatsAppOrder);
router.get("/orders/:orderNumber", trackWhatsAppOrder);

export default router;