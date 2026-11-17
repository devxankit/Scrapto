import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Scrapper from '../models/Scrapper.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import {
  getRazorpayClient,
  verifyPayment as verifyPaymentAPI,
  verifyPaymentSignature,
  refundPayment
} from '../services/paymentService.js';
import { creditWallet, withTransaction } from '../services/walletService.js';
import { PAYMENT_STATUS, ORDER_STATUS } from '../config/constants.js';
import { assertObjectId, asString, roundMoney, parseMoney } from '../utils/security.js';
import { recordAudit } from '../services/auditService.js';
import logger from '../utils/logger.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';

const PAISE_TOLERANCE = 100; // allow ≤ ₹1 rounding drift between order and capture

/**
 * Credit the assigned scrapper for a user's captured online order payment.
 * Idempotent on the Razorpay payment id — webhook and verify can race freely.
 */
const creditScrapperForOrderPayment = async (order, payment, razorpayPaymentId) => {
  if (!order.scrapper) return;
  const { duplicate } = await creditWallet({
    ownerId: order.scrapper,
    ownerType: 'Scrapper',
    amount: roundMoney(payment.amount),
    category: 'PAYMENT_RECEIVED',
    description: `Payment received for Order #${order._id}`,
    orderId: order._id,
    gateway: { provider: 'RAZORPAY', paymentId: razorpayPaymentId },
    idempotencyKey: `order-online-credit:${razorpayPaymentId}`,
    metadata: { orderId: String(order._id), paymentId: String(payment._id) },
    allowFrozen: true
  });
  if (!duplicate) {
    logger.info(`[Payment] Credited ₹${payment.amount} to scrapper ${order.scrapper} for order ${order._id}`);
  }
};

/**
 * Activate a subscription for a completed subscription payment, exactly once.
 * Used by both the verify endpoint and the webhook.
 */
const activateSubscriptionForPayment = async (payment) => {
  const { activateSubscription } = await import('../services/subscriptionService.js');
  if (!payment.planId) {
    logger.warn(`[Payment] Subscription payment ${payment._id} has no planId; cannot activate`);
    return;
  }
  await activateSubscription(payment.user, payment._id);
};

// @desc    Create Razorpay order for an order payment
// @route   POST /api/payments/create-order
// @access  Private (order owner)
export const createPaymentOrder = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.body.orderId, 'orderId');
  const userId = req.user.id;

  const order = await Order.findById(orderId).populate('user', 'name email phone');
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }
  if (order.user._id.toString() !== userId) {
    return sendError(res, 'Not authorized to pay for this order', 403);
  }
  if (order.status !== ORDER_STATUS.CONFIRMED && order.status !== ORDER_STATUS.IN_PROGRESS) {
    return sendError(res, 'Order is not ready for payment', 400);
  }
  if (order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
    return sendError(res, 'Payment already completed for this order', 400);
  }
  const amount = roundMoney(order.totalAmount);
  if (!(amount > 0)) {
    return sendError(res, 'Order amount is not set', 400);
  }

  const existingPayment = await Payment.findOne({ order: orderId, user: userId });
  if (existingPayment && existingPayment.status === PAYMENT_STATUS.COMPLETED) {
    return sendError(res, 'Payment already completed for this order', 400);
  }

  let razorpay;
  try {
    razorpay = getRazorpayClient();
  } catch (razorpayError) {
    logger.error('[Payment] Razorpay client initialization error:', { error: razorpayError.message });
    return sendError(res, 'Payment gateway not configured. Please contact support.', 500);
  }

  const receiptId = `scrapto_${orderId.slice(-20)}_${Date.now()}`.slice(0, 40);

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: receiptId,
      payment_capture: 1,
      notes: {
        orderId: order._id.toString(),
        userId: userId.toString(),
        entityType: 'order'
      }
    });
  } catch (razorpayError) {
    logger.error('[Payment] Razorpay order creation error:', { error: razorpayError.message });
    return sendError(res, 'Failed to create payment order. Please try again later.', 502);
  }

  const paymentData = {
    order: orderId,
    user: userId,
    amount,
    currency: 'INR',
    entityType: 'order',
    razorpayOrderId: razorpayOrder.id,
    receipt: receiptId,
    status: PAYMENT_STATUS.PENDING
  };

  let payment;
  if (existingPayment) {
    Object.assign(existingPayment, paymentData);
    payment = await existingPayment.save();
  } else {
    payment = await Payment.create(paymentData);
  }

  sendSuccess(res, 'Payment order created successfully', {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    paymentId: payment._id
  });
});

