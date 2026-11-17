import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import Price from '../models/Price.js';
import WalletTransaction from '../models/WalletTransaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import SystemSetting from '../models/SystemSetting.js';
import { USER_ROLES, ORDER_STATUS, PAYMENT_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { createContact, createFundAccount, initiatePayout } from '../services/payoutService.js';
import { sendPushNotification } from '../services/firebaseService.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';
import { disconnectUser } from '../services/socketService.js';
import { creditWallet, withTransaction } from '../services/walletService.js';
import { recordAudit, listAudits } from '../services/auditService.js';
import {
  AppError,
  parsePagination,
  parseDateParam,
  safeSearchRegex,
  assertObjectId,
  asString,
  parseMoney,
  pickEnum,
  roundMoney
} from '../utils/security.js';

const audit = (req, action, targetType, targetId, metadata = {}) =>
  recordAudit({
    actorId: req.user.id,
    actorRole: req.user.role,
    action,
    targetType,
    targetId,
    metadata,
    ip: req.ip
  });

// ============================================
// DASHBOARD & ANALYTICS
// ============================================

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard/stats
// @access  Private (Admin)
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const { checkExpiredSubscriptions } = await import('../services/subscriptionService.js');
    await checkExpiredSubscriptions().catch((err) =>
      logger.error('[Admin] checkExpiredSubscriptions failed:', { error: err.message })
    );

    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      totalUsers,
      activeUsers,
      totalScrappers,
      activeScrappers,
      verifiedScrappers,
      pendingKyc,
      totalOrders,
      pendingOrders,
      inProgressOrders,
      completedOrders,
      todayOrders,
      totalPayments,
      activeSubscriptions,
      todayRevenue,
      monthlyRevenue
    ] = await Promise.all([
      User.countDocuments({ role: USER_ROLES.USER }),
      User.countDocuments({ role: USER_ROLES.USER, isActive: true }),
      Scrapper.countDocuments(),
      Scrapper.countDocuments({ status: 'active' }),
      Scrapper.countDocuments({ 'kyc.status': 'verified' }),
      Scrapper.countDocuments({ 'kyc.status': 'pending' }),
      Order.countDocuments(),
      Order.countDocuments({ status: ORDER_STATUS.PENDING }),
      Order.countDocuments({ status: ORDER_STATUS.IN_PROGRESS }),
      Order.countDocuments({ status: ORDER_STATUS.COMPLETED }),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
      Payment.countDocuments({ status: PAYMENT_STATUS.COMPLETED }),
      Scrapper.countDocuments({ 'subscription.status': 'active' }),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.COMPLETED, paidAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: PAYMENT_STATUS.COMPLETED, paidAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const stats = {
      users: { total: totalUsers, active: activeUsers },
      scrappers: {
        total: totalScrappers,
        active: activeScrappers,
        verified: verifiedScrappers,
        pendingKyc
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        inProgress: inProgressOrders,
        completed: completedOrders,
        today: todayOrders
      },
      payments: {
        total: totalPayments,
        todayRevenue: todayRevenue[0]?.total || 0,
        monthlyRevenue: monthlyRevenue[0]?.total || 0
      },
      subscriptions: { active: activeSubscriptions }
    };

    sendSuccess(res, 'Dashboard statistics retrieved successfully', { stats });
  } catch (error) {
    logger.error('[Admin] Error fetching dashboard stats:', { error: error.message });
    sendError(res, 'Failed to fetch dashboard statistics', 500);
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

// @desc    Get all users with pagination and filters
// @route   GET /api/admin/users
// @access  Private (Admin)
export const getAllUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = { role: USER_ROLES.USER };
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }
  const search = safeSearchRegex(req.query.search);
  if (search) {
    filter.$or = [{ name: search }, { email: search }, { phone: search }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      // Count orders without pulling entire order documents into memory.
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$user', '$$userId'] } } },
            { $count: 'count' }
          ],
          as: 'orderStats'
        }
      },
      {
        $addFields: {
          totalOrders: { $ifNull: [{ $arrayElemAt: ['$orderStats.count', 0] }, 0] },
          // walletBalance is the ACTUAL wallet balance (was: sum of order totals).
          walletBalance: { $ifNull: ['$wallet.balance', 0] }
        }
      },
      {
        $project: {
          password: 0,
          phoneVerificationOTP: 0,
          otpExpiresAt: 0,
          otpAttempts: 0,
          otpLastSentAt: 0,
          otpSendWindowStart: 0,
          otpSendCount: 0,
          failedLoginAttempts: 0,
          lockUntil: 0,
          resetPasswordToken: 0,
          verificationToken: 0,
          tokenVersion: 0,
          fcmTokens: 0,
          fcmTokenApp: 0,
          orderStats: 0
        }
      }
    ])
  ]);

  sendSuccess(res, 'Users retrieved successfully', {
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
export const getUserById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'user id');
  const user = await User.findById(id);
  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  const ordersCount = await Order.countDocuments({ user: user._id });

  sendSuccess(res, 'User retrieved successfully', {
    user: { ...user.toObject(), ordersCount }
  });
});

// @desc    Update user (never role / wallet / password through this route)
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
export const updateUser = asyncHandler(async (req, res) => {
  const userId = assertObjectId(req.params.id, 'user id');

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 'User not found', 404);
  }
  if (user.role === USER_ROLES.ADMIN && user._id.toString() !== req.user.id) {
    return sendError(res, 'Admin accounts cannot be modified through this endpoint', 403);
  }

  const name = asString(req.body.name, 50);
  const email = asString(req.body.email, 254);
  const phone = asString(req.body.phone, 15);
  if (name) user.name = name;
  if (email) user.email = email.toLowerCase();
  if (phone) user.phone = phone;
  if (req.body.isActive !== undefined) {
    user.isActive = req.body.isActive === true || req.body.isActive === 'true';
    if (!user.isActive) user.tokenVersion = (user.tokenVersion || 0) + 1;
  }
  if (req.body.address && typeof req.body.address === 'object' && !Array.isArray(req.body.address)) {
    user.address = { ...user.toObject().address, ...req.body.address };
  }

  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 'Email or phone already exists', 400);
    }
    throw error;
  }

  await audit(req, 'USER_UPDATED', 'User', userId, { fields: Object.keys(req.body) });

  sendSuccess(res, 'User updated successfully', { user: user.toObject() });
});

