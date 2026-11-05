// controllers/authController.js

import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { randomInt } from 'crypto';
import InviteToken from '../models/InviteToken.js';
import Activity from '../models/Activity.js';

// ==========================================
// RESEND EMAIL CONFIGURATION
// ==========================================

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resend) {
  console.error(
    'WARNING: RESEND_API_KEY is missing. OTP emails will not be sent.'
  );
}

// ==========================================
// GENERATE OTP
// ==========================================

const generateOTP = () => {
  return randomInt(100000, 1000000).toString();
};

// ==========================================
// SEND OTP EMAIL
// ==========================================

const sendOTPEmail = async (email, name, otp, uniqueId = '') => {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const storeName = process.env.STORE_NAME || 'Divine Solar Hub';

  const { error } = await resend.emails.send({
    from: `"${storeName}" <${process.env.EMAIL_FROM || 'noreply@shop.divinesolarhub.com'}>`,
    to: email,
    subject: `Your ${storeName} Verification Code ${uniqueId ? `[Ref: ${uniqueId}]` : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hello ${name},</h2>

        <p>
          Thank you for registering with ${storeName}.
          Use the verification code below to verify your account.
        </p>

        <div style="
          font-size: 32px;
          font-weight: bold;
          color: #f68b1e;
          letter-spacing: 5px;
          margin: 20px 0;
          background: #f9fafb;
          padding: 15px;
          text-align: center;
          border-radius: 8px;
        ">
          ${otp}
        </div>

        <p>This code expires in <strong>10 minutes</strong>.</p>

        <p>
          Never share this code with anyone.
          If you did not request this code, please ignore this email.
        </p>

        <p>Thank you for choosing ${storeName}.</p>
      </div>
    `,
  });

  if (error) {
    throw error;
  }
};

// ==========================================
// SEND OTP THROUGH WHATSAPP BOT SERVICE
// ==========================================

const sendOTPWhatsApp = async (phone, name, otp) => {
  const botUrl = process.env.WHATSAPP_BOT_URL;
  const botSecret = process.env.WHATSAPP_BOT_SECRET;

  if (!botUrl || !botSecret) {
    throw new Error(
      'WhatsApp bot URL or secret is not configured.'
    );
  }

  if (!phone) {
    throw new Error(
      'Customer phone number is missing.'
    );
  }

  const response = await fetch(
    `${botUrl.replace(/\/+$/, '')}/internal/send-otp`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': botSecret,
      },

      body: JSON.stringify({
        phone,
        name,
        otp,
      }),

      signal: AbortSignal.timeout(60000),
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || 'WhatsApp OTP delivery failed.'
    );
  }

  return result;
};

// ==========================================
// SEND OTP THROUGH AVAILABLE CHANNELS
// ==========================================

const sendOTPToCustomer = async (user, otp, uniqueId = '') => {
  const results = await Promise.allSettled([
    sendOTPEmail(
      user.email,
      user.name,
      otp,
      uniqueId
    ),

    sendOTPWhatsApp(
      user.phone,
      user.name,
      otp
    ),
  ]);

  const emailSent =
    results[0].status === 'fulfilled';

  const whatsappSent =
    results[1].status === 'fulfilled';

  if (!emailSent) {
    console.error(
      'EMAIL OTP DELIVERY FAILED:',
      results[0].reason?.message
    );
  }

  if (!whatsappSent) {
    console.error(
      'WHATSAPP OTP DELIVERY FAILED:',
      results[1].reason?.message
    );
  }

  return {
    emailSent,
    whatsappSent,
    atLeastOneSent: emailSent || whatsappSent,
  };
};

// ==========================================
// GENERATE JWT
// ==========================================

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '30d',
    }
  );
};

// ==========================================
// LOG ACTIVITY
// ==========================================

const logActivity = (user, message) => {
  Activity.create({
    type: 'user',
    message,
    referenceId: user._id,
    performedBy: user._id,
  }).catch((error) => {
    console.error(
      'Activity Log Error:',
      error.message
    );
  });
};

// ==========================================
// 1. REGISTER CUSTOMER
// ==========================================

