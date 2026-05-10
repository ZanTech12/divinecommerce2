// controllers/authController.js
import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend'; // ✅ Replaced nodemailer with resend

// ✅ Resend Setup (Works perfectly on Render/Vercel)
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
    // ⚠️ IMPORTANT: You MUST use onboarding@resend.dev until you verify your own domain in Resend!
    from: `"${process.env.STORE_NAME || 'MallHub'}" <onboarding@resend.dev>`,
    to: email,
    // uniqueId makes the subject slightly different so Gmail doesn't block the resend
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

  if (error) throw error; // Let the controller's catch block handle it
};

// ✅ Helper: Generate JWT
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

    console.log(`🔑 OTP for ${email}: ${otp}`); // Show in terminal for testing

    try {
      await sendOTPEmail(email, name, otp);
    } catch (emailError) {
      console.error('⚠️ Failed to send OTP email:', emailError.message);
      // We don't throw here so the user still gets registered successfully
    }
    
    res.status(201).json({
      _id: user._id, name: user.name, email: user.email, 
      phone: user.phone, role: user.role, isVerified: user.isVerified,
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
    // ⚠️ CRITICAL: .select('+otp +otpExpires') is required because they are set to `select: false` in User.js
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
    // ⚠️ CRITICAL: .select('+otp +otpExpires') is required to overwrite the hidden fields
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    // Generate NEW 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update user in database
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    console.log(`🔑 New OTP for ${email}: ${otp}`); // Show in terminal

    // Generate a short unique ID to force Gmail to see this as a NEW email, not a duplicate
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
    // We don't need .select('+password') here because password is NOT set to select: false in your schema
    const user = await User.findOne({ email });
    
    if (user && (await user.matchPassword(password))) {
      if (!user.isVerified) {
        return res.status(403).json({ message: 'Please verify your email address before logging in.' });
      }

      res.json({
        _id: user._id, name: user.name, email: user.email, 
        phone: user.phone, role: user.role,
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
    // OTP and Password are automatically hidden here (select: false works its magic)
    const user = await User.findById(req.user._id).select("-password");
    res.json({ 
      _id: user._id, name: user.name, email: user.email, 
      phone: user.phone, role: user.role, isVerified: user.isVerified 
    });
  } catch (error) {
    console.error(error.stack);
    res.status(500).json({ message: error.message });
  }
};