// @desc    Block/Unblock user (revokes all existing sessions on block)
// @route   PATCH /api/admin/users/:id/block
// @access  Private (Admin)
export const blockUser = asyncHandler(async (req, res) => {
  const userId = assertObjectId(req.params.id, 'user id');

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 'User not found', 404);
  }
  if (user.role === USER_ROLES.ADMIN) {
    return sendError(res, 'Admin accounts cannot be blocked through this endpoint', 403);
  }

  const { isActive } = req.body;
  user.isActive = isActive !== undefined ? isActive === true || isActive === 'true' : !user.isActive;
  // Revoke all outstanding tokens either way; on unblock the user logs in afresh.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  // Keep scrapper profile in sync.
  if (user.role === USER_ROLES.SCRAPPER) {
    await Scrapper.updateOne(
      { _id: user._id },
      { $set: { status: user.isActive ? 'active' : 'blocked', isOnline: false } }
    );
  }

  if (!user.isActive) await disconnectUser(userId);
  await audit(req, user.isActive ? 'USER_UNBLOCKED' : 'USER_BLOCKED', 'User', userId);

  sendSuccess(res, `User ${user.isActive ? 'unblocked' : 'blocked'} successfully`, {
    user: user.toObject()
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
export const deleteUser = asyncHandler(async (req, res) => {
  const userId = assertObjectId(req.params.id, 'user id');

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 'User not found', 404);
  }
  // Admin accounts can never be deleted through user management.
  if (user.role === USER_ROLES.ADMIN) {
    return sendError(res, 'Admin accounts cannot be deleted', 403);
  }

  const ordersCount = await Order.countDocuments({
    $or: [{ user: userId }, { scrapper: userId }],
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.IN_PROGRESS] }
  });
  if (ordersCount > 0) {
    return sendError(res, 'Cannot delete user with open orders. Please cancel or complete them first.', 400);
  }

  const balance = roundMoney(user.wallet?.balance || 0);
  if (balance > 0) {
    return sendError(res, `Cannot delete user with wallet balance ₹${balance}. Settle the balance first.`, 400);
  }
  const pendingWithdrawals = await WithdrawalRequest.countDocuments({ user: userId, status: { $in: ['PENDING', 'APPROVED'] } });
  if (pendingWithdrawals > 0) {
    return sendError(res, 'Cannot delete user with pending withdrawals.', 400);
  }

  if (user.role === USER_ROLES.SCRAPPER) {
    await Scrapper.findByIdAndDelete(userId);
  }
  await User.findByIdAndDelete(userId);
  // Ledger and order history are intentionally preserved for audit.

  await audit(req, 'USER_DELETED', 'User', userId, { role: user.role });
  logger.info(`[Admin] User ${userId} deleted by admin ${req.user.id}`);
  sendSuccess(res, 'User deleted successfully', {});
});

// ============================================
// SCRAPPER MANAGEMENT
// ============================================

// @desc    Get all scrappers with pagination and filters
// @route   GET /api/admin/scrappers
// @access  Private (Admin)
export const getAllScrappers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  const status = pickEnum(req.query.status, ['active', 'blocked', 'suspended']);
  if (status) filter.status = status;
  const kycStatus = pickEnum(req.query.kycStatus, ['not_submitted', 'pending', 'verified', 'rejected']);
  if (kycStatus) filter['kyc.status'] = kycStatus;
  const subscriptionStatus = pickEnum(req.query.subscriptionStatus, ['active', 'expired', 'cancelled', 'none']);
  if (subscriptionStatus) filter['subscription.status'] = subscriptionStatus;
  const search = safeSearchRegex(req.query.search);
  if (search) {
    filter.$or = [{ name: search }, { email: search }, { phone: search }];
  }

  const [total, scrappers] = await Promise.all([
    Scrapper.countDocuments(filter),
    Scrapper.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'orders',
          let: { sid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$scrapper', '$$sid'] }, { $eq: ['$status', 'completed'] }] } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$totalAmount', 0] } } } }
          ],
          as: 'orderStats'
        }
      },
      {
        $addFields: {
          totalPickups: { $ifNull: [{ $arrayElemAt: ['$orderStats.count', 0] }, 0] },
          'earnings.total': { $ifNull: [{ $arrayElemAt: ['$orderStats.total', 0] }, 0] },
          rating: { $ifNull: ['$rating.average', 0] }
        }
      },
      {
        $project: {
          orderStats: 0,
          'kyc.aadhaarNumber': 0,
          'kyc.documents': 0,
          'kyc.aadhaarPhotoUrl': 0,
          'kyc.selfieUrl': 0,
          'kyc.licenseUrl': 0,
          fcmTokens: 0,
          fcmTokenApp: 0,
          phoneVerificationOTP: 0
        }
      }
    ])
  ]);

  sendSuccess(res, 'Scrappers retrieved successfully', {
    scrappers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Get scrapper by ID (admin sees masked Aadhaar, not the full number)
// @route   GET /api/admin/scrappers/:id
// @access  Private (Admin)
export const getScrapperById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'scrapper id');
  const scrapper = await Scrapper.findById(id)
    .populate('subscription.planId', 'name price')
    .lean();

  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }

  const ordersCount = await Order.countDocuments({ scrapper: scrapper._id });

  // Expose the masked Aadhaar only; full numbers require the dedicated KYC
  // document endpoint which is separately audited.
  if (scrapper.kyc) {
    delete scrapper.kyc.aadhaarNumber;
    delete scrapper.kyc.documents;
    scrapper.kyc.aadhaarMasked = scrapper.kyc.aadhaarLast4 ? `XXXX-XXXX-${scrapper.kyc.aadhaarLast4}` : null;
  }
  delete scrapper.fcmTokens;
  delete scrapper.fcmTokenApp;

  sendSuccess(res, 'Scrapper retrieved successfully', {
    scrapper: { ...scrapper, ordersCount }
  });
});