// @desc    Verify payment and update status
// @route   POST /api/payments/verify
// @access  Private (order owner)
export const verifyPayment = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.body.orderId, 'orderId');
  const razorpayOrderId = asString(req.body.razorpay_order_id, 64);
  const razorpayPaymentId = asString(req.body.razorpay_payment_id, 64);
  const razorpaySignature = asString(req.body.razorpay_signature, 200);
  const userId = req.user.id;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }
  if (order.user.toString() !== userId) {
    return sendError(res, 'Not authorized to verify payment for this order', 403);
  }

  const payment = await Payment.findOne({
    order: orderId,
    user: userId,
    razorpayOrderId
  });
  if (!payment) {
    return sendError(res, 'Payment record not found', 404);
  }
  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    return sendSuccess(res, 'Payment already verified', { payment, order });
  }

  // Signature verification is REQUIRED (frontend success callbacks are never
  // trusted on their own; API verification then confirms capture + amount).
  if (!razorpaySignature || !verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return sendError(res, 'Invalid payment signature', 400);
  }

  let verificationResult;
  try {
    verificationResult = await verifyPaymentAPI(razorpayOrderId);
  } catch (error) {
    logger.error('[Payment] Payment verification error:', { error: error.message });
    return sendError(res, 'Failed to verify payment. Please try again.', 502);
  }

  if (!verificationResult.success || !verificationResult.payment) {
    return sendError(res, 'Payment not completed. Please complete the payment.', 400);
  }

  const captured = verificationResult.payment;
  // Amount & currency must match what we asked Razorpay to collect.
  const expectedPaise = Math.round(payment.amount * 100);
  if (Math.abs((captured.amount || 0) - expectedPaise) > PAISE_TOLERANCE) {
    logger.error('[Payment] Captured amount mismatch', {
      paymentId: payment._id.toString(),
      expectedPaise,
      capturedPaise: captured.amount
    });
    return sendError(res, 'Payment amount mismatch. Please contact support.', 409);
  }
  if ((captured.currency || 'INR') !== 'INR') {
    return sendError(res, 'Unsupported currency', 400);
  }

  payment.status = PAYMENT_STATUS.COMPLETED;
  payment.razorpayPaymentId = verificationResult.paymentId;
  payment.transactionId = verificationResult.paymentId;
  payment.paidAt = new Date();
  payment.razorpaySignature = razorpaySignature;
  await payment.save();

  // Credit the assigned scrapper (idempotent on payment id).
  try {
    await creditScrapperForOrderPayment(order, payment, verificationResult.paymentId);
  } catch (walletError) {
    logger.error('[Payment] Failed to credit scrapper wallet:', { error: walletError.message });
  }

  order.paymentStatus = PAYMENT_STATUS.COMPLETED;
  order.paidVia = 'razorpay';
  await order.save();

  await payment.populate('order', 'status paymentStatus totalAmount');

  sendNotificationToUser(userId, {
    title: 'Payment Successful 💰',
    body: `Payment for order #${order._id.toString().slice(-6)} has been verified.`,
    data: { orderId: order._id.toString(), type: 'payment_success' }
  });

  sendSuccess(res, 'Payment verified successfully', { payment, order });
});

// @desc    Get payment details
// @route   GET /api/payments/:paymentId
// @access  Private (owner or admin)
export const getPayment = asyncHandler(async (req, res) => {
  const paymentId = assertObjectId(req.params.paymentId, 'paymentId');
  const userId = req.user.id;

  const payment = await Payment.findById(paymentId)
    .populate('order')
    .populate('user', 'name email phone');

  if (!payment) {
    return sendError(res, 'Payment not found', 404);
  }
  if (req.user.role !== 'admin' && payment.user._id.toString() !== userId) {
    return sendError(res, 'Not authorized to access this payment', 403);
  }

  sendSuccess(res, 'Payment retrieved successfully', { payment });
});

