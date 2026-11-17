import MarketplaceRequest from '../models/MarketplaceRequest.js';
import Bid from '../models/Bid.js';
import Scrapper from '../models/Scrapper.js';
import User from '../models/User.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { SCRAP_CATEGORIES } from '../config/constants.js';
import logger from '../utils/logger.js';
import { uploadMultipleFiles } from '../services/uploadService.js';
import {
  AppError,
  assertObjectId,
  asString,
  parseMoney,
  parsePagination,
  safeSearchRegex,
  pickEnum
} from '../utils/security.js';
import { recordAudit } from '../services/auditService.js';

const BID_MAX = 10000000;

/**
 * @desc    Upload images for marketplace requests
 * @route   POST /api/v1/marketplace/upload
 * @access  Admin
 */
export const uploadMarketplaceImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return sendError(res, 'No files uploaded', 400);
  }

  try {
    const uploadResults = await uploadMultipleFiles(req.files, {
      folder: 'marketplace_requests',
      allow: 'image'
    });
    const images = uploadResults.map((result) => ({
      url: result.secure_url,
      publicId: result.publicId
    }));
    sendSuccess(res, 'Images uploaded successfully', images);
  } catch (error) {
    if (error instanceof AppError) return sendError(res, error.message, error.statusCode);
    throw error;
  }
});

/**
 * @desc    Create marketplace requests
 * @route   POST /api/v1/marketplace/requests
 * @access  Admin
 */
export const createMarketplaceRequests = asyncHandler(async (req, res) => {
  const requestsData = Array.isArray(req.body) ? req.body : [req.body];

  if (requestsData.length === 0) {
    return sendError(res, 'Please provide request data', 400);
  }
  if (requestsData.length > 100) {
    return sendError(res, 'At most 100 requests can be created at once', 400);
  }

  const processedData = [];

  for (const reqData of requestsData) {
    const title = asString(reqData.title, 200);
    const fullAddress = asString(reqData.fullAddress, 500);
    const phoneNumber = asString(reqData.phoneNumber, 15);
    const city = asString(reqData.location?.city ?? reqData.city, 80);
    const state = asString(reqData.location?.state ?? reqData.state, 80);

    if (!title || !fullAddress || !phoneNumber || !city || !state) {
      return sendError(res, 'title, fullAddress, phoneNumber, city and state are required for each request', 400);
    }

    const normalized = {
      adminId: req.user.id,
      customerName: asString(reqData.name ?? reqData.customerName, 100) || 'Customer',
      title,
      description: asString(reqData.description, 2000),
      item: asString(reqData.item, 200),
      unit: asString(reqData.unit, 40),
      fullAddress,
      phoneNumber,
      location: { city, state },
      basePrice: reqData.basePrice !== undefined
        ? parseMoney(reqData.basePrice, { min: 0, max: BID_MAX, name: 'basePrice' })
        : 0
    };

    if (reqData.location?.coordinates) {
      const lat = Number(reqData.location.coordinates.lat);
      const lng = Number(reqData.location.coordinates.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        normalized.location.coordinates = { lat, lng };
      }
    }

    // Link to an existing user account by phone; auto-provisioning an account
    // here is NOT done any more (it created unverified shadow accounts).
    const existingUser = await User.findOne({ phone: phoneNumber }).select('_id');
    if (existingUser) {
      normalized.userId = existingUser._id;
    }

    // Images
    const rawImages = reqData.images;
    if (Array.isArray(rawImages)) {
      normalized.images = rawImages
        .slice(0, 10)
        .map((img) => (typeof img === 'string' ? { url: img } : { url: asString(img?.url, 500), publicId: asString(img?.publicId, 200) }))
        .filter((img) => img.url);
    } else if (typeof rawImages === 'string') {
      normalized.images = [{ url: rawImages }];
    }

    // Category normalisation against the allow-list.
    const categoryRaw = asString(reqData.category, 50)?.toLowerCase();
    const validCategories = Object.values(SCRAP_CATEGORIES);
    normalized.category = categoryRaw && validCategories.includes(categoryRaw) ? categoryRaw : 'other';

    processedData.push(normalized);
  }

  const requests = await MarketplaceRequest.insertMany(processedData);

  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'MARKETPLACE_REQUESTS_CREATED',
    targetType: 'MarketplaceRequest',
    metadata: { count: requests.length },
    ip: req.ip
  });

  sendSuccess(res, 'Marketplace requests created successfully', requests, 201);
});