// @desc    Update scrapper
// @route   PUT /api/admin/scrappers/:id
// @access  Private (Admin)
export const updateScrapper = asyncHandler(async (req, res) => {
  const scrapperId = assertObjectId(req.params.id, 'scrapper id');

  const scrapper = await Scrapper.findById(scrapperId);
  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }

  const name = asString(req.body.name, 50);
  const email = asString(req.body.email, 254);
  const phone = asString(req.body.phone, 15);
  const city = asString(req.body.city, 80);
  const status = pickEnum(req.body.status, ['active', 'blocked', 'suspended']);

  if (name) scrapper.name = name;
  if (email) scrapper.email = email.toLowerCase();
  if (phone) scrapper.phone = phone;
  if (city) scrapper.city = city;
  if (status) scrapper.status = status;
  if (req.body.vehicleInfo && typeof req.body.vehicleInfo === 'object') {
    scrapper.vehicleInfo = { ...scrapper.toObject().vehicleInfo, ...req.body.vehicleInfo };
  }

  try {
    await scrapper.save();
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 'Email or phone already exists', 400);
    }
    throw error;
  }

  // Keep the auth record in sync when identity fields or status change.
  const userSync = {};
  if (name) userSync.name = name;
  if (email) userSync.email = email.toLowerCase();
  if (phone) userSync.phone = phone;
  if (status) userSync.isActive = status === 'active';
  if (Object.keys(userSync).length > 0) {
    const update = { $set: userSync };
    if (status && status !== 'active') update.$inc = { tokenVersion: 1 };
    await User.updateOne({ _id: scrapperId }, update);
  }

  await audit(req, 'SCRAPPER_UPDATED', 'Scrapper', scrapperId, { fields: Object.keys(req.body) });

  sendSuccess(res, 'Scrapper updated successfully', { scrapper: scrapper.toObject() });
});

// @desc    Block/Unblock/Suspend scrapper (syncs auth account + revokes tokens)
// @route   PATCH /api/admin/scrappers/:id/status
// @access  Private (Admin)
export const updateScrapperStatus = asyncHandler(async (req, res) => {
  const scrapperId = assertObjectId(req.params.id, 'scrapper id');
  const status = pickEnum(req.body.status, ['active', 'blocked', 'suspended']);
  const reason = asString(req.body.reason, 200);

  if (!status) {
    return sendError(res, 'Invalid status. Must be: active, blocked, or suspended', 400);
  }

  const scrapper = await Scrapper.findByIdAndUpdate(
    scrapperId,
    { $set: { status, statusReason: reason || null, ...(status !== 'active' ? { isOnline: false } : {}) } },
    { new: true, runValidators: true }
  );
  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }

  // CRITICAL SYNC: User.isActive mirrors scrapper status, and tokenVersion is
  // bumped so existing sessions die immediately when blocked/suspended.
  await User.updateOne(
    { _id: scrapperId },
    {
      $set: { isActive: status === 'active' },
      $inc: { tokenVersion: 1 }
    }
  );

  if (status !== 'active') await disconnectUser(scrapperId);
  await audit(req, `SCRAPPER_STATUS_${status.toUpperCase()}`, 'Scrapper', scrapperId, { reason });

  sendSuccess(res, `Scrapper status updated to ${status}`, { scrapper: scrapper.toObject() });
});

// @desc    Delete scrapper
// @route   DELETE /api/admin/scrappers/:id
// @access  Private (Admin)
export const deleteScrapper = asyncHandler(async (req, res) => {
  const scrapperId = assertObjectId(req.params.id, 'scrapper id');

  const scrapper = await Scrapper.findById(scrapperId);
  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }

  const openOrders = await Order.countDocuments({
    scrapper: scrapperId,
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED, ORDER_STATUS.IN_PROGRESS] }
  });
  if (openOrders > 0) {
    return sendError(res, 'Cannot delete scrapper with open orders. Please reassign or complete them first.', 400);
  }
  const balance = roundMoney(scrapper.wallet?.balance || 0);
  if (balance > 0) {
    return sendError(res, `Cannot delete scrapper with wallet balance ₹${balance}. Settle the balance first.`, 400);
  }
  const pendingWithdrawals = await WithdrawalRequest.countDocuments({ user: scrapperId, status: { $in: ['PENDING', 'APPROVED'] } });
  if (pendingWithdrawals > 0) {
    return sendError(res, 'Cannot delete scrapper with pending withdrawals.', 400);
  }

  const linkedUser = await User.findById(scrapperId).select('role');
  if (linkedUser && linkedUser.role === USER_ROLES.ADMIN) {
    return sendError(res, 'Cannot delete an admin account', 403);
  }

  await Scrapper.findByIdAndDelete(scrapperId);
  await User.findByIdAndDelete(scrapperId);

  await audit(req, 'SCRAPPER_DELETED', 'Scrapper', scrapperId);
  logger.info(`[Admin] Scrapper ${scrapperId} deleted by admin ${req.user.id}`);
  sendSuccess(res, 'Scrapper and associated user account deleted successfully', {});
});

// ============================================
// ORDER MANAGEMENT
// ============================================

// @desc    Get all orders with pagination and filters
// @route   GET /api/admin/orders
// @access  Private (Admin)
export const getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  const status = pickEnum(req.query.status, Object.values(ORDER_STATUS));
  if (status) filter.status = status;
  const paymentStatus = pickEnum(req.query.paymentStatus, Object.values(PAYMENT_STATUS));
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (req.query.userId) filter.user = assertObjectId(req.query.userId, 'userId');
  if (req.query.scrapperId) filter.scrapper = assertObjectId(req.query.scrapperId, 'scrapperId');

  const dateFrom = parseDateParam(req.query.dateFrom, 'dateFrom');
  const dateTo = parseDateParam(req.query.dateTo, 'dateTo');
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email phone')
      .populate('scrapper', 'name phone vehicleInfo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter)
  ]);

  sendSuccess(res, 'Orders retrieved successfully', {
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Get order by ID
// @route   GET /api/admin/orders/:id
// @access  Private (Admin)
export const getOrderById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const order = await Order.findById(id)
    .populate('user', 'name email phone address')
    .populate('scrapper', 'name phone email vehicleInfo');

  if (!order) {
    return sendError(res, 'Order not found', 404);
  }

  const payment = await Payment.findOne({ order: order._id });

  sendSuccess(res, 'Order retrieved successfully', {
    order: { ...order.toObject(), payment }
  });
});

