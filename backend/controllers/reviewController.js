import reviewService from '../services/reviewService.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createReviewSchema, updateReviewSchema } from '../validators/reviewValidator.js';

export const createReview = asyncHandler(async (req, res) => {
  const { error, value } = createReviewSchema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400);
  }

  const review = await reviewService.createReview(req.user.id, value);
  return sendSuccess(res, 'Review created successfully', review, 201);
});

export const getScrapperReviews = asyncHandler(async (req, res) => {
  const { scrapperId } = req.params;
  const result = await reviewService.getReviewsByScrapper(scrapperId, req.query);
  return sendSuccess(res, 'Reviews fetched successfully', result);
});

export const getMyReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getMyReviews(req.user.id, req.query);
  return sendSuccess(res, 'My reviews fetched successfully', result);
});

export const getReviewById = asyncHandler(async (req, res) => {
  const { id } = req.params; // reviewId
  const review = await reviewService.getReviewById(id);
  return sendSuccess(res, 'Review fetched successfully', review);
});

export const updateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error, value } = updateReviewSchema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400);
  }

  const review = await reviewService.updateReview(id, req.user.id, value);
  return sendSuccess(res, 'Review updated successfully', review);
});

export const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await reviewService.deleteReview(id, req.user.id, req.user.role);
  return sendSuccess(res, 'Review deleted successfully');
});

// Admin Controllers

export const getAllReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getAllReviews(req.query);
  return sendSuccess(res, 'All reviews fetched successfully', result);
});

export const getAdminReviewById = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const review = await reviewService.getReviewById(reviewId);
  return sendSuccess(res, 'Review fetched successfully', review);
});

export const approveReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const review = await reviewService.updateReviewStatus(reviewId, 'approved');
  return sendSuccess(res, 'Review approved successfully', review);
});

export const rejectReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const review = await reviewService.updateReviewStatus(reviewId, 'rejected');
  return sendSuccess(res, 'Review rejected successfully', review);
});

export const deleteAdminReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  await reviewService.deleteReview(reviewId, req.user.id, 'admin');
  return sendSuccess(res, 'Review deleted successfully');
});

export const getReviewAnalytics = asyncHandler(async (req, res) => {
  const stats = await reviewService.getReviewAnalytics();
  return sendSuccess(res, 'Review analytics fetched successfully', stats);
});