/**
 * @desc    Get open marketplace requests
 * @route   GET /api/v1/marketplace/requests
 * @access  Scrapper (own city, subscription-gated), Admin (all)
 */
export const getMarketplaceRequests = asyncHandler(async (req, res) => {
  const category = pickEnum(asString(req.query.category, 50), Object.values(SCRAP_CATEGORIES));

  if (req.user.role === 'scrapper') {
    const scrapper = req.scrapper || await Scrapper.findById(req.user.id).populate('subscription.planId');
    if (!scrapper) {
      return sendError(res, 'Scrapper profile not found', 404);
    }
    if (scrapper.status !== 'active') {
      return sendError(res, 'Your account is blocked or suspended.', 403);
    }
    if (scrapper.kyc?.status !== 'verified') {
      return sendError(res, 'KYC verification required to browse the marketplace.', 403);
    }

    const populated = scrapper.populated?.('subscription.planId')
      ? scrapper
      : await Scrapper.findById(scrapper._id).populate('subscription.planId');

    // Subscription entitlement gates marketplace access.
    if (!populated.hasActiveSubscription()) {
      return sendError(res, 'An active subscription is required to view marketplace requests.', 403);
    }
    const maxRequests = populated.subscription.planId?.maxMarketplaceRequests ?? null;

    const query = { status: { $in: ['open', 'bidding'] } };
    if (category) query.category = category;

    // Strict city scoping.
    const cityName = scrapper.city?.trim();
    if (!cityName) {
      logger.warn(`[Marketplace] Scrapper ${scrapper._id} has no city set`);
      return sendSuccess(res, 'Please set your city in profile to view marketplace requests', []);
    }
    if (/^(gurugram|gurgaon)$/i.test(cityName)) {
      query['location.city'] = { $regex: /gurugram|gurgaon/i };
    } else {
      const cityRegex = safeSearchRegex(cityName);
      if (cityRegex) query['location.city'] = cityRegex;
    }

    let dbQuery = MarketplaceRequest.find(query)
      .select('-fullAddress -phoneNumber -reports')
      .sort({ createdAt: -1 });

    dbQuery = dbQuery.limit(maxRequests !== null && maxRequests !== undefined ? Math.min(maxRequests, 200) : 100);

    const requests = await dbQuery;
    return sendSuccess(res, 'Marketplace requests retrieved successfully', requests);
  }

  // Admin path
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });
  const query = {};
  const status = pickEnum(asString(req.query.status, 20), ['open', 'bidding', 'deal_closed', 'completed', 'cancelled']);
  if (status) query.status = status;
  const city = safeSearchRegex(req.query.city);
  if (city) query['location.city'] = city;
  if (category) query.category = category;

  const requests = await MarketplaceRequest.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  sendSuccess(res, 'Marketplace requests retrieved successfully', requests);
});

/**
 * @desc    Get specific marketplace request details
 * @route   GET /api/v1/marketplace/requests/:id
 * @access  Scrapper, Admin, owning User
 */
export const getMarketplaceRequestById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'request id');
  const request = await MarketplaceRequest.findById(id);

  if (!request) {
    return sendError(res, 'Request not found', 404);
  }

  const isAdmin = req.user.role === 'admin';
  const isOwner = request.userId?.toString() === req.user.id;
  const scrapperId = req.user.scrapperId || req.user.id;
  const isWinner = request.status === 'deal_closed' && request.winnerScrapper?.toString() === scrapperId;

  if (req.user.role === 'user' && !isOwner) {
    return sendError(res, 'Not authorized to view this request', 403);
  }

  // Contact details are disclosed ONLY to admin, the request owner, or the
  // winning scrapper. A subscription alone no longer unlocks private data.
  const data = request.toObject();
  if (!isAdmin && !isOwner && !isWinner) {
    delete data.fullAddress;
    delete data.phoneNumber;
    delete data.reports;
  }

  if (req.user.role === 'scrapper') {
    const scrapper = req.scrapper || await Scrapper.findById(scrapperId);
    if (!scrapper || scrapper.status !== 'active' || scrapper.kyc?.status !== 'verified') {
      return sendError(res, 'Active, KYC-verified scrapper account required', 403);
    }
    data.myBid = await Bid.findOne({ requestId: id, scrapperId });
  }

  sendSuccess(res, 'Marketplace request details retrieved successfully', data);
});

