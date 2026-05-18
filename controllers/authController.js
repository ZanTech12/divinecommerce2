// controllers/authController.js
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import InviteToken from '../models/InviteToken.js';

// ✅ Resend Setup
const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resend) {
  console.error('⚠️ WARNING: RESEND_API_KEY is missing. OTP emails will not be sent.');
}

// ✅ Helper: Send OTP Email
const sendOTPEmail = async (email, name, otp, uniqueId = '') => {
  if (!resend) throw new Error('RESEND_API_KEY is not configured');

  const { error } = await resend.emails.send({
    from: `"${process.env.STORE_NAME || 'MallHub'}" <onboarding@resend.dev>`,
    to: email,
    subject: `Your Email Verification Code ${uniqueId ? `[Ref: ${uniqueId}]` : ''}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hello ${name},</h2>
        <p>Thank you for registering! Please verify your email address to continue. Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; color: #f68b1e; letter-spacing: 5px; margin: 20px 0; background: #f9fafb; padding: 15px; text-align: center; border-radius: 8px;">
          ${otp}
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      </div>
    `,
  });

  if (error) throw error;
};

// ✅ Helper: Generate JWT
// Note: We DO NOT put permissions in the JWT because they can be updated 
// by the admin at any time. The middleware fetches fresh permissions from the DB.
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role }, 
    process.env.JWT_SECRET, 
    { expiresIn: '30d' }
  );
};

// ==========================================
// 1. REGISTER
// ==========================================
export const registerUser = async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const phoneExists = await User.findOne({ phone });
    if (phoneExists) return res.status(400).json({ message: 'Phone number is already in use' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({ 
      name, email, phone, password,
      isVerified: false,
      otp,
      otpExpires
    });

    console.log(`🔑 OTP for ${email}: ${otp}`);

    try {
      await sendOTPEmail(email, name, otp);
    } catch (emailError) {
      console.error('⚠️ Failed to send OTP email:', emailError.message);
    }
    
    res.status(201).json({
      _id: user._id, name: user.name, email: user.email, 
      phone: user.phone, role: user.role, isVerified: user.isVerified,
      permissions: user.permissions || [], // ✅ NEW: Return permissions (empty for regular users)
      token: generateToken(user)
    });
  } catch (error) {
    console.error(error.stack);
    if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 2. VERIFY OTP
// ==========================================
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 3. RESEND OTP
// ==========================================
export const resendOtp = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    console.log(`🔑 New OTP for ${email}: ${otp}`);

    const uniqueId = Date.now().toString().slice(-6);

    try {
      await sendOTPEmail(email, user.name, otp, uniqueId);
      res.status(200).json({ message: 'New verification code sent successfully.' });
    } catch (emailError) {
      console.error('⚠️ Failed to resend OTP email:', emailError.message);
      res.status(500).json({ message: 'OTP generated, but failed to send email. Please try again later.' });
    }
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 4. LOGIN
// ==========================================
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    // ✅ Fetch permissions along with user data
    const user = await User.findOne({ email });
    
    if (user && (await user.matchPassword(password))) {
      if (!user.isVerified) {
        return res.status(403).json({ message: 'Please verify your email address before logging in.' });
      }

      res.json({
        _id: user._id, name: user.name, email: user.email, 
        phone: user.phone, role: user.role,
        permissions: user.permissions || [], // ✅ NEW: Crucial for frontend routing
        token: generateToken(user)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 5. GET PROFILE
// ==========================================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -otp -otpExpires");
    res.json({ 
      _id: user._id, name: user.name, email: user.email, 
      phone: user.phone, role: user.role, isVerified: user.isVerified,
      permissions: user.permissions || [] // ✅ NEW: Keep frontend state synced
    });
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 6. REGISTER ENGINEER ✅ UPDATED
// ==========================================
export const registerEngineer = async (req, res) => {
  const { name, email, phone, password, inviteCode } = req.body;

  try {
    // ✅ Step 1: Validate invite code from DATABASE instead of .env
    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        message: "Engineer invite code is required.",
      });
    }

    const tokenRecord = await InviteToken.findOne({ token: inviteCode, isActive: true });

    if (!tokenRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or already used invite code. Contact admin for access.",
      });
    }

    // ✅ Step 2: Check if token has expired
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      tokenRecord.isActive = false; // Soft delete expired token
      await tokenRecord.save();
      
      return res.status(400).json({
        success: false,
        message: "This invite code has expired. Please request a new one from admin.",
      });
    }

    // ✅ Step 3: Check if email already exists
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // ✅ Step 4: Check if phone already exists
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: "An account with this phone number already exists.",
      });
    }

    // ✅ Step 5: Validate password length
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // ✅ Step 6: Generate OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // ✅ Step 7: Create user with engineer role
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role: "engineer",
      isVerified: false,
      otp,
      otpExpires,
    });

    console.log(`🔧 Engineer OTP for ${email}: ${otp}`);

    // ✅ Step 8: Mark invite token as used
    tokenRecord.isActive = false;
    tokenRecord.usedBy = user._id;
    await tokenRecord.save();

    // ✅ Step 9: Send OTP email (same as normal register)
    try {
      await sendOTPEmail(email, name, otp);
    } catch (emailError) {
      console.error('⚠️ Failed to send OTP email:', emailError.message);
    }

    // ✅ Step 10: Return success with token
    res.status(201).json({
      success: true,
      message: "Engineer account created! Please verify your email.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        permissions: user.permissions || [], // ✅ NEW
      },
      token: generateToken(user),
    });
  } catch (error) {
    console.error("Engineer register error:", error.stack);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
};