import crypto from "crypto";
import Order from "../models/Order.js";
import Wallet from "../models/Wallet.js";

// ==========================================
// MONNIFY CONFIGURATION
// ==========================================

const MONNIFY_BASE_URL =
  process.env.MONNIFY_BASE_URL || "https://sandbox.monnify.com";

const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY;
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE;

const isProductionMonnify =
  !MONNIFY_BASE_URL.includes("sandbox");

// ==========================================
// CONFIGURATION VALIDATION
// ==========================================

function validateMonnifyConfig() {
  if (
    !MONNIFY_API_KEY ||
    !MONNIFY_SECRET_KEY ||
    !MONNIFY_CONTRACT_CODE
  ) {
    throw new Error("Monnify environment variables are missing.");
  }
}

// ==========================================
// MONNIFY AUTHENTICATION
// ==========================================

async function getMonnifyToken() {
  validateMonnifyConfig();

  const credentials = Buffer
    .from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`)
    .toString("base64");

  const response = await fetch(
    `${MONNIFY_BASE_URL}/api/v1/auth/login`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      }
    }
  );

  const result = await response.json();

  if (
    !response.ok ||
    !result.requestSuccessful ||
    !result.responseBody?.accessToken
  ) {
    console.error("Monnify authentication failed:", result);

    throw new Error(
      result.responseMessage || "Unable to authenticate with Monnify."
    );
  }

  return result.responseBody.accessToken;
}

// ==========================================
// MONNIFY API REQUEST HELPER
// ==========================================

async function monnifyRequest(url, options = {}) {
  const token = await getMonnifyToken();

  const response = await fetch(
    `${MONNIFY_BASE_URL}${url}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    }
  );

  const result = await response.json();

  if (
    !response.ok ||
    result.requestSuccessful === false
  ) {
    console.error("Monnify API error:", result);

    throw new Error(
      result.responseMessage || "Monnify request failed."
    );
  }

  return result.responseBody;
}

// ==========================================
// LOYALTY COIN CREDITING
// Only for successfully paid Monnify orders.
// ==========================================

async function creditOrderCoins(order) {
  if (!order.user || order.coinsCredited) {
    return 0;
  }

  // Existing rule: 1 coin per ₦10,000 actual cash paid.
  const coinsToCredit = Math.floor(
    Number(order.amountPaid || 0) / 10000
  );

  if (coinsToCredit <= 0) {
    return 0;
  }

  // Claim the credit operation atomically.
  // Repeated webhook notifications cannot claim it again.
  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      coinsCredited: false
    },
    {
      $set: {
        coinsCredited: true
      }
    },
    {
      new: true
    }
  );

  if (!claimedOrder) {
    return 0;
  }

  try {
    await Wallet.findOneAndUpdate(
      { user: order.user },
      {
        $inc: {
          coins: coinsToCredit
        }
      },
      {
        upsert: true,
        new: true
      }
    );

    return coinsToCredit;
  } catch (error) {
    // Release the claim if wallet crediting fails.
    await Order.findByIdAndUpdate(order._id, {
      $set: {
        coinsCredited: false
      }
    });

    throw error;
  }
}

// ==========================================
// VERIFY TRANSACTION DIRECTLY WITH MONNIFY
// ==========================================

async function queryMonnifyTransaction(paymentReference) {
  const encodedReference = encodeURIComponent(paymentReference);

  return monnifyRequest(
    `/api/v2/merchant/transactions/query?paymentReference=${encodedReference}`,
    {
      method: "GET"
    }
  );
}

// ==========================================
// MARK ORDER AS PAID
// ==========================================

async function markOrderPaid(transaction) {
  const paymentReference = transaction.paymentReference;

  if (!paymentReference) {
    throw new Error("Monnify payment reference is missing.");
  }

  const order = await Order.findOne({
    monnifyPaymentReference: paymentReference
  });

  if (!order) {
    throw new Error("No order matches this Monnify payment reference.");
  }

  const paymentStatus = String(
    transaction.paymentStatus || ""
  ).toUpperCase();

  const currency = String(
    transaction.currencyCode || transaction.currency || ""
  ).toUpperCase();

  const amountPaid = Number(transaction.amountPaid);

  const expectedAmount = Number(
    order.amountPaid > 0
      ? order.amountPaid
      : order.totalAmount
  );

  if (paymentStatus !== "PAID") {
    throw new Error("Monnify has not confirmed this payment as paid.");
  }

  if (currency !== "NGN") {
    throw new Error("Payment currency does not match NGN.");
  }

  if (
    !Number.isFinite(amountPaid) ||
    !Number.isFinite(expectedAmount) ||
    Math.abs(amountPaid - expectedAmount) > 0.01
  ) {
    throw new Error("Payment amount does not match the order amount.");
  }

  // Do not overwrite a cancelled order's fulfilment status.
  // Payment can still be recorded so the merchant can handle a refund.
  const update = {
    paymentStatus: "paid",
    paymentGateway: "monnify",
    paymentReference,
    monnifyTransactionReference:
      transaction.transactionReference || null,
    paidAt: transaction.paidOn
      ? new Date(transaction.paidOn)
      : new Date(),
    amountPaid
  };

  if (order.status === "pending") {
    update.status = "confirmed";
  }

  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $ne: "paid" }
    },
    {
      $set: update
    },
    {
      new: true
    }
  );

  // Already processed: webhook or verification retry.
  if (!updatedOrder) {
    return {
      order: await Order.findById(order._id),
      coinsCredited: 0,
      alreadyProcessed: true
    };
  }

  let coinsCredited = 0;

  // Preserve the existing rule that cancelled orders do not earn coins.
  if (updatedOrder.status !== "cancelled") {
    coinsCredited = await creditOrderCoins(updatedOrder);
  }

  return {
    order: await Order.findById(order._id),
    coinsCredited,
    alreadyProcessed: false
  };
}

