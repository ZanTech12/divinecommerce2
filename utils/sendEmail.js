// utils/sendEmail.js
import { Resend } from 'resend';
import SiteSettings from '../models/SiteSettings.js'; 
import Order from '../models/Order.js'; // ✅ Import Order model to check recent orders

// ✅ Replaced Nodemailer SMTP with Resend HTTP API (Works flawlessly on Vercel)
const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ 1. EMAIL FOR THE CUSTOMER
export const sendCartReminderToUser = async (user, cartItems, totalPrice) => {
  const customerEmail = user?.email; 

  if (!customerEmail) {
    console.log('⚠️ Skipped user email: User has no email address in database.');
    return; 
  }

  // ✅ BLOCK IF ORDER PLACED IN LAST 2 MINUTES
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const recentOrder = await Order.exists({
    $or: [
      { user: user?._id },
      { guestEmail: customerEmail }
    ],
    createdAt: { $gte: twoMinutesAgo }
  });

  if (recentOrder) {
    console.log(`🛑 Blocked cart email to user: ${customerEmail} placed an order within the last 2 minutes.`);
    return;
  }

  // ✅ Fetch store settings from DB
  const settings = await SiteSettings.getSettings();
  const storeName = settings?.companyName || 'MallHub'; 

  const itemsList = cartItems.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₦${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <h2 style="color: #f68b1e;">You left items in your cart! 🛒</h2>
      <p style="color: #666;">Hi ${user.name}, we noticed you added some items but haven't checked out yet.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f4f4f4;">
            <th style="padding: 10px; text-align: left;">Item</th>
            <th style="padding: 10px; text-align: center;">Qty</th>
            <th style="padding: 10px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsList}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 16px; border-top: 2px solid #ddd;">Total:</td>
            <td style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 16px; color: #f68b1e; border-top: 2px solid #ddd;">₦${totalPrice.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart" style="display: inline-block; background-color: #f68b1e; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Complete Your Purchase
        </a>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: `"${storeName}" <${process.env.EMAIL_FROM || 'onboarding@resend.dev'}>`, 
    to: customerEmail,
    subject: "Still thinking about it? Complete your purchase! 🛒",
    html: htmlBody,
  });

  if (error) console.error('❌ Resend Error:', error);
};

// ✅ 2. EMAIL FOR THE ADMIN
export const sendAbandonedCartAlertToAdmin = async (user, cartItems, totalPrice) => {
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.log('⚠️ Skipped admin email: ADMIN_EMAIL is missing in setEnv.js');
    return;
  }

  // ✅ BLOCK IF ORDER PLACED IN LAST 2 MINUTES
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const recentOrder = await Order.exists({
    $or: [
      { user: user?._id },
      { guestEmail: user?.email }
    ],
    createdAt: { $gte: twoMinutesAgo }
  });

  if (recentOrder) {
    console.log(`🛑 Blocked admin cart email: ${user?.email} placed an order within the last 2 minutes.`);
    return;
  }

  // ✅ Fetch store settings from DB
  const settings = await SiteSettings.getSettings();
  const storeName = settings?.companyName || 'MallHub'; 

  const itemsList = cartItems.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₦${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const userInfoBlock = `
    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
      <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">Customer Details</h4>
      <table style="width: 100%; font-size: 14px; color: #4b5563;">
        <tr><td style="padding: 4px 0; font-weight: 600; width: 100px;">Name:</td><td style="padding: 4px 0;">${user.name}</td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Email:</td><td style="padding: 4px 0;"><a href="mailto:${user.email}" style="color: #3b82f6;">${user.email || 'N/A'}</a></td></tr>
        <tr><td style="padding: 4px 0; font-weight: 600;">Phone:</td><td style="padding: 4px 0;">${user.phone || 'Not provided'}</td></tr>
      </table>
    </div>
  `;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #dc2626; margin: 0;">🛒 Abandoned Cart Alert</h2>
        <p style="margin: 5px 0 0 0; color: #7f1d1d;">A user added items but did not check out after 2 minutes.</p>
      </div>
      
      ${userInfoBlock}

      <h4 style="color: #374151; margin-bottom: 10px;">Abandoned Items:</h4>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f4f4f4;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsList}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 16px; border-top: 2px solid #ddd;">Potential Revenue:</td>
            <td style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 16px; color: #16a34a; border-top: 2px solid #ddd;">₦${totalPrice.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: `"${storeName} System" <${process.env.EMAIL_FROM || 'onboarding@resend.dev'}>`, 
    to: adminEmail,
    subject: `🛒 Abandoned Cart Alert: ${user.name} (₦${totalPrice.toLocaleString()})`,
    html: htmlBody,
  });

  if (error) console.error('❌ Resend Error:', error);
};

