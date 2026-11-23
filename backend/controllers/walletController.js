import crypto from 'crypto';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import WalletTransaction from '../models/WalletTransaction.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import Order from '../models/Order.js';
import Coupon from '../models/CouponModel.js';
import CouponUsage from '../models/CouponUsageModel.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import { getRazorpayClient } from '../services/paymentService.js';
import {
  creditWallet,
  debitWallet,
  withTransaction,
  modelForRole,
  userTypeForRole
} from '../services/walletService.js';
import { parseMoney, parsePagination, asString, assertObjectId, AppError, roundMoney } from '../utils/security.js';
import { recordAudit } from '../services/auditService.js';
import logger from '../utils/logger.js';

// @desc    Get user wallet profile (balance & transactions)
// @route   GET /api/wallet/profile
// @access  Private
export const getWalletProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const Model = modelForRole(req.user.role);
  const user = await Model.findById(userId).select('wallet name email phone');

  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  const transactions = await WalletTransaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  sendSuccess(res, 'Wallet profile fetched successfully', {
    balance: user.wallet?.balance || 0,
    currency: user.wallet?.currency || 'INR',
    status: user.wallet?.status || 'ACTIVE',
    transactions
  });
});

// @desc    Create Razorpay order for wallet recharge
// @route   POST /api/wallet/recharge/create
// @access  Private
export const createRechargeOrder = asyncHandler(async (req, res) => {
  const amount = parseMoney(req.body.amount, { min: 1, max: 500000, name: 'recharge amount' });
  const userId = req.user.id;

  if (req.user.walletStatus === 'FROZEN') {
    return sendError(res, 'Wallet is frozen. Please contact support.', 403);
  }

  let razorpay;
  try {
    razorpay = getRazorpayClient();
  } catch (error) {
    logger.error('[Wallet] Razorpay init failed', { error: error.message });
    return sendError(res, 'Payment gateway error', 500);
  }

  const receiptId = `wallet_${userId.toString().slice(-10)}_${Date.now()}`;

  const options = {
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt: receiptId,
    payment_capture: 1,
    notes: {
      userId: userId.toString(),
      role: req.user.role,
      type: 'WALLET_RECHARGE'
    }
  };

  try {
    const order = await razorpay.orders.create(options);

    sendSuccess(res, 'Recharge order created', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    logger.error('[Wallet] Create Order Failed', { error: error.message });
    sendError(res, 'Failed to create recharge order', 500);
  }
});

// @desc    Verify Razorpay payment and credit wallet
// @route   POST /api/wallet/recharge/verify
// @access  Private
export const verifyRecharge = asyncHandler(async (req, res) => {
  const razorpayOrderId = asString(req.body.razorpay_order_id, 64);
  const razorpayPaymentId = asString(req.body.razorpay_payment_id, 64);
  const razorpaySignature = asString(req.body.razorpay_signature, 200);
  const userId = req.user.id;
  const role = req.user.role;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return sendError(res, 'Payment details are required', 400);
  }

  // 1. Verify Signature (constant-time)
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  const sigBuf = Buffer.from(razorpaySignature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return sendError(res, 'Invalid payment signature', 400);
  }

  // 2. Fetch authoritative facts from Razorpay. The CLIENT-SUPPLIED amount is
  //    NEVER used: the credited amount is what Razorpay actually captured.
  let razorpay;
  let rzpOrder;
  let rzpPayment;
  try {
    razorpay = getRazorpayClient();
    [rzpOrder, rzpPayment] = await Promise.all([
      razorpay.orders.fetch(razorpayOrderId),
      razorpay.payments.fetch(razorpayPaymentId)
    ]);
  } catch (error) {
    logger.error('[Wallet] Razorpay fetch failed during verify', { error: error.message });
    return sendError(res, 'Could not verify payment with gateway. Please try again.', 502);
  }

  if (!rzpPayment || rzpPayment.order_id !== razorpayOrderId) {
    return sendError(res, 'Payment does not belong to this order', 400);
  }
  if (rzpPayment.status !== 'captured') {
    return sendError(res, 'Payment not captured yet. Please wait or retry.', 400);
  }
  if ((rzpPayment.currency || 'INR') !== 'INR') {
    return sendError(res, 'Unsupported currency', 400);
  }
  // 3. The order must be a wallet recharge created for THIS user.
  const notes = rzpOrder?.notes || {};
  if (notes.type !== 'WALLET_RECHARGE' || String(notes.userId) !== String(userId)) {
    return sendError(res, 'This payment was not initiated for your wallet', 403);
  }

  const creditAmount = roundMoney(rzpPayment.amount / 100);
  if (!(creditAmount > 0)) {
    return sendError(res, 'Invalid captured amount', 400);
  }

  // 4. Idempotent credit: unique key on the Razorpay payment id.
  const { transaction, balanceAfter, duplicate } = await creditWallet({
    ownerId: userId,
    ownerType: userTypeForRole(role),
    amount: creditAmount,
    category: 'RECHARGE',
    description: 'Wallet Recharge via Razorpay',
    gateway: {
      provider: 'RAZORPAY',
      paymentId: razorpayPaymentId,
      orderId: razorpayOrderId,
      signature: razorpaySignature
    },
    idempotencyKey: `recharge:${razorpayPaymentId}`
  });

  if (duplicate) {
    return sendSuccess(res, 'Recharge already processed', {
      newBalance: transaction?.balanceAfter,
      transactionId: transaction?.trxId
    });
  }

  const { sendNotificationToUser } = await import('../utils/pushNotificationHelper.js');
  sendNotificationToUser(userId, {
    title: 'Wallet Recharged! 💰',
    body: `₹${creditAmount} has been credited to your wallet. New balance: ₹${balanceAfter}`,
    data: { type: 'wallet_credit', amount: creditAmount.toString() }
  });

  sendSuccess(res, 'Wallet recharged successfully', {
    newBalance: balanceAfter,
    transactionId: transaction.trxId
  });
});

