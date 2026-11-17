import Scrapper from '../models/Scrapper.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { uploadFile, signedAssetUrl } from '../services/uploadService.js';
import logger from '../utils/logger.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';
import { encryptField, normalizeAadhaar, maskAadhaar } from '../utils/fieldEncryption.js';
import { recordAudit } from '../services/auditService.js';
import {
  parsePagination,
  assertObjectId,
  asString,
  pickEnum,
  safeSearchRegex,
  AppError
} from '../utils/security.js';

const DOC_URL_TTL_SECONDS = 300; // 5 minutes

/** Resolve stored private document references into short-lived signed URLs. */
const buildSignedDocumentUrls = (documents) => {
  if (!documents) return {};
  const out = {};
  for (const key of ['aadhaar', 'selfie', 'license']) {
    const doc = documents[key];
    if (doc?.publicId) {
      out[`${key}Url`] = signedAssetUrl(doc.publicId, {
        resourceType: doc.resourceType || 'image',
        expiresInSeconds: DOC_URL_TTL_SECONDS
      });
    }
  }
  return out;
};

/** Public-safe view of a scrapper's own KYC state (never the Aadhaar number). */
const publicKycView = (scrapper) => ({
  status: scrapper.kyc?.status || 'not_submitted',
  aadhaarMasked: maskAadhaar(scrapper.kyc?.aadhaarLast4),
  submittedAt: scrapper.kyc?.submittedAt || null,
  verifiedAt: scrapper.kyc?.verifiedAt || null,
  rejectionReason: scrapper.kyc?.rejectionReason || null
});

// @desc Submit or update KYC
// @route POST /api/kyc
// @access Private (Scrapper)
export const submitKyc = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rawAadhaar = asString(req.body.aadhaarNumber, 20);

  const user = await User.findById(userId);
  if (!user || user.role !== 'scrapper') {
    return sendError(res, 'Scrapper user not found', 404);
  }

  let scrapper = await Scrapper.findById(userId).select('+kyc.documents');
  if (!scrapper) {
    scrapper = await Scrapper.create({
      _id: user._id,
      phone: user.phone,
      name: user.name || 'Scrapper',
      email: user.email,
      vehicleInfo: { type: 'bike', number: 'NA', capacity: 0 },
      kyc: { status: 'not_submitted' }
    });
  }

  if (scrapper.kyc?.status === 'verified') {
    return sendError(res, 'Your KYC is already verified. Contact support to change your documents.', 409);
  }

  const files = req.files || {};
  const aadhaarFile = files.aadhaar?.[0] || null;
  const selfieFile = files.selfie?.[0] || null;
  const licenseFile = files.license?.[0] || null;

  const hasExistingDocs = !!scrapper.kyc?.documents?.selfie?.publicId;
  if (!selfieFile && !hasExistingDocs) {
    return sendError(res, 'Selfie photo is required.', 400);
  }

  const aadhaarNumber = normalizeAadhaar(rawAadhaar);
  if (!aadhaarNumber) {
    return sendError(res, 'Please provide a valid 12-digit Aadhaar number.', 400);
  }

  // Upload as PRIVATE assets (never publicly reachable URLs).
  const documents = { ...(scrapper.kyc?.documents || {}) };
  try {
    const now = new Date();
    if (aadhaarFile) {
      const result = await uploadFile(aadhaarFile, { folder: 'kyc/aadhaar', private: true, allow: 'document' });
      documents.aadhaar = {
        publicId: result.publicId,
        resourceType: result.resource_type,
        format: result.format,
        bytes: result.bytes,
        uploadedAt: now
      };
    }
    if (selfieFile) {
      const result = await uploadFile(selfieFile, { folder: 'kyc/selfie', private: true, allow: 'image' });
      documents.selfie = {
        publicId: result.publicId,
        resourceType: result.resource_type,
        format: result.format,
        bytes: result.bytes,
        uploadedAt: now
      };
    }
    if (licenseFile) {
      const result = await uploadFile(licenseFile, { folder: 'kyc/license', private: true, allow: 'document' });
      documents.license = {
        publicId: result.publicId,
        resourceType: result.resource_type,
        format: result.format,
        bytes: result.bytes,
        uploadedAt: now
      };
    }
  } catch (uploadError) {
    if (uploadError instanceof AppError) {
      return sendError(res, uploadError.message, uploadError.statusCode);
    }
    logger.error('Error uploading KYC documents', { error: uploadError.message });
    return sendError(res, 'Failed to upload documents. Please try again.', 500);
  }

  // Aadhaar is encrypted at rest; only the last 4 digits are kept in clear
  // for display. The number is never logged.
  scrapper.kyc = {
    aadhaarNumber: encryptField(aadhaarNumber),
    aadhaarLast4: aadhaarNumber.slice(-4),
    documents,
    status: 'pending',
    submittedAt: new Date(),
    rejectionReason: null,
    verifiedAt: null,
    verifiedBy: null
  };
  await scrapper.save();

  await recordAudit({
    actorId: userId,
    actorRole: 'scrapper',
    action: 'KYC_SUBMITTED',
    targetType: 'Scrapper',
    targetId: userId,
    ip: req.ip
  });

  logger.info('KYC submitted', { scrapperId: scrapper._id.toString() });

  return sendSuccess(res, 'KYC submitted successfully', { kyc: publicKycView(scrapper) }, 201);
});