// @desc    Update order (admin)
// @route   PUT /api/admin/orders/:id
// @access  Private (Admin)
export const updateOrder = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.params.id, 'order id');

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }

  const status = pickEnum(req.body.status, Object.values(ORDER_STATUS));
  const paymentStatus = pickEnum(req.body.paymentStatus, Object.values(PAYMENT_STATUS));

  if (req.body.scrapper) {
    const scrapperId = assertObjectId(req.body.scrapper, 'scrapper id');
    const scrapper = await Scrapper.findById(scrapperId).select('status kyc.status');
    if (!scrapper) return sendError(res, 'Scrapper not found', 404);
    if (order.status === ORDER_STATUS.COMPLETED || order.status === ORDER_STATUS.CANCELLED) {
      return sendError(res, `Cannot assign a ${order.status} order`, 409);
    }
    order.scrapper = scrapperId;
  }
  if (req.body.totalAmount !== undefined) {
    order.totalAmount = parseMoney(req.body.totalAmount, { min: 0, max: 500000, name: 'totalAmount' });
  }
  if (Array.isArray(req.body.scrapItems)) {
    order.scrapItems = req.body.scrapItems;
    order.totalWeight = req.body.scrapItems.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  }
  if (paymentStatus) order.paymentStatus = paymentStatus;
  if (status) {
    order.status = status;
    if (status === ORDER_STATUS.COMPLETED && !order.completedDate) order.completedDate = new Date();
    if (status === ORDER_STATUS.CANCELLED && !order.cancelledAt) {
      order.cancelledAt = new Date();
      order.cancelledBy = 'admin';
    }
  }

  await order.save();

  await audit(req, 'ORDER_UPDATED', 'Order', orderId, { fields: Object.keys(req.body) });

  sendSuccess(res, 'Order updated successfully', { order: order.toObject() });
});

// @desc    Manually assign order to scrapper
// @route   POST /api/admin/orders/:id/assign
// @access  Private (Admin)
export const assignOrder = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.params.id, 'order id');
  const scrapperId = assertObjectId(req.body.scrapperId, 'scrapperId');

  const scrapper = await Scrapper.findById(scrapperId);
  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }
  if (scrapper.status !== 'active') {
    return sendError(res, 'Scrapper is not active', 400);
  }
  if (scrapper.kyc?.status !== 'verified') {
    return sendError(res, 'Scrapper KYC is not verified', 400);
  }
  if (!scrapper.hasActiveSubscription()) {
    return sendError(res, 'Scrapper does not have active subscription', 400);
  }

  // Atomic: only assignable while not completed/cancelled.
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.CONFIRMED] }
    },
    {
      $set: {
        scrapper: scrapperId,
        status: ORDER_STATUS.CONFIRMED,
        assignmentStatus: 'assigned',
        assignedAt: now
      },
      $push: { assignmentHistory: { scrapper: scrapperId, assignedAt: now, status: 'assigned' } }
    },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findById(orderId).select('status');
    if (!existing) return sendError(res, 'Order not found', 404);
    return sendError(res, `Cannot assign order in status '${existing.status}'`, 409);
  }

  // Notify both parties.
  sendNotificationToUser(scrapperId.toString(), {
    title: 'New Order Assigned 📋',
    body: `An order #${order._id.toString().slice(-6)} has been assigned to you by admin.`,
    data: { orderId: order._id.toString(), type: 'order_assigned' }
  });
  sendNotificationToUser(order.user.toString(), {
    title: 'Scrapper Assigned 🤝',
    body: `A scrapper has been assigned to your order #${order._id.toString().slice(-6)}.`,
    data: { orderId: order._id.toString(), type: 'order_assigned' }
  });

  await audit(req, 'ORDER_ASSIGNED', 'Order', orderId, { scrapperId: scrapperId.toString() });

  sendSuccess(res, 'Order assigned successfully', { order: order.toObject() });
});

// @desc    Cancel order (admin)
// @route   POST /api/admin/orders/:id/cancel
// @access  Private (Admin)
export const cancelOrder = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.params.id, 'order id');
  const reason = asString(req.body.reason, 500);

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }
  if (order.status === ORDER_STATUS.CANCELLED) {
    return sendError(res, 'Order is already cancelled', 400);
  }
  if (order.status === ORDER_STATUS.COMPLETED) {
    return sendError(res, 'Cannot cancel completed order', 400);
  }

  order.status = ORDER_STATUS.CANCELLED;
  order.cancelledAt = new Date();
  order.cancelledBy = 'admin';
  order.cancellationReason = reason || 'Cancelled by admin';
  await order.save();

  await audit(req, 'ORDER_CANCELLED', 'Order', orderId, { reason });

  sendSuccess(res, 'Order cancelled successfully', { order: order.toObject() });
});

