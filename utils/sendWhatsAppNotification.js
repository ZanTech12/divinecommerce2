// utils/sendWhatsAppNotification.js

import { generateReceipt } from "./generateReceipt.js";

const getWhatsAppBotConfig = () => {
  const baseUrl = process.env.WHATSAPP_BOT_URL?.replace(/\/+$/, "");
  const secret = process.env.WHATSAPP_BOT_SECRET;

  if (!baseUrl) {
    throw new Error("WHATSAPP_BOT_URL is not configured.");
  }

  if (!secret) {
    throw new Error("WHATSAPP_BOT_SECRET is not configured.");
  }

  return { baseUrl, secret };
};

/**
 * Sends a WhatsApp notification through the separate Baileys bot.
 *
 * @param {Object} options
 * @param {Object} options.order - MongoDB order document
 * @param {string} [options.phone] - Explicit WhatsApp recipient
 * @param {string} options.message - Notification message
 * @param {boolean} [options.attachReceipt=false] - Attach PDF receipt
 */
export const sendWhatsAppNotification = async ({
  order,
  phone,
  message,
  attachReceipt = false,
}) => {
  if (!order) {
    throw new Error("Order is required for WhatsApp notification.");
  }

  const recipient =
    phone ||
    order.whatsappPhone ||
    order.shippingAddress?.phone;

  if (!recipient) {
    return {
      success: false,
      skipped: true,
      reason: "No WhatsApp phone number is available.",
    };
  }

  if (typeof message !== "string" || !message.trim()) {
    throw new Error("A WhatsApp notification message is required.");
  }

  const { baseUrl, secret } = getWhatsAppBotConfig();

  let pdfBase64;
  let fileName;

  // Generate the PDF only when a receipt is requested.
  if (attachReceipt) {
    const pdfBuffer = await generateReceipt(order);

    if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
      throw new Error("Receipt generation did not return a valid PDF.");
    }

    pdfBase64 = pdfBuffer.toString("base64");

    const orderNumber = String(order.orderNumber || order._id);

    fileName = `Divine-Solar-Hub-Receipt-${orderNumber}`
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 90);

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      fileName += ".pdf";
    }
  }

  const response = await fetch(
    `${baseUrl}/internal/send-notification`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": secret,
      },
      body: JSON.stringify({
        phone: String(recipient),
        message: message.trim(),
        ...(pdfBase64
          ? {
              pdfBase64,
              fileName,
            }
          : {}),
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        `WhatsApp bot returned HTTP ${response.status}.`
    );
  }

  return {
    success: true,
    messageSent: result.messageSent === true,
    receiptSent: result.receiptSent === true,
  };
};

export default sendWhatsAppNotification;