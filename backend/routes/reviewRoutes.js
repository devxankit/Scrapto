import express from 'express';
import {
  createReview,
  getScrapperReviews,
  getMyReviews,
  getReviewById,
  updateReview,
  deleteReview
} from '../controllers/reviewController.js';
import { protect, authorize } from '../middleware/auth.js';
import { USER_ROLES } from '../config/constants.js';

const router = express.Router();

// All review routes require authentication
router.use(protect);

// Specific paths MUST be registered before the generic /:id route, otherwise
// "my-reviews" is matched as an :id and returns a cast error.
router.get('/my-reviews', authorize(USER_ROLES.USER), getMyReviews);
router.get('/scrapper/:scrapperId', getScrapperReviews);

router.post('/', authorize(USER_ROLES.USER), createReview);
router.get('/:id', getReviewById);
router.put('/:id', authorize(USER_ROLES.USER), updateReview);
router.delete('/:id', authorize(USER_ROLES.USER, USER_ROLES.ADMIN), deleteReview);

export default router;