// @desc    Get commission transactions
// @route   GET /api/admin/earnings/commissions
// @access  Private (Admin)
export const getCommissionTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });

  const query = { category: 'COMMISSION' };

  const [total, transactions] = await Promise.all([
    WalletTransaction.countDocuments(query),
    WalletTransaction.find(query)
      .populate('user', 'name email phone')
      .populate('orderId', 'totalAmount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
  ]);

  sendSuccess(res, 'Commission transactions retrieved successfully', {
    transactions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ============================================
// PRICE FEED MANAGEMENT
// ============================================

// @desc    Get all price entries
// @route   GET /api/admin/prices
// @access  Private (Admin)
export const getAllPrices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 200, maxLimit: 1000 });

  const filter = {};
  const category = asString(req.query.category, 50);
  if (category) filter.category = category;
  const regionCode = asString(req.query.regionCode, 10);
  if (regionCode) filter.regionCode = regionCode;
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  const [prices, total] = await Promise.all([
    Price.find(filter)
      .populate('updatedBy', 'name email')
      .sort({ effectiveDate: -1, category: 1 })
      .skip(skip)
      .limit(limit),
    Price.countDocuments(filter)
  ]);

  sendSuccess(res, 'Prices retrieved successfully', {
    prices,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Create price entry (deactivates previous active price for same category+region)
// @route   POST /api/admin/prices
// @access  Private (Admin)
export const createPrice = asyncHandler(async (req, res) => {
  const category = asString(req.body.category, 50);
  if (!category) {
    return sendError(res, 'Category is required', 400);
  }
  const regionCode = asString(req.body.regionCode, 10) || 'IN-DL';
  const type = pickEnum(req.body.type, ['material', 'service']) || 'material';
  const pricePerKg = req.body.pricePerKg !== undefined
    ? parseMoney(req.body.pricePerKg, { min: 0, max: 100000, name: 'pricePerKg' })
    : 0;
  const fixedPrice = req.body.price !== undefined
    ? parseMoney(req.body.price, { min: 0, max: 1000000, name: 'price' })
    : 0;
  const effectiveDate = req.body.effectiveDate ? parseDateParam(req.body.effectiveDate, 'effectiveDate') : new Date();
  const isActive = req.body.isActive !== undefined ? req.body.isActive === true || req.body.isActive === 'true' : true;

  // Single-active-price invariant: the regionCode used in the deactivation
  // filter is the SAME normalised value used for the new entry.
  if (isActive) {
    await Price.updateMany(
      { category, regionCode, type, isActive: true },
      { isActive: false }
    );
  }

  const newPriceEntry = await Price.create({
    category,
    pricePerKg,
    price: fixedPrice,
    regionCode,
    effectiveDate,
    isActive,
    updatedBy: req.user.id,
    image: asString(req.body.image, 500),
    type
  });

  await audit(req, 'PRICE_CREATED', 'Price', newPriceEntry._id, { category, regionCode, pricePerKg });

  sendSuccess(res, 'Price created successfully', { price: newPriceEntry });
});

// @desc    Update price entry
// @route   PUT /api/admin/prices/:id
// @access  Private (Admin)
export const updatePrice = asyncHandler(async (req, res) => {
  const priceId = assertObjectId(req.params.id, 'price id');

  const price = await Price.findById(priceId);
  if (!price) {
    return sendError(res, 'Price not found', 404);
  }

  if (req.body.pricePerKg !== undefined) {
    price.pricePerKg = parseMoney(req.body.pricePerKg, { min: 0, max: 100000, name: 'pricePerKg' });
  }
  if (req.body.price !== undefined) {
    price.price = parseMoney(req.body.price, { min: 0, max: 1000000, name: 'price' });
  }
  if (req.body.effectiveDate) price.effectiveDate = parseDateParam(req.body.effectiveDate, 'effectiveDate');
  if (req.body.isActive !== undefined) price.isActive = req.body.isActive === true || req.body.isActive === 'true';
  if (req.body.image !== undefined) price.image = asString(req.body.image, 500);
  price.updatedBy = req.user.id;

  await price.save();

  await audit(req, 'PRICE_UPDATED', 'Price', priceId, { fields: Object.keys(req.body) });

  sendSuccess(res, 'Price updated successfully', { price });
});

// @desc    Delete price entry
// @route   DELETE /api/admin/prices/:id
// @access  Private (Admin)
export const deletePrice = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'price id');
  const price = await Price.findByIdAndDelete(id);
  if (!price) {
    return sendError(res, 'Price not found', 404);
  }
  await audit(req, 'PRICE_DELETED', 'Price', id, { category: price.category });
  sendSuccess(res, 'Price deleted successfully', {});
});

// ============================================
// PAYMENT & REVENUE ANALYTICS
// ============================================

// @desc    Get payment analytics
// @route   GET /api/admin/analytics/payments
// @access  Private (Admin)
export const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const startDate = parseDateParam(req.query.startDate, 'startDate');
  const endDate = parseDateParam(req.query.endDate, 'endDate');

  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.paidAt = {};
    if (startDate) dateFilter.paidAt.$gte = startDate;
    if (endDate) dateFilter.paidAt.$lte = endDate;
  }

  const [totalRevenue, statusBreakdown, dailyRevenue, monthlyRevenue] = await Promise.all([
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED, ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Payment.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED, ...dateFilter } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED, ...dateFilter } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  const adminUser = await User.findById(req.user.id).select('bankDetails');
  const bankDetails = adminUser?.bankDetails ? {
    accountNumber: adminUser.bankDetails.accountNumber ? `****${adminUser.bankDetails.accountNumber.slice(-4)}` : '',
    beneficiaryName: adminUser.bankDetails.beneficiaryName,
    bankName: adminUser.bankDetails.bankName,
    isConfigured: !!adminUser.bankDetails.fundAccountId
  } : null;

  const walletDateFilter = {};
  if (startDate || endDate) {
    walletDateFilter.createdAt = {};
    if (startDate) walletDateFilter.createdAt.$gte = startDate;
    if (endDate) walletDateFilter.createdAt.$lte = endDate;
  }

  const [statsCommissions] = await WalletTransaction.aggregate([
    { $match: { category: 'COMMISSION', type: 'DEBIT', status: 'SUCCESS', ...walletDateFilter } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const commissionRevenue = statsCommissions?.total || 0;

  const [allTimeCommissions, allTimeWithdrawals] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: { category: 'COMMISSION', type: 'DEBIT', status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    WalletTransaction.aggregate([
      { $match: { category: 'WITHDRAWAL', context: 'system_payout', status: { $in: ['SUCCESS', 'PENDING'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);
  const adminBalance = roundMoney((allTimeCommissions[0]?.total || 0) - (allTimeWithdrawals[0]?.total || 0));
  const paymentTotal = totalRevenue[0]?.total || 0;

  sendSuccess(res, 'Payment analytics retrieved successfully', {
    totalRevenue: paymentTotal + commissionRevenue,
    revenueBreakdown: { payments: paymentTotal, commissions: commissionRevenue },
    adminWalletBalance: adminBalance,
    totalPayments: totalRevenue[0]?.count || 0,
    statusBreakdown,
    dailyRevenue,
    monthlyRevenue,
    bankDetails
  });
});

// ============================================
// SUBSCRIPTION PLAN MANAGEMENT (Admin)
// ============================================

// @desc    Get all subscription plans (Admin)
// @route   GET /api/admin/subscriptions/plans
// @access  Private (Admin)
export const getAllSubscriptionPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.find().sort({ isActive: -1, sortOrder: 1, createdAt: -1 });
  sendSuccess(res, 'Subscription plans retrieved successfully', { plans });
});

const PLAN_FIELDS = [
  'name', 'description', 'price', 'currency', 'duration', 'durationType',
  'features', 'maxPickups', 'maxMarketplaceRequests', 'priority', 'isActive',
  'isPopular', 'sortOrder'
];

const pickPlanFields = (body) => {
  const out = {};
  for (const field of PLAN_FIELDS) {
    if (body[field] !== undefined) out[field] = body[field];
  }
  if (out.price !== undefined) out.price = parseMoney(out.price, { min: 0, max: 1000000, name: 'price' });
  return out;
};

// @desc    Create subscription plan
// @route   POST /api/admin/subscriptions/plans
// @access  Private (Admin)
export const createPlan = asyncHandler(async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(pickPlanFields(req.body));
    await audit(req, 'PLAN_CREATED', 'SubscriptionPlan', plan._id, { name: plan.name, price: plan.price });
    sendSuccess(res, 'Subscription plan created successfully', { plan });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return sendError(res, error.message, 400);
    }
    throw error;
  }
});

// @desc    Update subscription plan
// @route   PUT /api/admin/subscriptions/plans/:id
// @access  Private (Admin)
export const updatePlan = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'plan id');
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      id,
      { $set: pickPlanFields(req.body) },
      { new: true, runValidators: true }
    );
    if (!plan) {
      return sendError(res, 'Plan not found', 404);
    }
    await audit(req, 'PLAN_UPDATED', 'SubscriptionPlan', id, { fields: Object.keys(req.body) });
    sendSuccess(res, 'Subscription plan updated successfully', { plan });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return sendError(res, error.message, 400);
    }
    throw error;
  }
});

