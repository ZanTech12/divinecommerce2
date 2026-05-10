import express from 'express';
import { registerUser, loginUser, getProfile, verifyOtp, resendOtp } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp); // ✅ Connects the resend function
router.get('/profile', protect, getProfile);

export default router;