/**
 * @desc    Place or update a bid
 * @route   POST /api/v1/marketplace/requests/:id/bids
 * @access  Scrapper (active, KYC-verified, subscribed)
 */
export const placeBid = asyncHandler(async (req, res) => {
  const requestId = assertObjectId(req.params.id, 'request id');
  const bidAmount = parseMoney(req.body.bidAmount, { min: 1, max: BID_MAX, name: 'bidAmount' });
  const message = asString(req.body.message, 500);
  const scrapperId = req.user.scrapperId || req.user.id;

  const scrapper = await Scrapper.findById(scrapperId).populate('subscription.planId');
  if (!scrapper) {
    return sendError(res, 'Scrapper profile not found', 404);
  }
  if (scrapper.status !== 'active') {
    return sendError(res, 'Your account is blocked or suspended.', 403);
  }
  if (scrapper.kyc?.status !== 'verified') {
    return sendError(res, 'KYC verification required before bidding.', 403);
  }
  if (!scrapper.hasActiveSubscription()) {
    return sendError(res, 'An active subscription is required to place bids.', 403);
  }

  const request = await MarketplaceRequest.findById(requestId);
  if (!request) return sendError(res, 'Request not found', 404);

  if (request.status !== 'open' && request.status !== 'bidding') {
    return sendError(res, 'Bidding is closed for this request', 400);
  }

  let bid = await Bid.findOne({ requestId, scrapperId });
  if (bid) {
    if (bid.status === 'accepted' || bid.status === 'rejected') {
      return sendError(res, 'This bid can no longer be changed', 409);
    }
    bid.bidAmount = bidAmount;
    bid.message = message;
    await bid.save();
  } else {
    try {
      bid = await Bid.create({ requestId, scrapperId, bidAmount, message });
    } catch (error) {
      if (error.code === 11000) {
        return sendError(res, 'You have already placed a bid on this request', 409);
      }
      throw error;
    }
    // Move 'open' -> 'bidding' atomically (no lost updates).
    await MarketplaceRequest.updateOne({ _id: requestId, status: 'open' }, { $set: { status: 'bidding' } });
  }

  const bidAmountFormatted = `₹${bidAmount}`;
  if (request.adminId) {
    sendNotificationToUser(request.adminId.toString(), {
      title: 'New Bid Received 🎯',
      body: `A scrapper has placed a bid of ${bidAmountFormatted} on "${request.title}"`,
      data: { requestId: request._id.toString(), type: 'new_bid' }
    });
  }
  if (request.userId && request.userId.toString() !== request.adminId?.toString()) {
    sendNotificationToUser(request.userId.toString(), {
      title: 'New Bid Received 🎯',
      body: `A scrapper has placed a bid of ${bidAmountFormatted} on your request: ${request.title}`,
      data: { requestId: request._id.toString(), type: 'new_bid' }
    });
  }

  sendSuccess(res, 'Bid placed successfully', bid);
});

/**
 * @desc    Accept a bid and close the deal
 * @route   PATCH /api/v1/marketplace/bids/:bidId/accept
 * @access  Admin, or the User who owns the request
 */