// ✅ 3. ORDER CONFIRMATION EMAIL FOR THE CUSTOMER
export const sendOrderConfirmationEmail = async (order, user) => {
  // ✅ UPDATED: Added order.shippingAddress?.email to the fallback chain
  const customerEmail = order.guestEmail || order.shippingAddress?.email || user?.email;

  if (!customerEmail) {
    console.log('⚠️ Skipped order confirmation email: No email address found.');
    return;
  }

  // ✅ Fetch store settings from DB
  const settings = await SiteSettings.getSettings();
  const storeName = settings?.companyName || 'MallHub'; 

  const itemsList = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₦${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const statusColors = {
    pending: '#f59e0b',
    confirmed: '#3b82f6',
    processing: '#8b5cf6',
    shipped: '#06b6d4',
    out_for_delivery: '#f97316',
    delivered: '#16a34a',
    cancelled: '#dc2626',
    returned: '#6b7280',
  };

  const statusColor = statusColors[order.status] || '#6b7280';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <!-- Header -->
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 3px solid #f68b1e;">
        <h1 style="color: #f68b1e; margin: 0;">Order Confirmed! 🎉</h1>
        <p style="color: #666; margin: 8px 0 0 0;">Thank you for shopping with ${storeName}</p>
      </div>

      <!-- Order Number Banner -->
      <div style="background-color: #fff7ed; border: 2px dashed #f68b1e; border-radius: 10px; padding: 20px; text-align: center; margin: 25px 0;">
        <p style="margin: 0; color: #9a3412; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Order Number</p>
        <h2 style="margin: 8px 0 0 0; color: #f68b1e; font-size: 28px; letter-spacing: 2px;">${order.orderNumber}</h2>
      </div>

      <!-- Status Badge -->
      <div style="text-align: center; margin-bottom: 25px;">
        <span style="display: inline-block; background-color: ${statusColor}; color: white; padding: 6px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          ${order.status}
        </span>
      </div>

      <!-- Shipping Address -->
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #374151; font-size: 15px;">📍 Shipping Address</h4>
        <p style="margin: 0; font-size: 14px; color: #4b5563; line-height: 1.6;">
          ${order.shippingAddress?.fullName || ''}<br>
          ${order.shippingAddress?.street || ''}<br>
          ${[order.shippingAddress?.city, order.shippingAddress?.state].filter(Boolean).join(', ')}<br>
          ${order.shippingAddress?.phone || ''}
        </p>
      </div>

      <!-- Items Table -->
      <h4 style="color: #374151; margin-bottom: 10px;">📦 Order Items</h4>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f4f4f4;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsList}</tbody>
      </table>

      <!-- Totals -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="padding: 8px 10px; text-align: right; color: #666;">Subtotal:</td>
          <td style="padding: 8px 10px; text-align: right; width: 140px;">₦${(order.subtotal || 0).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 10px; text-align: right; color: #666;">Shipping:</td>
          <td style="padding: 8px 10px; text-align: right;">₦${(order.shippingCost || 0).toLocaleString()}</td>
        </tr>
        <tr style="border-top: 2px solid #ddd;">
          <td style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 18px;">Total:</td>
          <td style="padding: 12px 10px; text-align: right; font-weight: bold; font-size: 18px; color: #f68b1e;">₦${(order.totalAmount || 0).toLocaleString()}</td>
        </tr>
      </table>

      <!-- Payment Info -->
      <div style="background-color: #f0fdf4; padding: 12px 15px; border-radius: 8px; border: 1px solid #bbf7d0; margin-bottom: 25px; font-size: 14px;">
        <strong style="color: #166534;">Payment:</strong>
        <span style="color: #15803d;"> ${order.paymentMethod === 'paystack' ? 'Paid via Paystack' : order.paymentMethod || 'N/A'}</span>
      </div>

      <!-- Track Order Button -->
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track-order?orderNumber=${order.orderNumber}" style="display: inline-block; background-color: #f68b1e; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Track Your Order
        </a>
      </div>

      <!-- Footer -->
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
        <p>This order was placed on ${new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p>Keep your order number <strong style="color: #f68b1e;">${order.orderNumber}</strong> safe for tracking.</p>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: `"${storeName}" <${process.env.EMAIL_FROM || 'onboarding@resend.dev'}>`,
    to: customerEmail,
    subject: `✅ Order Confirmed — ${order.orderNumber}`,
    html: htmlBody,
  });

  if (error) console.error('❌ Resend Error:', error);
};