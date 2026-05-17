import express from 'express';
import { registerUser, loginUser, getProfile, verifyOtp, resendOtp, registerEngineer } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/register-engineer', registerEngineer);  // ✅ NEW: Engineer registration
router.post('/login', loginUser);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.get('/profile', protect, getProfile);

export default router;