export const acceptBid = asyncHandler(async (req, res) => {
  const bidId = assertObjectId(req.params.bidId, 'bid id');

  const bid = await Bid.findById(bidId);
  if (!bid) return sendError(res, 'Bid not found', 404);

  const request = await MarketplaceRequest.findById(bid.requestId);
  if (!request) return sendError(res, 'Request not found', 404);

  // OWNERSHIP CHECK: a user may only accept bids on their own requests.
  if (req.user.role !== 'admin') {
    const isOwner = request.userId?.toString() === req.user.id;
    if (!isOwner) {
      return sendError(res, 'Not authorized to accept bids on this request', 403);
    }
  }

  if (request.status === 'deal_closed' || request.status === 'completed') {
    return sendError(res, 'Deal is already closed for this request', 409);
  }
  if (request.status === 'cancelled') {
    return sendError(res, 'This request has been cancelled', 409);
  }

  // Atomic close: only the first accept wins, so concurrent accepts cannot
  // produce two winners.
  const closed = await MarketplaceRequest.findOneAndUpdate(
    { _id: request._id, status: { $in: ['open', 'bidding'] } },
    {
      $set: {
        status: 'deal_closed',
        winnerScrapper: bid.scrapperId,
        isDataDisclosed: true,
        dealClosedAt: new Date()
      }
    },
    { new: true }
  );
  if (!closed) {
    return sendError(res, 'Deal is already closed for this request', 409);
  }

  bid.status = 'accepted';
  await bid.save();

  await Bid.updateMany(
    { requestId: request._id, _id: { $ne: bid._id } },
    { $set: { status: 'rejected' } }
  );

  await recordAudit({
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'MARKETPLACE_BID_ACCEPTED',
    targetType: 'MarketplaceRequest',
    targetId: request._id,
    metadata: { bidId: bid._id.toString(), bidAmount: bid.bidAmount },
    ip: req.ip
  });

  sendNotificationToUser(bid.scrapperId.toString(), {
    title: 'Bid Accepted! 🎉',
    body: `Congratulations! Your bid on "${request.title}" has been accepted.`,
    data: { requestId: request._id.toString(), type: 'bid_accepted' }
  });

  try {
    const otherBids = await Bid.find({ requestId: request._id, _id: { $ne: bid._id } }).select('scrapperId');
    const otherScrapperIds = otherBids.map((b) => b.scrapperId.toString());
    if (otherScrapperIds.length > 0) {
      const { sendNotificationToMultipleUsers } = await import('../utils/pushNotificationHelper.js');
      sendNotificationToMultipleUsers(otherScrapperIds, {
        title: 'Bid Not Selected 📍',
        body: `The deal for "${request.title}" has been closed with another scrapper.`,
        data: { requestId: request._id.toString(), type: 'bid_rejected' }
      });
    }
  } catch (err) {
    logger.error('Error notifying rejected bidders', { error: err.message });
  }

  sendSuccess(res, 'Deal closed successfully. Contact details are now visible.', closed);
});

/**
 * @desc    Get marketplace requests for current user (customer)
 * @route   GET /api/v1/marketplace/my-requests
 * @access  User
 */
export const getMyMarketplaceRequests = asyncHandler(async (req, res) => {
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 50 });

  const requests = await MarketplaceRequest.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  if (requests.length === 0) {
    return sendSuccess(res, 'My marketplace requests fetched successfully', []);
  }

  // Single query for all bids instead of N+1.
  const bids = await Bid.find({ requestId: { $in: requests.map((r) => r._id) } })
    .populate('scrapperId', 'name phone profilePic rating')
    .lean();

  const bidsByRequest = new Map();
  for (const bid of bids) {
    const key = String(bid.requestId);
    if (!bidsByRequest.has(key)) bidsByRequest.set(key, []);
    bidsByRequest.get(key).push(bid);
  }

  const requestsWithBids = requests.map((request) => ({
    ...request,
    bids: bidsByRequest.get(String(request._id)) || []
  }));

  sendSuccess(res, 'My marketplace requests fetched successfully', requestsWithBids);
});

/**
 * @desc    Report a marketplace request
 * @route   POST /api/v1/marketplace/requests/:id/report
 * @access  Scrapper
 */
export const reportMarketplaceRequest = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'request id');
  const reason = asString(req.body.reason, 200) || 'Spam';
  const scrapperId = req.user.scrapperId || req.user.id;

  // Atomic: only adds a report when this scrapper has not already reported.
  const updated = await MarketplaceRequest.findOneAndUpdate(
    { _id: id, 'reports.scrapperId': { $ne: scrapperId } },
    { $push: { reports: { scrapperId, reason, createdAt: new Date() } } },
    { new: true }
  );

  if (!updated) {
    const exists = await MarketplaceRequest.exists({ _id: id });
    if (!exists) return sendError(res, 'Request not found', 404);
    return sendError(res, 'You have already reported this request', 400);
  }

  sendSuccess(res, 'Request reported successfully');
});

/**
 * @desc    Delete marketplace request
 * @route   DELETE /api/v1/marketplace/requests/:id
 * @access  Admin
 */
export const deleteMarketplaceRequest = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'request id');

  const request = await MarketplaceRequest.findById(id);
  if (!request) {
    return sendError(res, 'Request not found', 404);
  }

  await Bid.deleteMany({ requestId: id });
  await request.deleteOne();

  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'MARKETPLACE_REQUEST_DELETED',
    targetType: 'MarketplaceRequest',
    targetId: id,
    ip: req.ip
  });

  sendSuccess(res, 'Marketplace request and associated bids deleted successfully');
});
