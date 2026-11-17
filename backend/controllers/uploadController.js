import { uploadFile, uploadMultipleFiles } from '../services/uploadService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { AppError } from '../utils/security.js';
import logger from '../utils/logger.js';

// Upload multiple order images (public assets — shown to scrappers/users)
export const uploadOrderImages = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return sendError(res, 'No files provided', 400);
  }

  try {
    const results = await uploadMultipleFiles(files, { folder: 'orders', allow: 'image' });
    return sendSuccess(
      res,
      'Images uploaded successfully',
      { files: results.map((r) => ({ url: r.secure_url, publicId: r.publicId })) },
      201
    );
  } catch (error) {
    if (error instanceof AppError) return sendError(res, error.message, error.statusCode);
    logger.error('Order image upload error', { error: error.message });
    return sendError(res, 'Failed to upload images', 500);
  }
});

// Upload KYC documents — PRIVATE assets; only publicIds are returned.
export const uploadKycDocs = asyncHandler(async (req, res) => {
  const fileList = [];
  if (req.files) {
    Object.values(req.files).forEach((arr) => fileList.push(...arr));
  }
  if (!fileList.length) {
    return sendError(res, 'No files provided', 400);
  }

  try {
    const results = await uploadMultipleFiles(fileList, {
      folder: 'kyc',
      private: true,
      allow: 'document'
    });
    // Deliberately NOT returning URLs: KYC assets are only served through the
    // audited, signed-URL endpoints.
    return sendSuccess(
      res,
      'KYC documents uploaded successfully',
      { files: results.map((r) => ({ publicId: r.publicId, resourceType: r.resource_type })) },
      201
    );
  } catch (error) {
    if (error instanceof AppError) return sendError(res, error.message, error.statusCode);
    logger.error('KYC upload error', { error: error.message });
    return sendError(res, 'Failed to upload documents', 500);
  }
});

// Admin system media (banners, tutorial videos)
export const uploadSystemMedia = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return sendError(res, 'No file uploaded', 400);
  }

  try {
    const file = files[0];
    const result = await uploadFile(file, { folder: 'system', allow: 'any' });
    return sendSuccess(res, 'Media uploaded successfully', {
      url: result.secure_url,
      publicId: result.publicId
    });
  } catch (error) {
    if (error instanceof AppError) return sendError(res, error.message, error.statusCode);
    logger.error('System media upload error', { error: error.message });
    return sendError(res, 'Failed to upload media', 500);
  }
});