// @desc    Delete subscription plan
// @route   DELETE /api/admin/subscriptions/plans/:id
// @access  Private (Admin)
export const deletePlan = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'plan id');
  const plan = await SubscriptionPlan.findById(id);
  if (!plan) {
    return sendError(res, 'Plan not found', 404);
  }

  const activeSubscriptions = await Scrapper.countDocuments({
    'subscription.planId': plan._id,
    'subscription.status': 'active'
  });
  if (activeSubscriptions > 0) {
    return sendError(res, 'Cannot delete plan with active subscriptions. Deactivate instead.', 400);
  }

  await SubscriptionPlan.findByIdAndDelete(id);
  await audit(req, 'PLAN_DELETED', 'SubscriptionPlan', id, { name: plan.name });
  sendSuccess(res, 'Subscription plan deleted successfully', {});
});

// @desc    Get all subscriptions (admin) — paginated at the database level
// @route   GET /api/admin/subscriptions/all
// @access  Private (Admin)
export const getAllSubscriptions = asyncHandler(async (req, res) => {
  const { checkExpiredSubscriptions } = await import('../services/subscriptionService.js');
  await checkExpiredSubscriptions().catch((err) =>
    logger.error('[Admin] checkExpiredSubscriptions failed:', { error: err.message })
  );

  const { page, limit, skip } = parsePagination(req.query);

  const filter = { 'subscription.planId': { $ne: null } };
  const status = pickEnum(req.query.status, ['active', 'expired', 'cancelled', 'none']);
  if (status) filter['subscription.status'] = status;

  const [scrappers, total] = await Promise.all([
    Scrapper.find(filter)
      .select('name phone email subscription')
      .populate('subscription.planId', 'name price duration durationType maxPickups maxMarketplaceRequests')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Scrapper.countDocuments(filter)
  ]);

  const subscriptions = scrappers.map((s) => ({
    scrapper: { id: s._id, name: s.name, phone: s.phone, email: s.email },
    subscription: s.subscription,
    type: 'general'
  }));

  sendSuccess(res, 'Subscriptions retrieved successfully', {
    subscriptions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ============================================
// FINANCE MANAGEMENT
// ============================================

// @desc    Update Admin Bank Details (For Payouts)
// @route   PUT /api/admin/finance/bank-details
// @access  Private (Admin)
export const updateAdminBankDetails = asyncHandler(async (req, res) => {
  const accountNumber = asString(req.body.accountNumber, 34);
  const ifsc = asString(req.body.ifsc, 11);
  const beneficiaryName = asString(req.body.beneficiaryName, 100);
  const bankName = asString(req.body.bankName, 100);
  const userId = req.user.id;

  if (!accountNumber || !ifsc || !beneficiaryName) {
    return sendError(res, 'Please provide Account Number, IFSC and Beneficiary Name', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  let contactId = user.bankDetails?.contactId;
  if (!contactId) {
    try {
      const contact = await createContact(user.name, user.email, user.phone);
      contactId = contact.id;
    } catch (err) {
      return sendError(res, 'Failed to register contact on Razorpay: ' + err.message, 502);
    }
  }

  let fundAccountId;
  try {
    const fundAccount = await createFundAccount(contactId, {
      accountNumber,
      ifsc,
      name: beneficiaryName
    });
    fundAccountId = fundAccount.id;
  } catch (err) {
    return sendError(res, 'Failed to verify bank account with Razorpay: ' + err.message, 502);
  }

  user.bankDetails = {
    accountNumber: accountNumber.slice(-4), // last 4 digits only
    ifsc,
    beneficiaryName,
    bankName,
    contactId,
    fundAccountId
  };
  await user.save();

  await audit(req, 'ADMIN_BANK_DETAILS_UPDATED', 'User', userId);

  sendSuccess(res, 'Bank details updated successfully', { bankDetails: user.bankDetails });
});

// @desc    Withdraw Admin Funds (System Payout)
// @route   POST /api/admin/finance/withdraw
// @access  Private (Admin)
export const withdrawFunds = asyncHandler(async (req, res) => {
  const amount = parseMoney(req.body.amount, { min: 1, max: 10000000, name: 'withdrawal amount' });
  const notes = asString(req.body.notes, 200);
  const userId = req.user.id;

  const user = await User.findById(userId);
  if (!user?.bankDetails?.fundAccountId) {
    return sendError(res, 'Bank details not found. Please configure withdrawal account first.', 400);
  }

  const [allTimeCommissions, allTimeWithdrawals] = await Promise.all([
    WalletTransaction.aggregate([
      { $match: { category: 'COMMISSION', type: 'DEBIT', status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    WalletTransaction.aggregate([
      { $match: { category: 'WITHDRAWAL', context: 'system_payout', status: { $in: ['SUCCESS', 'PENDING'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);

  const currentBalance = roundMoney((allTimeCommissions[0]?.total || 0) - (allTimeWithdrawals[0]?.total || 0));
  if (currentBalance < amount) {
    return sendError(res, 'Insufficient funds in Admin Wallet', 400);
  }

  let payoutResult;
  const referenceId = `wd_${Date.now()}`;
  try {
    payoutResult = await initiatePayout(user.bankDetails.fundAccountId, amount, 'IMPS', 'payout', referenceId);
  } catch (err) {
    return sendError(res, 'Withdrawal Failed at Gateway: ' + err.message, 502);
  }

  const transaction = await WalletTransaction.create({
    trxId: `TRX-ADM-WD-${Date.now()}`,
    user: req.user.id,
    userType: 'User',
    amount,
    type: 'DEBIT',
    balanceBefore: currentBalance,
    balanceAfter: roundMoney(currentBalance - amount),
    category: 'WITHDRAWAL',
    status: payoutResult.status === 'processed' ? 'SUCCESS' : 'PENDING',
    description: notes || 'Admin Payout Withdrawal',
    context: 'system_payout',
    idempotencyKey: `admin-payout:${payoutResult.id}`,
    gateway: {
      provider: 'RAZORPAY_X',
      paymentId: payoutResult.id,
      status: payoutResult.status
    }
  });

  await audit(req, 'ADMIN_PAYOUT', 'WalletTransaction', transaction._id, {
    amount,
    payoutId: payoutResult.id,
    payoutStatus: payoutResult.status
  });

  sendSuccess(res, 'Withdrawal processed successfully', {
    amount,
    remainingBalance: roundMoney(currentBalance - amount),
    transactionId: transaction.trxId,
    payoutStatus: payoutResult.status
  });
});

// @desc    Get all withdrawal requests
// @route   GET /api/admin/finance/withdrawals
// @access  Private (Admin)
export const getAllWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const filter = {};
  const status = pickEnum(req.query.status, ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED']);
  if (status) filter.status = status;
  const userType = pickEnum(req.query.userType, ['User', 'Scrapper']);
  if (userType) filter.userType = userType;

  const [withdrawals, total] = await Promise.all([
    WithdrawalRequest.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    WithdrawalRequest.countDocuments(filter)
  ]);

  sendSuccess(res, 'Withdrawals fetched successfully', {
    withdrawals,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

/**
 * Withdrawal state machine:
 *   PENDING  -> APPROVED | REJECTED | PROCESSED (approve+mark-paid in one step)
 *   APPROVED -> PROCESSED | FAILED
 * Terminal: PROCESSED, REJECTED, FAILED.
 * REJECTED / FAILED refund the reserved funds via the ledger (never silently
 * lost, even when the original walletTrx reference is missing).
 */
const WITHDRAWAL_TRANSITIONS = {
  PENDING: ['APPROVED', 'REJECTED', 'PROCESSED'],
  APPROVED: ['PROCESSED', 'FAILED'],
  REJECTED: [],
  PROCESSED: [],
  FAILED: []
};

// @desc    Update withdrawal request status
// @route   PUT /api/admin/finance/withdrawals/:id
// @access  Private (Admin)
export const updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'withdrawal id');
  const status = pickEnum(req.body.status, ['APPROVED', 'REJECTED', 'PROCESSED', 'FAILED']);
  const remarks = asString(req.body.remarks, 500);
  const transactionId = asString(req.body.transactionId, 100);

  if (!status) {
    return sendError(res, 'Invalid status', 400);
  }

  try {
    const withdrawal = await withTransaction(async (session) => {
      const wd = await WithdrawalRequest.findById(id).session(session);
      if (!wd) throw new AppError('Withdrawal request not found', 404);

      if (!WITHDRAWAL_TRANSITIONS[wd.status]?.includes(status)) {
        throw new AppError(`Cannot change withdrawal from '${wd.status}' to '${status}'`, 409);
      }

      wd.status = status;
      if (remarks) wd.adminNotes = remarks;
      if (transactionId) wd.transactionId = transactionId;
      wd.processedBy = req.user.id;
      wd.processedAt = new Date();
      await wd.save({ session });

      // Locate the reserving ledger row (by direct reference, with a metadata
      // fallback for legacy records).
      let walletTrx = null;
      if (wd.walletTrxId) {
        walletTrx = await WalletTransaction.findById(wd.walletTrxId).session(session);
      }
      if (!walletTrx) {
        walletTrx = await WalletTransaction.findOne({ 'metadata.withdrawalId': id }).session(session);
      }
      if (!walletTrx) {
        walletTrx = await WalletTransaction.findOne({ trxId: wd.request_id }).session(session);
      }

      if (status === 'REJECTED' || status === 'FAILED') {
        // REFUND the reserved amount. Works even when the original ledger row
        // is missing — the refund credit itself is a ledger row, idempotent
        // per withdrawal so a retried admin click cannot double-refund.
        await creditWallet({
          ownerId: wd.user,
          ownerType: wd.userType,
          amount: wd.amount,
          category: 'REFUND',
          description: `Withdrawal ${wd.request_id} ${status.toLowerCase()}${remarks ? `: ${remarks}` : ''}`,
          gateway: { provider: 'SYSTEM' },
          idempotencyKey: `withdrawal-refund:${wd._id}`,
          session,
          allowFrozen: true
        });
        if (walletTrx) {
          walletTrx.status = 'REVERSED';
          walletTrx.description += ` (${status}: ${remarks || 'by admin'})`;
          await walletTrx.save({ session });
        }
      } else if (status === 'PROCESSED') {
        if (walletTrx) {
          walletTrx.status = 'SUCCESS';
          if (transactionId) {
            walletTrx.metadata = walletTrx.metadata || new Map();
            walletTrx.metadata.set('bankTxId', transactionId);
          }
          await walletTrx.save({ session });
        }
      }
      // APPROVED: funds stay reserved (ledger row stays PENDING) until payout executes.

      return wd;
    });

    await audit(req, `WITHDRAWAL_${status}`, 'WithdrawalRequest', id, {
      amount: withdrawal.amount,
      remarks,
      transactionId
    });

    sendNotificationToUser(withdrawal.user.toString(), {
      title: status === 'PROCESSED' ? 'Withdrawal Processed ✅' : `Withdrawal ${status.toLowerCase()}`,
      body: status === 'PROCESSED'
        ? `Your withdrawal of ₹${withdrawal.amount} has been processed.`
        : status === 'REJECTED' || status === 'FAILED'
          ? `Your withdrawal of ₹${withdrawal.amount} was ${status.toLowerCase()} and the amount has been returned to your wallet.`
          : `Your withdrawal of ₹${withdrawal.amount} has been approved and is being processed.`,
      data: { type: 'withdrawal_update', status }
    });

    sendSuccess(res, 'Withdrawal status updated', withdrawal);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    logger.error('[Admin] Withdraw Update Failed', { error: error.message });
    sendError(res, 'Failed to update withdrawal', 500);
  }
});

// ============================================
// SETTINGS MANAGEMENT
// ============================================

/** Allow-listed settings with their validators. */
const SETTING_SCHEMA = {
  scrap_commission_percentage: (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      throw new AppError('Commission percentage must be between 0 and 100', 400);
    }
    return num;
  },
  scrapper_tutorial_video: (value) => {
    const str = asString(value, 500);
    if (!str || !/^https:\/\//.test(str)) {
      throw new AppError('Value must be an https URL', 400);
    }
    return str;
  },
  min_wallet_balance_for_orders: (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > 100000) {
      throw new AppError('Minimum balance must be between 0 and 100000', 400);
    }
    return num;
  }
};

// @desc    Get all system settings
// @route   GET /api/admin/settings
// @access  Private (Admin)
export const getSystemSettings = asyncHandler(async (req, res) => {
  let settings = await SystemSetting.find();

  if (settings.length === 0) {
    const defaultSetting = await SystemSetting.create({
      key: 'scrap_commission_percentage',
      value: 1,
      description: 'Platform commission percentage for scrap sell orders',
      updatedBy: req.user.id
    });
    settings = [defaultSetting];
  }

  sendSuccess(res, 'System settings retrieved', settings);
});

// @desc    Update a specific system setting (allow-listed keys only)
// @route   PUT /api/admin/settings/:key
// @access  Private (Admin)
export const updateSystemSetting = asyncHandler(async (req, res) => {
  const key = asString(req.params.key, 60);
  const validator = SETTING_SCHEMA[key];
  if (!validator) {
    return sendError(res, `Unknown setting key '${key}'`, 400);
  }
  if (req.body.value === undefined) {
    return sendError(res, 'Value is required', 400);
  }

  let value;
  try {
    value = validator(req.body.value);
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 400);
  }

  const setting = await SystemSetting.findOneAndUpdate(
    { key },
    { value, updatedBy: req.user.id, $setOnInsert: { description: key.replace(/_/g, ' ') } },
    { new: true, upsert: true }
  );

  await audit(req, 'SETTING_UPDATED', 'SystemSetting', key, { value });

  sendSuccess(res, 'Setting updated successfully', setting);
});

// ============================================
// AUDIT LOGS
// ============================================

// @desc    List admin/financial audit logs
// @route   GET /api/admin/audit-logs
// @access  Private (Admin)
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query, { defaultLimit: 50 });
  const { entries, total } = await listAudits({
    page,
    limit,
    action: asString(req.query.action, 60),
    targetType: asString(req.query.targetType, 40),
    targetId: asString(req.query.targetId, 60)
  });
  sendSuccess(res, 'Audit logs retrieved', {
    entries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// ============================================
// NOTIFICATION & BROADCAST
// ============================================

// @desc    Broadcast notification to users and scrappers
// @route   POST /api/admin/broadcast
// @access  Private (Admin)
export const broadcastNotification = asyncHandler(async (req, res) => {
  const title = asString(req.body.title, 120);
  const body = asString(req.body.body || req.body.message, 500);
  const target = pickEnum(req.body.target || req.body.targetAudience, ['users', 'scrappers', 'all']);
  const data = req.body.data && typeof req.body.data === 'object' && !Array.isArray(req.body.data) ? req.body.data : {};

  if (!title || !body || !target) {
    return sendError(res, 'Title, body (or message) and target (or targetAudience) are required', 400);
  }

  const query = { isActive: true };
  if (target === 'users') {
    query.role = USER_ROLES.USER;
  } else if (target === 'scrappers') {
    query.role = USER_ROLES.SCRAPPER;
  } else {
    query.role = { $in: [USER_ROLES.USER, USER_ROLES.SCRAPPER] };
  }

  const usersWithTokens = await User.find(query).select('+fcmTokens +fcmTokenApp role').lean();

  let allTokens = [];
  for (const u of usersWithTokens) {
    allTokens.push(...(Array.isArray(u.fcmTokens) ? u.fcmTokens : []));
    allTokens.push(...(Array.isArray(u.fcmTokenApp) ? u.fcmTokenApp : []));
  }

  if (target === 'scrappers' || target === 'all') {
    const scrappersWithTokens = await Scrapper.find({ status: 'active' }).select('+fcmTokens +fcmTokenApp').lean();
    for (const s of scrappersWithTokens) {
      allTokens.push(...(Array.isArray(s.fcmTokens) ? s.fcmTokens : []));
      allTokens.push(...(Array.isArray(s.fcmTokenApp) ? s.fcmTokenApp : []));
    }
  }

  const uniqueTokens = [...new Set(allTokens)].filter((t) => t && typeof t === 'string');

  const batchSize = 500;
  const sendPromises = [];
  for (let i = 0; i < uniqueTokens.length; i += batchSize) {
    const batch = uniqueTokens.slice(i, i + batchSize);
    sendPromises.push(sendPushNotification(batch, {
      title,
      body,
      data: { ...data, type: 'broadcast', title, body }
    }));
  }
  if (sendPromises.length > 0) {
    await Promise.allSettled(sendPromises);
  }

  await audit(req, 'BROADCAST_SENT', 'Notification', null, { target, tokenCount: uniqueTokens.length });

  sendSuccess(res, `Broadcast sent successfully to ${uniqueTokens.length} devices`, {
    target,
    tokenCount: uniqueTokens.length
  });
});
