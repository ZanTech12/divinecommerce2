import { timingSafeEqual } from 'node:crypto';

import connectDB from '../config/db.js';
import WhatsAppMessage from '../models/WhatsAppMessage.js';

import {
  sendWhatsAppWelcome
} from '../services/whatsappService.js';

// ==========================================
// SAFE STRING COMPARISON
// ==========================================

const safeCompare = (value1, value2) => {
  if (
    typeof value1 !== 'string' ||
    typeof value2 !== 'string'
  ) {
    return false;
  }

  const first = Buffer.from(value1);
  const second = Buffer.from(value2);

  if (first.length !== second.length) {
    return false;
  }

  return timingSafeEqual(first, second);
};

// ==========================================
// EXTRACT MESSAGE TEXT
// ==========================================

const getMessageText = (message) => {
  switch (message.type) {
    case 'text':
      return message.text?.body || '';

    case 'image':
      return message.image?.caption || '[Image received]';

    case 'video':
      return message.video?.caption || '[Video received]';

    case 'audio':
      return '[Audio message received]';

    case 'document':
      return message.document?.filename || '[Document received]';

    case 'location':
      return '[Location received]';

    case 'interactive':
      return (
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        '[Interactive message]'
      );

    case 'button':
      return message.button?.text || '[Button response]';

    default:
      return `[${message.type || 'Unknown'} message]`;
  }
};

// ==========================================
// 1. VERIFY META WEBHOOK
// ==========================================

export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('WHATSAPP_VERIFY_TOKEN is missing.');

    return res.status(500).send('Webhook configuration error.');
  }

  if (
    mode === 'subscribe' &&
    safeCompare(token, verifyToken) &&
    typeof challenge === 'string'
  ) {
    console.log('WhatsApp webhook verification successful.');

    return res.status(200).send(challenge);
  }

  return res.status(403).send('Verification failed.');
};

// ==========================================
// 2. PROCESS INCOMING CUSTOMER MESSAGE
// ==========================================

const processIncomingMessage = async (message) => {
  const messageId = message.id;
  const phoneNumber = message.from;

  if (!messageId || !phoneNumber) {
    console.warn('WhatsApp message missing ID or sender.');
    return;
  }

  // Check if Meta has already delivered this message.
  let savedMessage = await WhatsAppMessage.findOne({
    messageId
  });

  if (savedMessage?.replyStatus === 'sent') {
    console.log('Duplicate WhatsApp message skipped:', messageId);
    return;
  }

  // Save the incoming message if this is its first delivery.
  if (!savedMessage) {
    try {
      savedMessage = await WhatsAppMessage.create({
        messageId,
        phoneNumber,
        direction: 'inbound',
        messageType: message.type || 'unknown',
        messageText: getMessageText(message),
        status: 'received',
        replyStatus: 'pending',
        timestamp: message.timestamp
          ? new Date(Number(message.timestamp) * 1000)
          : new Date(),
        metadata: {
          whatsappMessageType: message.type || 'unknown'
        }
      });
    } catch (error) {
      // Handle simultaneous Meta retries safely.
      if (error.code !== 11000) {
        throw error;
      }

      savedMessage = await WhatsAppMessage.findOne({
        messageId
      });

      if (!savedMessage) {
        throw error;
      }

      if (savedMessage.replyStatus === 'sent') {
        return;
      }
    }
  }

  console.log('Incoming WhatsApp message:', {
    from: phoneNumber,
    type: message.type,
    text: getMessageText(message)
  });

  // Send the initial automated response.
  try {
    const result = await sendWhatsAppWelcome(phoneNumber);

    const outgoingMessageId = result?.messages?.[0]?.id;

    if (outgoingMessageId) {
      try {
        await WhatsAppMessage.create({
          messageId: outgoingMessageId,
          phoneNumber,
          direction: 'outbound',
          messageType: 'text',
          messageText: 'Welcome acknowledgement',
          status: 'sent',
          timestamp: new Date()
        });
      } catch (error) {
        if (error.code !== 11000) {
          console.error(
            'Could not save outgoing WhatsApp message:',
            error.message
          );
        }
      }
    }

    await WhatsAppMessage.updateOne(
      { messageId },
      {
        $set: {
          replyStatus: 'sent',
          status: 'received'
        }
      }
    );

    console.log('WhatsApp acknowledgement sent:', phoneNumber);

  } catch (error) {
    await WhatsAppMessage.updateOne(
      { messageId },
      {
        $set: {
          replyStatus: 'failed'
        }
      }
    );

    console.error(
      'WhatsApp automatic reply failed:',
      error.message
    );

    throw error;
  }
};

// ==========================================
// 3. RECEIVE META WEBHOOK EVENTS
// ==========================================

export const receiveWebhook = async (req, res) => {
  try {
    const payload = req.body;

    if (
      !payload ||
      payload.object !== 'whatsapp_business_account'
    ) {
      return res.status(404).send('Unsupported webhook object.');
    }

    await connectDB();

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') {
          continue;
        }

        const value = change.value || {};

        // Process incoming messages.
        for (const message of value.messages || []) {
          await processIncomingMessage(message);
        }

        // Process delivery, read and failure status updates.
        for (const status of value.statuses || []) {
          if (!status.id) continue;

          await WhatsAppMessage.updateOne(
            { messageId: status.id },
            {
              $set: {
                status: status.status || 'unknown'
              }
            }
          );

          console.log('WhatsApp status update:', {
            messageId: status.id,
            status: status.status
          });
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error(
      'WhatsApp webhook processing error:',
      error.message
    );

    // Non-200 response allows Meta to retry delivery.
    return res.status(500).send('Webhook processing failed.');
  }
};