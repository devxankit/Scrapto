import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  verifyOTP,
  resendOTP,
  sendLoginOTP,
  refreshToken,
  logoutAll,
  logout
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js';
import {
  registerValidator,
  loginValidator,
  verifyOTPValidator,
  resendOTPValidator,
  sendLoginOTPValidator,
  refreshTokenValidator
} from '../validators/authValidator.js';
import {
  authRateLimiter,
  loginAccountLimiter,
  registerRateLimiter,
  otpSendIpLimiter,
  otpSendPhoneLimiter,
  otpVerifyIpLimiter,
  otpVerifyPhoneLimiter,
  refreshRateLimiter
} from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', registerRateLimiter, otpSendPhoneLimiter, registerValidator, validate, register);
router.post('/login', authRateLimiter, loginAccountLimiter, loginValidator, validate, login);
router.post('/verify-otp', otpVerifyIpLimiter, otpVerifyPhoneLimiter, verifyOTPValidator, validate, verifyOTP);
router.post('/resend-otp', otpSendIpLimiter, otpSendPhoneLimiter, resendOTPValidator, validate, resendOTP);
router.post('/login-otp', otpSendIpLimiter, otpSendPhoneLimiter, sendLoginOTPValidator, validate, sendLoginOTP);
router.post('/refresh-token', refreshRateLimiter, refreshTokenValidator, validate, refreshToken);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);

export default router;
