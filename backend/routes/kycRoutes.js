import express from 'express';
import { protect, isScrapper, isAdmin } from '../middleware/auth.js';
import { uploadFields, LIMITS } from '../services/uploadService.js';
import { uploadRateLimiter } from '../middleware/rateLimiter.js';
import {
  submitKyc,
  getMyKyc,
  verifyKyc,
  rejectKyc,
  getAllScrappersWithKyc,
  getKycDocuments
} from '../controllers/kycController.js';

const router = express.Router();

// Scrapper: submit and view own KYC
router.post(
  '/',
  protect,
  isScrapper,
  uploadRateLimiter,
  uploadFields(
    [
      { name: 'aadhaar', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
      { name: 'license', maxCount: 1 }
    ],
    LIMITS.DOCUMENT_BYTES
  ),
  submitKyc
);

router.get('/me', protect, isScrapper, getMyKyc);

// Admin actions
router.get('/scrappers', protect, isAdmin, getAllScrappersWithKyc);
router.get('/:id/documents', protect, isAdmin, getKycDocuments);
router.post('/:id/verify', protect, isAdmin, verifyKyc);
router.post('/:id/reject', protect, isAdmin, rejectKyc);

export default router;
