
import PDFDocument from "pdfkit";

/**
 * Format an amount as Nigerian Naira.
 */
const formatNaira = (amount = 0) => {
  return `NGN ${Number(amount || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Safely format a date.
 */
const formatDate = (date) => {
  const value = date ? new Date(date) : new Date();

  if (Number.isNaN(value.getTime())) {
    return new Date().toLocaleString("en-NG");
  }

  return value.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

/**
 * Generate a PDF receipt.
 *
 * Returns a Promise<Buffer>.
 *
 * Usage:
 * const pdfBuffer = await generateReceipt(order);
 */
export const generateReceipt = (order, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      if (!order) {
        return reject(new Error("Order information is required."));
      }

      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 45,
          bottom: 45,
          left: 45,
          right: 45,
        },
        bufferPages: true,
        info: {
          Title: `Receipt - ${order.orderNumber || "Order"}`,
          Author: "Divine Solar Hub",
          Subject: "Customer Order Receipt",
        },
      });

      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));

      doc.on("error", reject);

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      const pageWidth = doc.page.width;
      const left = 45;
      const right = pageWidth - 45;
      const contentWidth = right - left;

      const storeName =
        options.storeName || "DIVINE SOLAR HUB";

      const address =
        order.shippingAddress || {};

      const items = Array.isArray(order.items)
        ? order.items
        : [];

      const paymentStatus =
        String(order.paymentStatus || "pending").toUpperCase();

      const orderStatus =
        String(order.status || "pending").replace(/_/g, " ").toUpperCase();

      const subtotal = Number(
        order.subtotal || 0
      );

      const shipping = Number(
        order.shippingCost || 0
      );

      const tax = Number(
        order.tax || 0
      );

      const discount = Number(
        order.discount || 0
      );

      const total = Number(
        order.totalAmount || 0
      );

      const paymentReference =
        order.paymentReference ||
        order.paystackReference ||
        order.monnifyTransactionReference ||
        order.monnifyPaymentReference ||
        order.bankTransferReference ||
        "Not available";

      // =====================================
      // HEADER
      // =====================================

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text(storeName, left, 45, {
          width: contentWidth,
          align: "center",
        });

      doc
        .fillColor("#555555")
        .font("Helvetica")
        .fontSize(9)
        .text(
          options.tagline ||
            "Solar Energy, Electrical Services and Technology",
          left,
          75,
          {
            width: contentWidth,
            align: "center",
          }
        );

      doc
        .moveTo(left, 105)
        .lineTo(right, 105)
        .strokeColor("#123b2a")
        .lineWidth(1.5)
        .stroke();

      // =====================================
      // RECEIPT TITLE
      // =====================================

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(17)
        .text("ORDER RECEIPT", left, 125);

      doc
        .fillColor("#555555")
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Order Date: ${formatDate(order.createdAt)}`,
          left,
          155
        );

      doc
        .text(
          `Order Number: ${order.orderNumber || "N/A"}`,
          left,
          170
        );

      doc
        .text(
          `Order Status: ${orderStatus}`,
          left,
          185
        );

      doc
        .text(
          `Payment Status: ${paymentStatus}`,
          left,
          200
        );

      // =====================================
      // CUSTOMER INFORMATION
      // =====================================

      let y = 235;

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("CUSTOMER INFORMATION", left, y);

      y += 23;

      doc
        .fillColor("#222222")
        .font("Helvetica")
        .fontSize(9);

      const customerLines = [
        `Name: ${address.fullName || "N/A"}`,
        `Phone: ${address.phone || order.whatsappPhone || "N/A"}`,
        `Email: ${address.email || order.guestEmail || "N/A"}`,
        `Address: ${[
          address.street,
          address.apartment,
          address.city,
          address.state,
          address.zipCode,
          address.country,
        ]
          .filter(Boolean)
          .join(", ") || "N/A"}`,
      ];

      for (const line of customerLines) {
        doc.text(line, left, y, {
          width: contentWidth,
        });

        y += 16;
      }

      // =====================================
      // ORDER ITEMS TABLE
      // =====================================

      y += 15;

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("ORDER ITEMS", left, y);

      y += 22;

      const columns = {
        item: left,
        quantity: left + 245,
        price: left + 315,
        amount: left + 405,
      };

      const drawTableHeader = () => {
        doc
          .rect(left, y, contentWidth, 25)
          .fill("#123b2a");

        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(8);

        doc.text("PRODUCT", columns.item + 6, y + 8, {
          width: 230,
        });

        doc.text("QTY", columns.quantity, y + 8, {
          width: 55,
          align: "center",
        });

        doc.text("PRICE", columns.price, y + 8, {
          width: 80,
          align: "right",
        });

        doc.text("AMOUNT", columns.amount, y + 8, {
          width: 90,
          align: "right",
        });

        y += 25;
      };

      drawTableHeader();

      doc.font("Helvetica").fontSize(8);

      for (const item of items) {
        const quantity = Number(item.quantity || 1);

        const price = Number(
          item.price || item.discountPrice || 0
        );

        const amount = price * quantity;

        const productName = String(
          item.name || "Product"
        );

        const nameHeight = doc.heightOfString(
          productName,
          {
            width: 225,
            font: "Helvetica",
            fontSize: 8,
          }
        );

        const rowHeight = Math.max(
          25,
          nameHeight + 12
        );

        // Start another page when necessary.
        if (y + rowHeight > doc.page.height - 110) {
          doc.addPage();
          y = 45;
          drawTableHeader();
          doc.font("Helvetica").fontSize(8);
        }

        doc
          .rect(left, y, contentWidth, rowHeight)
          .strokeColor("#dddddd")
          .lineWidth(0.5)
          .stroke();

        doc
          .fillColor("#222222")
          .text(productName, columns.item + 6, y + 7, {
            width: 225,
          });

        doc.text(
          String(quantity),
          columns.quantity,
          y + 8,
          {
            width: 55,
            align: "center",
          }
        );

        doc.text(
          formatNaira(price),
          columns.price,
          y + 8,
          {
            width: 80,
            align: "right",
          }
        );

        doc.text(
          formatNaira(amount),
          columns.amount,
          y + 8,
          {
            width: 90,
            align: "right",
          }
        );

        y += rowHeight;
      }

      // =====================================
      // TOTALS
      // =====================================

      y += 18;

      const drawTotal = (label, value, bold = false) => {
        if (y > doc.page.height - 100) {
          doc.addPage();
          y = 45;
        }

        doc
          .fillColor("#222222")
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 11 : 9)
          .text(label, left + 230, y, {
            width: 110,
          });

        doc
          .text(formatNaira(value), left + 340, y, {
            width: 125,
            align: "right",
          });

        y += bold ? 22 : 17;
      };

      drawTotal("Subtotal:", subtotal);
      drawTotal("Shipping:", shipping);
      drawTotal("Tax:", tax);

      if (discount > 0) {
        drawTotal("Discount:", -discount);
      }

      if (Number(order.coinDiscount || 0) > 0) {
        drawTotal(
          "Coin Discount:",
          -Number(order.coinDiscount)
        );
      }

      drawTotal("TOTAL:", total, true);

      // =====================================
      // PAYMENT INFORMATION
      // =====================================

      y += 10;

      if (y > doc.page.height - 130) {
        doc.addPage();
        y = 45;
      }

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("PAYMENT INFORMATION", left, y);

      y += 20;

      doc
        .fillColor("#222222")
        .font("Helvetica")
        .fontSize(9);

      doc.text(
        `Payment Method: ${order.paymentMethod || "N/A"}`,
        left,
        y
      );

      y += 16;

      doc.text(
        `Payment Reference: ${paymentReference}`,
        left,
        y,
        {
          width: contentWidth,
        }
      );

      y += 16;

      if (order.paidAt) {
        doc.text(
          `Paid At: ${formatDate(order.paidAt)}`,
          left,
          y
        );

        y += 16;
      }

      if (order.trackingNumber) {
        doc.text(
          `Tracking Number: ${order.trackingNumber}`,
          left,
          y
        );

        y += 16;
      }

      if (order.estimatedDelivery) {
        doc.text(
          `Estimated Delivery: ${formatDate(order.estimatedDelivery)}`,
          left,
          y
        );

        y += 16;
      }

      // =====================================
      // FOOTER
      // =====================================

      const footerY = Math.min(
        Math.max(y + 25, 700),
        doc.page.height - 65
      );

      doc
        .moveTo(left, footerY)
        .lineTo(right, footerY)
        .strokeColor("#dddddd")
        .stroke();

      doc
        .fillColor("#123b2a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          "Thank you for shopping with Divine Solar Hub!",
          left,
          footerY + 12,
          {
            width: contentWidth,
            align: "center",
          }
        );

      doc
        .fillColor("#666666")
        .font("Helvetica")
        .fontSize(8)
        .text(
          "This is a computer-generated receipt.",
          left,
          footerY + 28,
          {
            width: contentWidth,
            align: "center",
          }
        );

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};

export default generateReceipt;