// @desc Get own KYC status
// @route GET /api/kyc/me
// @access Private (Scrapper)
export const getMyKyc = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== 'scrapper') {
    return sendError(res, 'Scrapper user not found', 404);
  }

  let scrapper = await Scrapper.findById(user._id).select('+kyc.documents');
  if (!scrapper) {
    scrapper = await Scrapper.create({
      _id: user._id,
      phone: user.phone,
      name: user.name || 'Scrapper',
      email: user.email || null,
      vehicleInfo: { type: 'bike', number: 'NA', capacity: 0 },
      kyc: { status: 'not_submitted' }
    });
  }

  // The owner may view their own documents via short-lived signed URLs.
  const documentUrls = buildSignedDocumentUrls(scrapper.kyc?.documents);

  return sendSuccess(res, 'KYC status retrieved', {
    kyc: { ...publicKycView(scrapper), ...documentUrls },
    subscription: scrapper.subscription
  });
});

// @desc Admin verify KYC
// @route POST /api/kyc/:id/verify
// @access Private (Admin)
export const verifyKyc = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'scrapper id');
  const scrapper = await Scrapper.findById(id);
  if (!scrapper) return sendError(res, 'Scrapper not found', 404);

  if (scrapper.kyc?.status !== 'pending' && scrapper.kyc?.status !== 'rejected') {
    return sendError(res, `Cannot verify KYC in status '${scrapper.kyc?.status}'`, 409);
  }

  scrapper.kyc.status = 'verified';
  scrapper.kyc.verifiedAt = new Date();
  scrapper.kyc.verifiedBy = req.user.id;
  scrapper.kyc.rejectionReason = null;
  await scrapper.save();

  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'KYC_VERIFIED',
    targetType: 'Scrapper',
    targetId: id,
    ip: req.ip
  });

  sendNotificationToUser(scrapper._id.toString(), {
    title: 'KYC Verified ✅',
    body: 'Your KYC has been successfully verified. You can now start accepting orders.',
    data: { type: 'kyc_verified' }
  });

  return sendSuccess(res, 'KYC verified', { kyc: publicKycView(scrapper) });
});