// ==========================================
// INITIALIZE MONNIFY PAYMENT
// POST /api/payments/monnify/initialize
// ==========================================

export async function initializeMonnifyPayment(req, res) {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required."
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    if (order.paymentMethod !== "monnify") {
      return res.status(400).json({
        success: false,
        message: "This order was not created for Monnify payment."
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "This order has already been paid."
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This order has been cancelled."
      });
    }

    const amount = Number(
      order.amountPaid > 0
        ? order.amountPaid
        : order.totalAmount
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid order payment amount."
      });
    }

    const customerEmail =
      order.shippingAddress?.email ||
      order.guestEmail;

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer email is required for Monnify payment."
      });
    }

    // Reuse the pending reference if the customer retries
    // initialization for the same order.
    let paymentReference = order.monnifyPaymentReference;

    if (!paymentReference) {
      paymentReference =
        `DSH-${order._id}-${Date.now()}`;

      order.monnifyPaymentReference = paymentReference;
      order.paymentReference = paymentReference;
      order.paymentGateway = "monnify";
      order.paymentStatus = "pending";

      await order.save();
    }

    const redirectUrl = process.env.MONNIFY_REDIRECT_URL;

    if (!redirectUrl) {
      return res.status(500).json({
        success: false,
        message: "MONNIFY_REDIRECT_URL is not configured."
      });
    }

    const customerName =
      order.shippingAddress?.fullName ||
      "Divine Solar Hub Customer";

    const responseBody = await monnifyRequest(
      "/api/v1/merchant/transactions/init-transaction",
      {
        method: "POST",
        body: JSON.stringify({
          amount,
          customerName,
          customerEmail,
          customerPhoneNumber:
            order.shippingAddress?.phone || "",
          paymentReference,
          paymentDescription:
            `Divine Solar Hub Order ${order.orderNumber}`,
          currencyCode: "NGN",
          contractCode: MONNIFY_CONTRACT_CODE,
          redirectUrl,
          paymentMethods: [
            "CARD",
            "ACCOUNT_TRANSFER"
          ],
          metadata: {
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            customerEmail
          }
        })
      }
    );

    order.monnifyTransactionReference =
      responseBody.transactionReference;

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Monnify payment initialized successfully.",
      checkoutUrl: responseBody.checkoutUrl,
      paymentReference: responseBody.paymentReference,
      transactionReference: responseBody.transactionReference,
      orderId: order._id,
      amount
    });

  } catch (error) {
    console.error("Monnify initialization error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to initialize Monnify payment."
    });
  }
}

// ==========================================
// VERIFY MONNIFY PAYMENT
// GET /api/payments/monnify/verify/:paymentReference
// ==========================================

export async function verifyMonnifyPayment(req, res) {
  try {
    const { paymentReference } = req.params;

    if (!paymentReference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required."
      });
    }

    const order = await Order.findOne({
      monnifyPaymentReference: paymentReference,
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for this payment reference."
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment has already been verified.",
        paymentStatus: "paid",
        order
      });
    }

    const transaction =
      await queryMonnifyTransaction(paymentReference);

    const result = await markOrderPaid(transaction);

    return res.status(200).json({
      success: true,
      message: "Payment verification completed.",
      paymentStatus: "paid",
      order: result.order,
      coinsCredited: result.coinsCredited
    });

  } catch (error) {
    console.error("Monnify verification error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Payment verification failed."
    });
  }
}

// ==========================================
// MONNIFY WEBHOOK SIGNATURE VALIDATION
// ==========================================

function isValidMonnifyWebhook(req) {
  // Monnify sandbox webhook notifications may not include
  // the monnify-signature header.
  if (!isProductionMonnify) {
    return true;
  }

  const receivedSignature =
    req.headers["monnify-signature"];

  if (!receivedSignature || !req.rawBody) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha512", MONNIFY_SECRET_KEY)
    .update(req.rawBody)
    .digest("hex");

  const received = Buffer.from(
    String(receivedSignature).toLowerCase(),
    "hex"
  );

  const expected = Buffer.from(
    expectedSignature.toLowerCase(),
    "hex"
  );

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(received, expected);
}

// ==========================================
// MONNIFY WEBHOOK
// POST /api/payments/monnify/webhook
// ==========================================

export async function monnifyWebhook(req, res) {
  try {
    if (!isValidMonnifyWebhook(req)) {
      console.error("Invalid Monnify webhook signature.");

      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature."
      });
    }

    const eventType = req.body?.eventType;
    const eventData = req.body?.eventData;

    if (
      eventType !== "SUCCESSFUL_TRANSACTION" ||
      !eventData?.paymentReference
    ) {
      return res.status(200).json({
        success: true,
        message: "Webhook received. No payment action required."
      });
    }

    // Never rely only on the webhook body.
    // Query Monnify's API to independently verify the transaction.
    const transaction =
      await queryMonnifyTransaction(
        eventData.paymentReference
      );

    const result = await markOrderPaid(transaction);

    console.log(
      `Monnify payment processed: ${eventData.paymentReference}`
    );

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully.",
      alreadyProcessed: result.alreadyProcessed
    });

  } catch (error) {
    console.error("Monnify webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed."
    });
  }
}