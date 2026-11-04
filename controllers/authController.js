
// controllers/authController.js

import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { randomInt } from 'crypto';

import InviteToken from '../models/InviteToken.js';
import Activity from '../models/Activity.js';

// ==========================================
// 1. RESEND EMAIL CONFIGURATION
// ==========================================

let resendClient = null;

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is missing from environment variables.'
    );
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
};

// ==========================================
// 2. HELPER: ESCAPE HTML
// ==========================================

const escapeHTML = (value = '') => {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return entities[character];
  });
};

// ==========================================
// 3. HELPER: GENERATE OTP
// ==========================================

const generateOTP = () => {
  return randomInt(100000, 1000000).toString();
};

// ==========================================
// 4. HELPER: SEND OTP EMAIL
// ==========================================

const sendOTPEmail = async (
  email,
  name,
  otp,
  uniqueId = ''
) => {
  const resend = getResendClient();

  const senderEmail = process.env.EMAIL_FROM;

  if (!senderEmail) {
    throw new Error(
      'EMAIL_FROM is missing from environment variables.'
    );
  }

  const storeName =
    process.env.STORE_NAME || 'DIVINE SOLAR HUB';

  const safeName = escapeHTML(name);
  const safeStoreName = escapeHTML(storeName);

  try {
    const result = await resend.emails.send({
      from: `${storeName} <${senderEmail}>`,
      to: [email],

      subject: `Your Email Verification Code ${
        uniqueId ? `[Ref: ${uniqueId}]` : ''
      }`,

      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Email Verification</title>
          </head>

          <body style="
            margin:0;
            padding:20px;
            background:#f4f4f4;
            font-family:Arial,sans-serif;
            color:#333;
          ">

            <div style="
              max-width:500px;
              margin:20px auto;
              padding:30px;
              background:#ffffff;
              border-radius:10px;
            ">

              <h2 style="color:#222;">
                Hello ${safeName},
              </h2>

              <p>
                Thank you for registering with
                <strong>${safeStoreName}</strong>.
              </p>

              <p>
                Please verify your email address using
                the verification code below.
              </p>

              <div style="
                font-size:32px;
                font-weight:bold;
                color:#f68b1e;
                letter-spacing:5px;
                margin:25px 0;
                background:#f9fafb;
                padding:20px;
                text-align:center;
                border-radius:8px;
              ">
                ${otp}
              </div>

              <p>
                This verification code expires in
                <strong>10 minutes</strong>.
              </p>

              <p>
                If you did not create an account,
                please ignore this email.
              </p>

              <hr style="
                border:none;
                border-top:1px solid #eeeeee;
                margin:25px 0;
              " />

              <p style="
                font-size:13px;
                color:#777;
                text-align:center;
              ">
                ${safeStoreName}
              </p>

            </div>

          </body>
        </html>
      `
    });

    if (result.error) {
      console.error('RESEND API ERROR:', result.error);

      throw new Error(
        result.error.message || 'Resend failed to send the email.'
      );
    }

    console.log('OTP EMAIL ACCEPTED BY RESEND:', {
      recipient: email,
      emailId: result.data?.id
    });

    return result.data;

  } catch (error) {
    console.error('OTP EMAIL SENDING ERROR:', {
      recipient: email,
      message: error.message
    });

    throw error;
  }
};

// ==========================================
// 5. HELPER: GENERATE JWT
// ==========================================

const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is missing from environment variables.'
    );
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    }
  );
};

// ==========================================
// 6. HELPER: LOG USER ACTIVITY
// ==========================================

const logActivity = async (
  type,
  message,
  user
) => {
  try {
    await Activity.create({
      type,
      message,
      referenceId: user._id,
      performedBy: user._id
    });

  } catch (error) {
    console.error('ACTIVITY LOG ERROR:', error.message);
  }
};

// ==========================================
// 7. REGISTER USER
// ==========================================

export const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const userExists = await User.findOne({
      email: normalizedEmail
    });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists.'
      });
    }

    const phoneExists = await User.findOne({ phone });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is already in use.'
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
      isVerified: false,
      otp,
      otpExpires
    });

    let emailSent = false;

    try {
      await sendOTPEmail(
        normalizedEmail,
        name,
        otp
      );

      emailSent = true;

    } catch (emailError) {
      console.error(
        'REGISTRATION EMAIL FAILED:',
        emailError.message
      );
    }

    logActivity(
      'user',
      `New user registration: ${user.name} (${user.email})`,
      user
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

      emailSent,

      message: emailSent
        ? 'Registration successful. Verification code sent to your email.'
        : 'Account created, but email delivery failed. Please request a new verification code.'
    });

  } catch (error) {
    console.error('REGISTER USER ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed.',
      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};

// ==========================================
// 8. VERIFY OTP
// ==========================================

export const verifyOtp = async (req, res) => {
  try {
    const {
      email,
      otp
    } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.'
      });
    }

    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code. Please request a new one.'
      });
    }

    if (user.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code.'
      });
    }

    if (new Date() > new Date(user.otpExpires)) {
      return res.status(400).json({
        success: false,
        message: 'Code has expired. Please request a new one.'
      });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (error) {
    console.error('VERIFY OTP ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'OTP verification failed.',
      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};

// ==========================================
// 9. RESEND OTP
// ==========================================

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    }).select('+otp +otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified.'
      });
    }

    const otp = generateOTP();

    const otpExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    user.otp = otp;
    user.otpExpires = otpExpires;

    await user.save();

    const uniqueId = Date.now()
      .toString()
      .slice(-6);

    try {
      await sendOTPEmail(
        normalizedEmail,
        user.name,
        otp,
        uniqueId
      );

      return res.status(200).json({
        success: true,
        emailSent: true,
        message: 'New verification code sent successfully.'
      });

    } catch (emailError) {
      console.error('RESEND OTP FAILED:', {
        message: emailError.message
      });

      return res.status(500).json({
        success: false,
        emailSent: false,
        message: 'OTP generated, but email delivery failed. Please try again later.',
        ...(process.env.NODE_ENV !== 'production' && {
          debug: emailError.message
        })
      });
    }

  } catch (error) {
    console.error('RESEND OTP ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Unable to resend verification code.',
      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};

// ==========================================
// 10. LOGIN USER
// ==========================================

export const loginUser = async (req, res) => {

  // Diagnostic: confirms that the request reaches this controller.
  console.log('LOGIN CONTROLLER REACHED:', {
    method: req.method,
    path: req.originalUrl,
    emailProvided: Boolean(req.body?.email),
    passwordProvided: Boolean(req.body?.password)
  });

  try {
    const {
      email,
      password
    } = req.body || {};

    // Validate input types and values.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address and password are required.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    console.log('LOGIN: Searching for user.');

    const user = await User.findOne({
      email: normalizedEmail
    });

    if (!user) {
      console.log('LOGIN: User not found.');

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    console.log('LOGIN: User found. Checking password.');

    const passwordMatches = await user.matchPassword(password);

    if (!passwordMatches) {
      console.log('LOGIN: Password mismatch.');

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    console.log('LOGIN: Password matched.');

    if (!user.isVerified) {
      console.log('LOGIN: Email verification required.');

      return res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in.'
      });
    }

    console.log('LOGIN: Generating JWT.');

    const token = generateToken(user);

    console.log('LOGIN: Authentication successful.');

    return res.status(200).json({
      success: true,

      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,

      permissions: user.permissions || [],

      token
    });

  } catch (error) {

    console.error('LOGIN CONTROLLER ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Login failed due to a server error.',

      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};

// ==========================================
// 11. GET PROFILE
// ==========================================

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(
      req.user._id
    ).select('-password -otp -otpExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,

      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,

      permissions: user.permissions || []
    });

  } catch (error) {
    console.error('GET PROFILE ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user profile.',
      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};

// ==========================================
// 12. REGISTER ENGINEER
// ==========================================

export const registerEngineer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      inviteCode
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields.'
      });
    }

    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        message: 'Engineer invite code is required.'
      });
    }

    const tokenRecord = await InviteToken.findOne({
      token: inviteCode,
      isActive: true
    });

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or already used invite code. Contact admin for access.'
      });
    }

    if (
      !tokenRecord.expiresAt ||
      new Date() > new Date(tokenRecord.expiresAt)
    ) {
      tokenRecord.isActive = false;
      await tokenRecord.save();

      return res.status(400).json({
        success: false,
        message: 'This invite code has expired. Please request a new one from admin.'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const emailExists = await User.findOne({
      email: normalizedEmail
    });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    const phoneExists = await User.findOne({ phone });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this phone number already exists.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.'
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
      otpExpires
    });

    tokenRecord.isActive = false;
    tokenRecord.usedBy = user._id;

    await tokenRecord.save();

    let emailSent = false;

    try {
      await sendOTPEmail(
        normalizedEmail,
        name,
        otp
      );

      emailSent = true;

    } catch (emailError) {
      console.error(
        'ENGINEER REGISTRATION EMAIL FAILED:',
        emailError.message
      );
    }

    logActivity(
      'user',
      `New engineer registration: ${user.name} (${user.email})`,
      user
    );

    return res.status(201).json({
      success: true,

      message: emailSent
        ? 'Engineer account created! Verification code sent to your email.'
        : 'Engineer account created, but email delivery failed. Please request a new verification code.',

      emailSent,

      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        permissions: user.permissions || []
      },

      token: generateToken(user)
    });

  } catch (error) {
    console.error('ENGINEER REGISTRATION ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      ...(process.env.NODE_ENV !== 'production' && {
        debug: error.message
      })
    });
  }
};