// @desc    Get wallet transactions (paginated)
// @route   GET /api/wallet/transactions
// @access  Private
export const getWalletTransactions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = parsePagination(req.query);

  const [transactions, total] = await Promise.all([
    WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WalletTransaction.countDocuments({ user: userId })
  ]);

  sendSuccess(res, 'Transactions fetched', {
    transactions,
    totalPages: Math.ceil(total / limit),
    currentPage: page
  });
});

/**
 * Transfer for an order: payer -> payee, atomically, exactly once per order.
 * Direction is derived from the order type; the caller must be the payer.
 */
// @desc    Pay for order using wallet
// @route   POST /api/wallet/pay-order
// @access  Private (User or Scrapper)
export const payOrderViaWallet = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.body.orderId, 'orderId');
  const amount = parseMoney(req.body.amount, { min: 1, max: 500000 });
  const currentUserId = req.user.id;

  const result = await withTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw new AppError('Order not found', 404);

    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new AppError(`Order is already ${order.status}`, 400);
    }
    if (order.paymentStatus === 'completed') {
      throw new AppError('Order is already paid', 400);
    }
    if (!order.scrapper) {
      throw new AppError('No scrapper assigned to this order yet', 400);
    }
    if (!['confirmed', 'in_progress'].includes(order.status)) {
      throw new AppError('Order is not ready for payment', 400);
    }

    // Cleaning: the user pays exactly the partner's quote (never a client-chosen amount).
    if (order.orderType === 'cleaning_service') {
      const quoted = roundMoney(order.totalAmount || 0);
      if (!(quoted > 0)) throw new AppError('The partner has not shared the price for this job yet', 400);
      if (roundMoney(amount) !== quoted) throw new AppError(`Amount must match the quoted price (₹${quoted})`, 400);
    }

    let payerType;
    let payeeType;
    let payerId;
    let payeeId;
    if (order.orderType === 'cleaning_service') {
      payerType = 'User'; payeeType = 'Scrapper';
      payerId = order.user; payeeId = order.scrapper;
    } else {
      payerType = 'Scrapper'; payeeType = 'User';
      payerId = order.scrapper; payeeId = order.user;
    }

    // Authorization: the logged-in account must be the payer for this order.
    if (String(currentUserId) !== String(payerId)) {
      throw new AppError('You are not the payer for this order', 403);
    }

    // Exactly-once per order: idempotency key on the order id.
    const debit = await debitWallet({
      ownerId: payerId,
      ownerType: payerType,
      amount,
      category: 'PAYMENT_SENT',
      description: `Payment to ${payeeType} for Order #${orderId}`,
      orderId: order._id,
      idempotencyKey: `order-pay-debit:${orderId}`,
      metadata: { orderId: String(order._id) },
      session
    });
    if (debit.duplicate) {
      throw new AppError('Payment for this order was already processed', 409);
    }

    await creditWallet({
      ownerId: payeeId,
      ownerType: payeeType,
      amount,
      category: 'PAYMENT_RECEIVED',
      description: `Payment received from ${payerType} for Order #${orderId}`,
      orderId: order._id,
      idempotencyKey: `order-pay-credit:${orderId}`,
      metadata: { orderId: String(order._id) },
      session,
      allowFrozen: true // incoming funds are not blocked by a frozen payee wallet
    });

    // Record payment on the order. Status progression stays with the order
    // state machine (completion is a separate explicit step).
    order.paymentStatus = 'completed';
    order.totalAmount = amount;
    order.paidVia = 'wallet';
    await order.save({ session });

    return { balanceAfter: debit.balanceAfter, payeeId };
  });

  const { sendNotificationToUser } = await import('../utils/pushNotificationHelper.js');
  sendNotificationToUser(String(result.payeeId), {
    title: 'Payment Received! 💵',
    body: `You have received ₹${amount} for order #${orderId.slice(-6)}.`,
    data: { orderId, type: 'payment_received' }
  });

  sendSuccess(res, 'Payment successful', {
    newBalance: result.balanceAfter,
    orderId
  });
});