export const registerUser = async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
  } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists.',
      });
    }

    const phoneExists = await User.findOne({ phone });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is already in use.',
      });
    }

    const otp = generateOTP();

    const otpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const user = await User.create({
      name,
      email,
      phone,
      password,
      isVerified: false,
      otp,
      otpExpires,
    });

    // Do not print the OTP in production logs.

    const delivery = await sendOTPToCustomer(
      user,
      otp
    );

    logActivity(
      user,
      `New user registration: ${user.name} (${user.email})`
    );

    return res.status(201).json({
      success: true,

      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,

      permissions: user.permissions || [],

      token: generateToken(user),

      emailSent: delivery.emailSent,
      whatsappSent: delivery.whatsappSent,

      requiresVerification: true,

      message: delivery.atLeastOneSent
        ? 'Registration successful. Your verification code has been sent through the available channels.'
        : 'Your account was created, but OTP delivery failed. Please request a new verification code.',
    });

  } catch (error) {
    console.error(
      'Registration error:',
      error.stack
    );

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// 2. VERIFY OTP
// ==========================================

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({
      email,
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account is already verified.',
      });
    }

    if (!user.otp || user.otp !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code.',
      });
    }

    if (
      !user.otpExpires ||
      Date.now() > new Date(user.otpExpires).getTime()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Code has expired. Please request a new one.',
      });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account verified successfully!',
    });

  } catch (error) {
    console.error(
      'OTP verification error:',
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// 3. RESEND OTP
// ==========================================

export const resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({
      email,
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Account is already verified.',
      });
    }

    const otp = generateOTP();

    user.otp = otp;

    user.otpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    await user.save();

    const uniqueId = Date.now()
      .toString()
      .slice(-6);

    const delivery = await sendOTPToCustomer(
      user,
      otp,
      uniqueId
    );

    if (!delivery.atLeastOneSent) {
      return res.status(503).json({
        success: false,
        emailSent: false,
        whatsappSent: false,
        message: 'OTP generated, but delivery failed. Please try again later.',
      });
    }

    return res.status(200).json({
      success: true,
      emailSent: delivery.emailSent,
      whatsappSent: delivery.whatsappSent,
      message: 'New verification code sent through the available channels.',
    });

  } catch (error) {
    console.error(
      'Resend OTP error:',
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// 4. LOGIN
// ==========================================

export const loginUser = async (req, res) => {
  const {
    email,
    password,
  } = req.body;

  try {
    const user = await User.findOne({ email });

    if (
      !user ||
      !(await user.matchPassword(password))
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Send a fresh OTP when an unverified customer tries to log in.

    if (!user.isVerified) {
      const otp = generateOTP();

      user.otp = otp;

      user.otpExpires = new Date(
        Date.now() + 10 * 60 * 1000
      );

      await user.save();

      const delivery = await sendOTPToCustomer(
        user,
        otp
      );

      if (!delivery.atLeastOneSent) {
        return res.status(503).json({
          success: false,
          requiresVerification: true,
          emailSent: false,
          whatsappSent: false,
          message: 'We could not deliver your verification code. Please try again later.',
        });
      }

      return res.status(403).json({
        success: false,
        requiresVerification: true,

        emailSent: delivery.emailSent,
        whatsappSent: delivery.whatsappSent,

        message: 'Your account is not verified. A new verification code has been sent through the available channels.',
      });
    }

    return res.status(200).json({
      success: true,

      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,

      permissions: user.permissions || [],

      token: generateToken(user),
    });

  } catch (error) {
    console.error(
      'Login error:',
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// 5. GET PROFILE
// ==========================================

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(
      req.user._id
    ).select('-password -otp -otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
      permissions: user.permissions || [],
    });

  } catch (error) {
    console.error(
      'Profile error:',
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// 6. REGISTER ENGINEER
// ==========================================

export const registerEngineer = async (req, res) => {
  const {
    name,
    email,
    phone,
    password,
    inviteCode,
  } = req.body;

  try {
    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        message: 'Engineer invite code is required.',
      });
    }

    const tokenRecord = await InviteToken.findOne({
      token: inviteCode,
      isActive: true,
    });

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or already used invite code. Contact admin for access.',
      });
    }

    if (
      new Date() > new Date(tokenRecord.expiresAt)
    ) {
      tokenRecord.isActive = false;

      await tokenRecord.save();

      return res.status(400).json({
        success: false,
        message: 'This invite code has expired. Please request a new one from admin.',
      });
    }

    const normalizedEmail = email.toLowerCase();

    const emailExists = await User.findOne({
      email: normalizedEmail,
    });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const phoneExists = await User.findOne({
      phone,
    });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this phone number already exists.',
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    const otp = generateOTP();

    const otpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      password,
      role: 'engineer',
      isVerified: false,
      otp,
      otpExpires,
    });

    tokenRecord.isActive = false;
    tokenRecord.usedBy = user._id;

    await tokenRecord.save();

    const delivery = await sendOTPToCustomer(
      user,
      otp
    );

    logActivity(
      user,
      `New engineer registration: ${user.name} (${user.email})`
    );

    return res.status(201).json({
      success: true,

      message: delivery.atLeastOneSent
        ? 'Engineer account created. Verification code sent through the available channels.'
        : 'Engineer account created, but OTP delivery failed. Please request a new code.',

      requiresVerification: true,

      emailSent: delivery.emailSent,
      whatsappSent: delivery.whatsappSent,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        permissions: user.permissions || [],
      },

      token: generateToken(user),
    });

  } catch (error) {
    console.error(
      'Engineer registration error:',
      error.stack
    );

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
    });
  }
};