import express from 'express';
import {
    getMyProfile,
    updateMyProfile,
    getScrapperPublicProfile,
    updateFcmToken,
    getScrapperStats
} from '../controllers/scrapperController.js';
import { protect, authorize } from '../middleware/auth.js';
import { USER_ROLES } from '../config/constants.js';

const router = express.Router();

// Protected routes (Scrapper only) - Register specific routes before parameterized routes
router.get('/me', protect, authorize(USER_ROLES.SCRAPPER), getMyProfile);
router.put('/me', protect, authorize(USER_ROLES.SCRAPPER), updateMyProfile);
router.post('/fcm-token', protect, authorize(USER_ROLES.SCRAPPER), updateFcmToken);
router.get('/stats', protect, authorize(USER_ROLES.SCRAPPER), getScrapperStats);

// Public / User access to scrapper profile
router.get('/:id/profile', protect, getScrapperPublicProfile);
router.get('/:id', protect, getScrapperPublicProfile);

export default router;