// @desc    Get user's payment history
// @route   GET /api/payments/my-payments
// @access  Private
export const getMyPayments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const status = asString(req.query.status, 20);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query = { user: userId };
  if (status && Object.values(PAYMENT_STATUS).includes(status)) {
    query.status = status;
  }

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('order', 'status totalAmount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(query)
  ]);

  sendSuccess(res, 'Payments retrieved successfully', {
    payments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Refund payment (gateway refund + compensating wallet reversal)
// @route   POST /api/payments/:paymentId/refund
// @access  Private (Admin only)
export const refundPaymentAmount = asyncHandler(async (req, res) => {
  const paymentId = assertObjectId(req.params.paymentId, 'paymentId');
  const reason = asString(req.body.reason, 200);

  // Authorization: refunds move real money — admin-only, by policy.
  if (req.user.role !== 'admin') {
    return sendError(res, 'Only administrators can process refunds', 403);
  }

  const payment = await Payment.findById(paymentId).populate('order').populate('user');
  if (!payment) {
    return sendError(res, 'Payment not found', 404);
  }
  if (payment.status !== PAYMENT_STATUS.COMPLETED) {
    return sendError(res, 'Only completed payments can be refunded', 400);
  }
  if (payment.refundId) {
    return sendError(res, 'Payment already refunded', 400);
  }
  if (!payment.razorpayPaymentId) {
    return sendError(res, 'Payment ID not found. Cannot process refund.', 400);
  }

  const refundAmount = req.body.amount !== undefined
    ? parseMoney(req.body.amount, { min: 0.01, max: payment.amount, name: 'refund amount' })
    : payment.amount;

  let refund;
  try {
    refund = await refundPayment(
      payment.razorpayPaymentId,
      refundAmount < payment.amount ? refundAmount : null
    );
  } catch (error) {
    logger.error('[Payment] Refund error:', { error: error.message });
    return sendError(res, 'Failed to process refund. Please try again.', 502);
  }

  payment.refundId = refund.id;
  payment.refundAmount = refundAmount;
  payment.refundedAt = new Date();
  payment.status = PAYMENT_STATUS.REFUNDED;
  if (reason) {
    payment.notes = `${payment.notes || ''}\nRefund reason: ${reason}`.trim();
  }
  await payment.save();

  if (payment.order) {
    payment.order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    await payment.order.save();
  }

  await recordAudit({
    actorId: req.user.id,
    actorRole: 'admin',
    action: 'PAYMENT_REFUNDED',
    targetType: 'Payment',
    targetId: payment._id,
    metadata: { refundAmount, refundId: refund.id, reason }
  });

  logger.info('[Payment] Refund processed:', { paymentId: payment._id.toString(), refundId: refund.id, amount: refundAmount });

  sendSuccess(res, 'Refund processed successfully', { payment, refund });
});

// @desc    Get payment status (for polling)
// @route   GET /api/payments/order/:orderId/status
// @access  Private (order owner)
export const getPaymentStatus = asyncHandler(async (req, res) => {
  const orderId = assertObjectId(req.params.orderId, 'orderId');
  const userId = req.user.id;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }
  if (order.user.toString() !== userId) {
    return sendError(res, 'Not authorized', 403);
  }

  const payment = await Payment.findOne({ order: orderId, user: userId });
  if (!payment) {
    return sendSuccess(res, 'Payment not initiated', { status: PAYMENT_STATUS.PENDING, payment: null });
  }

  // Reconcile pending payments against the gateway (amount-checked, idempotent).
  if (payment.status === PAYMENT_STATUS.PENDING && payment.razorpayOrderId) {
    try {
      const verificationResult = await verifyPaymentAPI(payment.razorpayOrderId);
      if (verificationResult.success && verificationResult.payment) {
        const expectedPaise = Math.round(payment.amount * 100);
        if (Math.abs((verificationResult.payment.amount || 0) - expectedPaise) <= PAISE_TOLERANCE) {
          payment.status = PAYMENT_STATUS.COMPLETED;
          payment.razorpayPaymentId = verificationResult.paymentId;
          payment.transactionId = verificationResult.paymentId;
          payment.paidAt = new Date();
          await payment.save();

          order.paymentStatus = PAYMENT_STATUS.COMPLETED;
          order.paidVia = 'razorpay';
          await order.save();

          await creditScrapperForOrderPayment(order, payment, verificationResult.paymentId);
        }
      }
    } catch (error) {
      logger.error('[Payment] Status check error:', { error: error.message });
    }
  }

  sendSuccess(res, 'Payment status retrieved', { status: payment.status, payment });
});

// @desc    Create subscription payment order (scrapper)
// @route   POST /api/payments/subscription/create
// @access  Private (Scrapper)
// NOTE: price and duration now come EXCLUSIVELY from the server-side plan.
export const createSubscriptionPaymentOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const planId = req.body.planId ? assertObjectId(req.body.planId, 'planId') : null;
  const planName = asString(req.body.planName, 100);

  let plan = null;
  if (planId) {
    plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
  } else if (planName) {
    plan = await SubscriptionPlan.findOne({ name: planName, isActive: true });
  }
  if (!plan) {
    return sendError(res, 'A valid subscription plan is required. Client-defined amounts are not accepted.', 400);
  }

  const amount = roundMoney(plan.price);
  const durationDays = plan.getDurationInDays();

  if (amount <= 0) {
    return sendError(res, 'This plan does not require payment. Use /subscriptions/subscribe.', 400);
  }

  let razorpay;
  try {
    razorpay = getRazorpayClient();
  } catch (razorpayError) {
    logger.error('[Payment] Razorpay client initialization error:', { error: razorpayError.message });
    return sendError(res, 'Payment gateway not configured. Please contact support.', 500);
  }

  const receiptId = `subscription_${userId}_${Date.now()}`.slice(0, 40);

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: receiptId,
      payment_capture: 1,
      notes: {
        entityType: 'subscription',
        userId,
        planId: plan._id.toString(),
        planName: plan.name,
        durationDays
      }
    });
  } catch (err) {
    logger.error('[Payment] Razorpay subscription order creation error:', { error: err.message });
    return sendError(res, 'Failed to create payment order. Please try again later.', 502);
  }

  const payment = await Payment.create({
    order: null,
    entityType: 'subscription',
    entityId: userId,
    user: userId,
    amount,
    currency: 'INR',
    razorpayOrderId: razorpayOrder.id,
    receipt: receiptId,
    status: PAYMENT_STATUS.PENDING,
    planName: plan.name,
    planId: plan._id,
    durationDays
  });

  sendSuccess(res, 'Subscription payment order created', {
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency || 'INR',
    keyId: process.env.RAZORPAY_KEY_ID,
    paymentId: payment._id
  });
});

