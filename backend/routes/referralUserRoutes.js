import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { USER_ROLES } from '../config/constants.js';
import { getMyReferrals, getReferralLeaderboard } from '../controllers/referralUserController.js';

const router = express.Router();

// Read-only referral views for the user and partner apps. The admin referral
// configuration lives separately under /admin/referral-system.
router.use(protect, authorize(USER_ROLES.USER, USER_ROLES.SCRAPPER));

router.get('/me', getMyReferrals);
router.get('/leaderboard', getReferralLeaderboard);

export default router;
