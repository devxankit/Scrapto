import express from 'express';
import { protect, isUser, isScrapper, authorize } from '../middleware/auth.js';
import { uploadMultiple, uploadFields, uploadFile, LIMITS } from '../services/uploadService.js';
import { uploadRateLimiter } from '../middleware/rateLimiter.js';
import { uploadOrderImages, uploadKycDocs, uploadSystemMedia } from '../controllers/uploadController.js';

const router = express.Router();

// Order images (user)
router.post(
  '/order-images',
  protect,
  isUser,
  uploadRateLimiter,
  uploadMultiple('images', 5, LIMITS.IMAGE_BYTES),
  uploadOrderImages
);

// KYC documents (scrapper) — stored as PRIVATE assets
router.post(
  '/kyc-docs',
  protect,
  isScrapper,
  uploadRateLimiter,
  uploadFields(
    [
      { name: 'aadhaar', maxCount: 2 },
      { name: 'selfie', maxCount: 1 },
      { name: 'license', maxCount: 2 }
    ],
    LIMITS.DOCUMENT_BYTES
  ),
  uploadKycDocs
);

// System media (admin)
router.post(
  '/system-media',
  protect,
  authorize('admin'),
  uploadRateLimiter,
  uploadMultiple('media', 1, LIMITS.VIDEO_BYTES),
  uploadSystemMedia
);

export default router;