// @desc    Verify subscription payment
// @route   POST /api/payments/subscription/verify
// @access  Private (Scrapper)
export const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const razorpayOrderId = asString(req.body.razorpay_order_id, 64);
  const razorpayPaymentId = asString(req.body.razorpay_payment_id, 64);
  const razorpaySignature = asString(req.body.razorpay_signature, 200);
  const userId = req.user.id;

  const payment = await Payment.findOne({
    razorpayOrderId,
    user: userId,
    entityType: 'subscription'
  });
  if (!payment) {
    return sendError(res, 'Subscription payment record not found', 404);
  }
  if (payment.status === PAYMENT_STATUS.COMPLETED) {
    return sendSuccess(res, 'Payment already verified', { payment });
  }

  if (!razorpaySignature || !verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return sendError(res, 'Invalid payment signature', 400);
  }

  let verificationResult;
  try {
    verificationResult = await verifyPaymentAPI(razorpayOrderId);
  } catch (error) {
    logger.error('[Payment] Subscription verification error:', { error: error.message });
    return sendError(res, 'Failed to verify payment. Please try again.', 502);
  }
  if (!verificationResult.success || !verificationResult.payment) {
    return sendError(res, 'Payment not completed. Please complete the payment.', 400);
  }
  const expectedPaise = Math.round(payment.amount * 100);
  if (Math.abs((verificationResult.payment.amount || 0) - expectedPaise) > PAISE_TOLERANCE) {
    return sendError(res, 'Payment amount mismatch. Please contact support.', 409);
  }

  payment.status = PAYMENT_STATUS.COMPLETED;
  payment.razorpayPaymentId = verificationResult.paymentId;
  payment.transactionId = verificationResult.paymentId;
  payment.paidAt = new Date();
  payment.razorpaySignature = razorpaySignature;
  await payment.save();

  try {
    await activateSubscriptionForPayment(payment);
  } catch (subError) {
    logger.error('[Payment] Error activating subscription:', { error: subError.message });
    return sendError(res, 'Payment received but subscription activation failed. Please contact support.', 500);
  }

  sendSuccess(res, 'Subscription payment verified successfully', { payment });
});