// @desc    Request withdrawal
// @route   POST /api/wallet/withdraw
// @access  Private
export const requestWithdrawal = asyncHandler(async (req, res) => {
  const amount = parseMoney(req.body.amount, { min: 100, max: 500000, name: 'withdrawal amount' });
  const userId = req.user.id;
  const role = req.user.role;

  const bd = req.body.bankDetails;
  if (!bd || typeof bd !== 'object' || Array.isArray(bd)) {
    return sendError(res, 'Valid bank details or UPI ID required', 400);
  }
  const bankDetails = {
    accountHolderName: asString(bd.accountHolderName, 100),
    accountNumber: asString(bd.accountNumber, 34),
    ifscCode: asString(bd.ifscCode, 11),
    bankName: asString(bd.bankName, 100),
    upiId: asString(bd.upiId, 100),
    method: bd.upiId ? 'UPI' : 'BANK_TRANSFER'
  };
  if (!bankDetails.upiId && !(bankDetails.accountNumber && bankDetails.ifscCode)) {
    return sendError(res, 'Valid bank details or UPI ID required', 400);
  }

  // Optional client idempotency key prevents double-submit on double-click.
  const clientKey = asString(req.body.idempotencyKey, 64);

  // Reject duplicate in-flight requests for the same user.
  const pendingExists = await WithdrawalRequest.exists({ user: userId, status: 'PENDING' });
  if (pendingExists) {
    return sendError(res, 'You already have a pending withdrawal request', 409);
  }

  const requestId = `WDR-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

  const result = await withTransaction(async (session) => {
    // Funds are RESERVED by debiting the wallet now (status PENDING in ledger).
    // Rejection refunds; approval marks SUCCESS.
    const debit = await debitWallet({
      ownerId: userId,
      ownerType: userTypeForRole(role),
      amount,
      category: 'WITHDRAWAL',
      description: 'Withdrawal Request',
      idempotencyKey: clientKey ? `withdraw:${userId}:${clientKey}` : `withdraw:${requestId}`,
      status: 'PENDING',
      session
    });
    if (debit.duplicate) {
      throw new AppError('This withdrawal request was already submitted', 409);
    }

    const [withdrawal] = await WithdrawalRequest.create(
      [{
        request_id: requestId,
        user: userId,
        userType: userTypeForRole(role),
        amount,
        status: 'PENDING',
        bankDetails,
        walletTrxId: debit.transaction._id
      }],
      session ? { session } : {}
    );

    debit.transaction.metadata = new Map([['withdrawalId', withdrawal._id.toString()]]);
    await debit.transaction.save(session ? { session } : {});

    return { withdrawal, balanceAfter: debit.balanceAfter };
  });

  await recordAudit({
    actorId: userId,
    actorRole: role,
    action: 'WITHDRAWAL_REQUESTED',
    targetType: 'WithdrawalRequest',
    targetId: result.withdrawal._id,
    metadata: { amount, requestId }
  });

  sendSuccess(res, 'Withdrawal request submitted successfully', {
    requestId: result.withdrawal.request_id,
    newBalance: result.balanceAfter
  });
});

// @desc    Apply coupon to add balance
// @route   POST /api/wallet/apply-coupon
// @access  Private (User or Scrapper)
export const applyCoupon = asyncHandler(async (req, res) => {
  const code = asString(req.body.code, 30)?.toUpperCase();
  const userId = req.user.id;
  const role = req.user.role;

  if (!code) {
    return sendError(res, 'Coupon code is required', 400);
  }

  try {
    const outcome = await withTransaction(async (session) => {
      // Atomically consume one use of the coupon. The filter enforces active,
      // date-valid, role-valid and under-limit in a single conditional update,
      // so concurrent redemptions cannot exceed the limit.
      const now = new Date();
      const coupon = await Coupon.findOneAndUpdate(
        {
          code,
          isActive: true,
          validFrom: { $lte: now },
          validTo: { $gte: now },
          applicableRole: { $in: ['ALL', role.toUpperCase()] },
          $or: [
            { usageType: { $ne: 'LIMITED' } },
            { $expr: { $lt: ['$usedCount', '$limit'] } }
          ]
        },
        { $inc: { usedCount: 1 } },
        { new: true, session }
      );
      if (!coupon) {
        throw new AppError('Invalid, expired or exhausted coupon code', 400);
      }

      // Per-user single redemption (unique index enforces under concurrency).
      try {
        const usageDoc = {
          couponId: coupon._id,
          userId: role === 'user' ? userId : null,
          scrapperId: role === 'scrapper' ? userId : null,
          userType: userTypeForRole(role),
          amount: coupon.amount
        };
        const credit = await creditWallet({
          ownerId: userId,
          ownerType: userTypeForRole(role),
          amount: coupon.amount,
          category: 'COUPON_CREDIT',
          description: `Coupon Applied: ${coupon.code}`,
          couponCode: coupon.code,
          gateway: { provider: 'SYSTEM' },
          idempotencyKey: `coupon:${coupon._id}:${userId}`,
          session
        });
        if (credit.duplicate) {
          throw new AppError('You have already redeemed this coupon', 400);
        }
        usageDoc.walletTransactionId = credit.transaction._id;
        await CouponUsage.create([usageDoc], session ? { session } : {});
        return { balanceAfter: credit.balanceAfter, amount: coupon.amount };
      } catch (err) {
        if (err.code === 11000) throw new AppError('You have already redeemed this coupon', 400);
        throw err;
      }
    });

    sendSuccess(res, 'Coupon applied successfully', {
      newBalance: outcome.balanceAfter,
      amountCredited: outcome.amount,
      message: `₹${outcome.amount} added to your wallet!`
    });
  } catch (error) {
    if (error instanceof AppError) {
      return sendError(res, error.message, error.statusCode);
    }
    logger.error('[Wallet] Apply Coupon Failed', { error: error.message });
    return sendError(res, 'Failed to apply coupon', 500);
  }
});

// @desc    Get active coupons available for the current user
// @route   GET /api/wallet/coupons
// @access  Private
export const getAvailableCoupons = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const userRoleUpper = role.toUpperCase();
  const now = new Date();

  const coupons = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    applicableRole: { $in: ['ALL', userRoleUpper] }
  }).lean();

  if (coupons.length === 0) {
    return sendSuccess(res, 'Available coupons fetched', []);
  }

  // One query for all usages instead of N+1.
  const usages = await CouponUsage.find({
    couponId: { $in: coupons.map((c) => c._id) },
    ...(role === 'user' ? { userId } : { scrapperId: userId })
  }).select('couponId').lean();
  const usedIds = new Set(usages.map((u) => String(u.couponId)));

  const availableCoupons = coupons
    .filter((c) => !(c.usageType === 'LIMITED' && c.usedCount >= c.limit))
    .filter((c) => !usedIds.has(String(c._id)))
    .map((c) => ({
      code: c.code,
      title: c.title,
      amount: c.amount,
      validTo: c.validTo,
      description: `Get ₹${c.amount} credit`
    }));

  sendSuccess(res, 'Available coupons fetched', availableCoupons);
});
