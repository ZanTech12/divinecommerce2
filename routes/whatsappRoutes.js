import express from 'express';

import {
  verifyWebhook,
  receiveWebhook
} from '../controllers/whatsappController.js';

import {
  verifyWhatsAppSignature
} from '../middleware/whatsappSignature.js';

const router = express.Router();

// Meta subscription verification.
router.get('/', verifyWebhook);

// Incoming messages and delivery status notifications.
router.post(
  '/',
  verifyWhatsAppSignature,
  receiveWebhook
);

export default router;