// @desc    Handle Razorpay webhooks
// @route   POST /api/v1/payments/webhook
// @access  Public (secured via signature)
export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('[Payment] Webhook secret not configured');
    return res.status(500).json({ success: false, message: 'Webhook not configured' });
  }

  const signature = req.headers['x-razorpay-signature'];
  if (!signature || !req.rawBody) {
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(req.rawBody)
    .digest('hex');
  const sigBuf = Buffer.from(String(signature));
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    logger.warn('[Payment] Invalid webhook signature');
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  const event = req.body?.event;
  const paymentEntity = req.body?.payload?.payment?.entity || null;
  if (!paymentEntity) {
    return res.status(200).json({ success: true });
  }

  const paymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;
  const capturedPaise = paymentEntity.amount || 0;

  const payment = await Payment.findOne({ razorpayOrderId })
    || await Payment.findOne({ razorpayPaymentId: paymentId });

  if (!payment) {
    // We only act on payments we initiated (prevents forged-note injection).
    logger.warn('[Payment] Webhook for unknown payment record', { paymentId, razorpayOrderId, event });
    return res.status(200).json({ success: true });
  }

  if (event === 'payment.captured' || event === 'order.paid') {
    // Idempotent: completed payments are not re-processed.
    if (payment.status === PAYMENT_STATUS.COMPLETED) {
      return res.status(200).json({ success: true });
    }
    const expectedPaise = Math.round(payment.amount * 100);
    if (Math.abs(capturedPaise - expectedPaise) > PAISE_TOLERANCE) {
      logger.error('[Payment] Webhook amount mismatch', {
        paymentRecord: payment._id.toString(),
        expectedPaise,
        capturedPaise
      });
      return res.status(200).json({ success: true });
    }

    payment.status = PAYMENT_STATUS.COMPLETED;
    payment.paidAt = new Date();
    payment.razorpayPaymentId = paymentId || payment.razorpayPaymentId;
    await payment.save();

    if (payment.entityType === 'order' && payment.order) {
      const order = await Order.findById(payment.order);
      if (order) {
        order.paymentStatus = PAYMENT_STATUS.COMPLETED;
        order.paidVia = 'razorpay';
        await order.save();
        try {
          await creditScrapperForOrderPayment(order, payment, paymentId);
        } catch (err) {
          logger.error('[Payment] Webhook scrapper credit failed', { error: err.message });
        }
      }
    } else if (payment.entityType === 'subscription') {
      try {
        await activateSubscriptionForPayment(payment);
      } catch (err) {
        logger.error('[Payment] Webhook subscription activation failed', { error: err.message });
      }
    }
  } else if (event === 'payment.failed') {
    if (payment.status !== PAYMENT_STATUS.COMPLETED) {
      payment.status = PAYMENT_STATUS.FAILED;
      payment.razorpayPaymentId = paymentId || payment.razorpayPaymentId;
      await payment.save();
      if (payment.entityType === 'order' && payment.order) {
        await Order.updateOne(
          { _id: payment.order, paymentStatus: { $ne: PAYMENT_STATUS.COMPLETED } },
          { $set: { paymentStatus: PAYMENT_STATUS.FAILED } }
        );
      }
    }
  }

  logger.info('[Payment] Webhook processed', { event, paymentId, razorpayOrderId });
  return res.status(200).json({ success: true });
});
