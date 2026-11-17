import multer from 'multer';
import { uploadBufferToCloudinary, deleteFromCloudinary, signedAssetUrl } from '../config/cloudinary.js';
import { FILE_TYPES } from '../config/constants.js';
import logger from '../utils/logger.js';
import { AppError } from '../utils/security.js';

/**
 * Upload pipeline.
 *
 *  - memory storage with STRICT per-field size limits (no 100MB in-RAM uploads);
 *  - MIME header is treated as untrusted: the real file type is derived from
 *    magic bytes (detectFileType) and must match an allow-list;
 *  - KYC documents are uploaded as PRIVATE Cloudinary assets
 *    (type=authenticated) and are only ever served via short-lived signed URLs.
 */

export const LIMITS = {
  IMAGE_BYTES: 8 * 1024 * 1024,     // 8 MB
  DOCUMENT_BYTES: 10 * 1024 * 1024, // 10 MB
  VIDEO_BYTES: 50 * 1024 * 1024     // 50 MB
};

const MAGIC = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { type: 'image/gif', ext: 'gif', test: (b) => b.slice(0, 3).toString('ascii') === 'GIF' },
  {
    type: 'image/heic',
    ext: 'heic',
    test: (b) => b.slice(4, 8).toString('ascii') === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(b.slice(8, 12).toString('ascii'))
  },
  { type: 'application/pdf', ext: 'pdf', test: (b) => b.slice(0, 5).toString('ascii') === '%PDF-' },
  {
    type: 'video/mp4',
    ext: 'mp4',
    test: (b) => b.slice(4, 8).toString('ascii') === 'ftyp' && ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'qt  '].includes(b.slice(8, 12).toString('ascii'))
  },
  { type: 'video/quicktime', ext: 'mov', test: (b) => b.slice(4, 12).toString('ascii') === 'ftypqt  ' },
  { type: 'video/webm', ext: 'webm', test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 }
];

/** Identify a buffer's true type from its signature. Returns null when unknown. */
export const detectFileType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const head = buffer.slice(0, 32);
  for (const entry of MAGIC) {
    try {
      if (entry.test(head)) return { mime: entry.type, ext: entry.ext };
    } catch {
      // keep probing
    }
  }
  return null;
};

const ALLOWED_IMAGE = new Set(FILE_TYPES.IMAGE);
const ALLOWED_DOCUMENT = new Set(FILE_TYPES.DOCUMENT);
const ALLOWED_VIDEO = new Set(FILE_TYPES.VIDEO);

/**
 * Validate a multer file against its real content type.
 * @param {Object} file multer file (memory storage)
 * @param {Object} options { allow: 'image' | 'document' | 'video' | 'any' }
 */
export const assertSafeFile = (file, { allow = 'any' } = {}) => {
  if (!file?.buffer) throw new AppError('Invalid upload', 400);
  const detected = detectFileType(file.buffer);
  if (!detected) {
    throw new AppError(`Unsupported or corrupted file: ${file.originalname}`, 400);
  }

  const isImage = ALLOWED_IMAGE.has(detected.mime);
  const isDoc = ALLOWED_DOCUMENT.has(detected.mime);
  const isVideo = ALLOWED_VIDEO.has(detected.mime);

  if (allow === 'image' && !isImage) {
    throw new AppError('Only image files are allowed here', 400);
  }
  if (allow === 'document' && !(isImage || isDoc)) {
    throw new AppError('Only image or PDF files are allowed here', 400);
  }
  if (allow === 'video' && !isVideo) {
    throw new AppError('Only video files are allowed here', 400);
  }
  if (allow === 'any' && !(isImage || isDoc || isVideo)) {
    throw new AppError('Unsupported file type', 400);
  }

  const limit = isVideo ? LIMITS.VIDEO_BYTES : isDoc ? LIMITS.DOCUMENT_BYTES : LIMITS.IMAGE_BYTES;
  if (file.size > limit) {
    throw new AppError(`File too large. Maximum ${Math.round(limit / (1024 * 1024))}MB allowed.`, 413);
  }

  return detected;
};

const storage = multer.memoryStorage();

const makeUpload = (maxBytes, maxFiles) =>
  multer({
    storage,
    limits: { fileSize: maxBytes, files: maxFiles, fields: 30, parts: maxFiles + 30 },
    fileFilter: (req, file, cb) => {
      // Cheap pre-filter on the declared type; the real check is assertSafeFile.
      const declared = file.mimetype || '';
      if (ALLOWED_IMAGE.has(declared) || ALLOWED_DOCUMENT.has(declared) || ALLOWED_VIDEO.has(declared)) {
        cb(null, true);
      } else {
        cb(new AppError('Invalid file type. Only images, PDFs and videos are allowed.', 400), false);
      }
    }
  });

/**
 * Upload a validated file to Cloudinary.
 * @param {Object} options.private  true -> type=authenticated (requires signed URL to read)
 */
export const uploadFile = async (file, options = {}) => {
  if (!file) {
    throw new AppError('No file provided', 400);
  }

  const detected = assertSafeFile(file, { allow: options.allow || 'any' });

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new AppError('File storage is not configured on the server', 503);
  }

  const resourceType = options.resource_type
    || (ALLOWED_VIDEO.has(detected.mime) ? 'video' : ALLOWED_DOCUMENT.has(detected.mime) && detected.mime === 'application/pdf' ? 'image' : 'image');

  const result = await uploadBufferToCloudinary(file.buffer, {
    folder: options.folder || 'general',
    resource_type: resourceType,
    public_id: options.public_id || null,
    private: options.private === true
  });

  logger.info('[upload] stored asset', {
    folder: options.folder,
    private: options.private === true,
    bytes: result.bytes
  });

  return result;
};

export const uploadMultipleFiles = async (files, options = {}) => {
  if (!files || files.length === 0) {
    throw new AppError('No files provided', 400);
  }
  // Validate all before uploading any, so a bad file does not leave partial state.
  files.forEach((file) => assertSafeFile(file, { allow: options.allow || 'any' }));

  const results = [];
  for (let i = 0; i < files.length; i += 1) {
    results.push(await uploadFile(files[i], {
      ...options,
      public_id: options.public_id ? `${options.public_id}_${i}` : null
    }));
  }
  return results;
};

export const deleteFile = async (publicId, resource_type = 'image', isPrivate = false) => {
  try {
    return await deleteFromCloudinary(publicId, resource_type, isPrivate);
  } catch (error) {
    logger.error('File deletion error:', { error: error.message });
    throw error;
  }
};

export { signedAssetUrl };

// Multer middleware exports (bounded)
export const uploadSingle = (fieldName, maxBytes = LIMITS.IMAGE_BYTES) =>
  makeUpload(maxBytes, 1).single(fieldName);
export const uploadMultiple = (fieldName, maxCount = 5, maxBytes = LIMITS.IMAGE_BYTES) =>
  makeUpload(maxBytes, maxCount).array(fieldName, maxCount);
export const uploadFields = (fields, maxBytes = LIMITS.DOCUMENT_BYTES) => {
  const maxFiles = fields.reduce((sum, f) => sum + (f.maxCount || 1), 0);
  return makeUpload(maxBytes, maxFiles).fields(fields);
};

export default {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  assertSafeFile,
  detectFileType,
  signedAssetUrl,
  LIMITS
};