// @desc Admin reject KYC
// @route POST /api/kyc/:id/reject
// @access Private (Admin)
export const rejectKyc = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'scrapper id');
  const reason = asString(req.body.reason, 300);

  const scrapper = await Scrapper.findById(id);
  if (!scrapper) return sendError(res, 'Scrapper not found', 404);

  scrapper.kyc.status = 'rejected';
  scrapper.kyc.rejectionReason = reason || 'Not specified';
  scrapper.kyc.verifiedAt = null;
  scrapper.kyc.verifiedBy = req.user.id;
  await scrapper.save();

  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'KYC_REJECTED',
    targetType: 'Scrapper',
    targetId: id,
    metadata: { reason },
    ip: req.ip
  });

  sendNotificationToUser(scrapper._id.toString(), {
    title: 'KYC Rejected ❌',
    body: `Your KYC was rejected. Reason: ${scrapper.kyc.rejectionReason}`,
    data: { type: 'kyc_rejected' }
  });

  return sendSuccess(res, 'KYC rejected', { kyc: publicKycView(scrapper) });
});

// @desc Admin: list scrappers with KYC status (no document URLs in list view)
// @route GET /api/kyc/scrappers
// @access Private (Admin)
export const getAllScrappersWithKyc = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });

  const query = {};
  const status = pickEnum(req.query.status, ['not_submitted', 'pending', 'verified', 'rejected']);
  if (status) query['kyc.status'] = status;
  const search = safeSearchRegex(req.query.search);
  if (search) query.$or = [{ name: search }, { phone: search }, { email: search }];

  const [scrappers, total] = await Promise.all([
    Scrapper.find(query)
      .select('name phone email city status totalPickups rating createdAt vehicleInfo kyc.status kyc.aadhaarLast4 kyc.submittedAt kyc.verifiedAt kyc.rejectionReason subscription.status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Scrapper.countDocuments(query)
  ]);

  const shaped = scrappers.map((s) => ({
    ...s,
    kyc: {
      ...s.kyc,
      aadhaarMasked: maskAadhaar(s.kyc?.aadhaarLast4)
    }
  }));

  return sendSuccess(res, 'Scrappers retrieved', {
    scrappers: shaped,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc Admin: fetch one scrapper's KYC documents (signed, short-lived, audited)
// @route GET /api/kyc/:id/documents
// @access Private (Admin)
export const getKycDocuments = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'scrapper id');

  const scrapper = await Scrapper.findById(id)
    .select('+kyc.documents +kyc.aadhaarPhotoUrl +kyc.selfieUrl +kyc.licenseUrl name phone kyc.status kyc.aadhaarLast4')
    .lean();
  if (!scrapper) return sendError(res, 'Scrapper not found', 404);

  const documentUrls = buildSignedDocumentUrls(scrapper.kyc?.documents);

  // Legacy records may still hold public URLs until migration runs.
  const legacy = {};
  if (!documentUrls.aadhaarUrl && scrapper.kyc?.aadhaarPhotoUrl) legacy.aadhaarUrl = scrapper.kyc.aadhaarPhotoUrl;
  if (!documentUrls.selfieUrl && scrapper.kyc?.selfieUrl) legacy.selfieUrl = scrapper.kyc.selfieUrl;
  if (!documentUrls.licenseUrl && scrapper.kyc?.licenseUrl) legacy.licenseUrl = scrapper.kyc.licenseUrl;

  // Every access to identity documents is recorded.
  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'KYC_DOCUMENTS_VIEWED',
    targetType: 'Scrapper',
    targetId: id,
    metadata: { legacyUrlsUsed: Object.keys(legacy).length > 0 },
    ip: req.ip
  });

  return sendSuccess(res, 'KYC documents retrieved', {
    scrapper: { id: scrapper._id, name: scrapper.name, phone: scrapper.phone },
    kyc: {
      status: scrapper.kyc?.status,
      aadhaarMasked: maskAadhaar(scrapper.kyc?.aadhaarLast4),
      ...documentUrls,
      ...legacy,
      urlsExpireInSeconds: DOC_URL_TTL_SECONDS
    }
  });
});
