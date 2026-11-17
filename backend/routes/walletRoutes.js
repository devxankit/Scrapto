import express from 'express';
import { protect } from '../middleware/auth.js';
import { financialRateLimiter } from '../middleware/rateLimiter.js';
import {
    getWalletProfile,
    getWalletTransactions,
    createRechargeOrder,
    verifyRecharge,
    payOrderViaWallet,
    requestWithdrawal,
    applyCoupon,
    getAvailableCoupons
} from '../controllers/walletController.js';

const router = express.Router();

router.get('/profile', protect, getWalletProfile);
router.get('/transactions', protect, getWalletTransactions);

// Recharge
router.post('/recharge/create', protect, financialRateLimiter, createRechargeOrder);
router.post('/recharge/verify', protect, financialRateLimiter, verifyRecharge);

// Payments
router.post('/pay-order', protect, financialRateLimiter, payOrderViaWallet);

// Withdrawals
router.post('/withdraw', protect, financialRateLimiter, requestWithdrawal);

// Coupons
router.post('/apply-coupon', protect, financialRateLimiter, applyCoupon);
router.get('/coupons', protect, getAvailableCoupons);

export default router;
