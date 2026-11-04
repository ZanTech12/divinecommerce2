import {
  createHmac,
  timingSafeEqual
} from 'node:crypto';

export const verifyWhatsAppSignature = (req, res, next) => {
  try {
    const appSecret = process.env.META_APP_SECRET;
    const signature = req.headers['x-hub-signature-256'];

    if (!appSecret) {
      console.error('META_APP_SECRET is missing.');
      return res.status(500).json({
        success: false,
        message: 'Webhook configuration error.'
      });
    }

    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({
        success: false,
        message: 'Original request body is unavailable.'
      });
    }

    if (
      !signature ||
      !signature.startsWith('sha256=')
    ) {
      return res.status(401).json({
        success: false,
        message: 'Missing webhook signature.'
      });
    }

    const receivedSignature = signature.slice(7);

    const expectedSignature = createHmac(
      'sha256',
      appSecret
    )
      .update(req.rawBody)
      .digest('hex');

    const received = Buffer.from(receivedSignature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature.'
      });
    }

    next();

  } catch (error) {
    console.error('WhatsApp signature error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Signature verification failed.'
    });
  }
};