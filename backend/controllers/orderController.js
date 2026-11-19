import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Order from '../models/Order.js';
import Scrapper from '../models/Scrapper.js';
import Price from '../models/Price.js';
import { ORDER_STATUS, PAYMENT_STATUS, SCRAP_CATEGORIES, normalizeCategory } from '../config/constants.js';
import logger from '../utils/logger.js';
import { notifyUser } from '../services/socketService.js';
import { sendNotificationToUser } from '../utils/pushNotificationHelper.js';
import { assertTransition, isTerminal } from '../services/orderStateMachine.js';
import { settleOrderOnCompletion } from '../services/orderSettlementService.js';
import { withTransaction } from '../services/walletService.js';
import {
  AppError,
  parsePagination,
  parseDateParam,
  assertObjectId,
  asString,
  roundMoney,
  pickEnum
} from '../utils/security.js';

const MAX_ITEM_WEIGHT_KG = 100000;
const MAX_RATE_PER_KG = 100000;
const MAX_ITEMS = 50;

/**
 * Server-side item pricing. Rates come from the active Price table when one is
 * configured for the category; a client rate is only accepted (bounded) when no
 * authoritative price exists. Totals are ALWAYS computed server-side.
 */
const buildScrapItems = async (rawItems, regionCode = 'IN-DL') => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError('At least one scrap item is required', 400);
  }
  if (rawItems.length > MAX_ITEMS) {
    throw new AppError(`At most ${MAX_ITEMS} items are allowed`, 400);
  }

  const categories = [...new Set(rawItems.map((i) => normalizeCategory(i?.category)).filter(Boolean))];
  // Strength-2 collation: "Copper" in the admin price list matches "copper".
  // Without it an order silently fell back to the client-supplied rate.
  const priceDocs = await Price.find({
    category: { $in: categories },
    isActive: true,
    effectiveDate: { $lte: new Date() }
  }).collation({ locale: 'en', strength: 2 }).sort({ effectiveDate: -1 }).lean();

  const priceMap = new Map();
  for (const doc of priceDocs) {
    const key = normalizeCategory(doc.category);
    if (!priceMap.has(key)) priceMap.set(key, doc);
  }

  const validCategories = Object.values(SCRAP_CATEGORIES);
  let totalWeight = 0;
  let totalAmount = 0;
  const items = rawItems.map((item, index) => {
    const category = normalizeCategory(item?.category);
    if (!category || !validCategories.includes(category)) {
      throw new AppError(`Item ${index + 1}: invalid category`, 400);
    }
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > MAX_ITEM_WEIGHT_KG) {
      throw new AppError(`Item ${index + 1}: invalid weight`, 400);
    }
    const authoritative = priceMap.get(category);
    let rate;
    if (authoritative && Number(authoritative.pricePerKg) > 0) {
      rate = roundMoney(authoritative.pricePerKg);
    } else {
      rate = Number(item.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > MAX_RATE_PER_KG) {
        throw new AppError(`Item ${index + 1}: invalid rate`, 400);
      }
      rate = roundMoney(rate);
    }
    const total = roundMoney(weight * rate);
    totalWeight += weight;
    totalAmount += total;
    return { category, weight, rate, total };
  });

  return { items, totalWeight: roundMoney(totalWeight), totalAmount: roundMoney(totalAmount) };
};

const buildLocation = (pickupAddress) => {
  const lat = Number(pickupAddress?.coordinates?.lat);
  const lng = Number(pickupAddress?.coordinates?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
    return { type: 'Point', coordinates: [lng, lat] };
  }
  return undefined;
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private (User)
export const createOrder = asyncHandler(async (req, res) => {
  const { scrapItems, pickupAddress, preferredTime, pickupSlot, images, notes, orderType } = req.body;
  const userId = req.user.id;

  if (orderType === 'cleaning_service') {
    return sendError(res, 'Cleaning Services are currently unavailable', 400);
  }

  const { items, totalWeight, totalAmount } = await buildScrapItems(scrapItems);

  const orderPayload = {
    user: userId,
    scrapItems: items,
    totalWeight,
    totalAmount,
    pickupAddress,
    preferredTime: asString(preferredTime, 100),
    pickupSlot,
    images: Array.isArray(images) ? images.slice(0, 10) : [],
    notes: asString(notes, 500) || '',
    assignmentStatus: 'unassigned',
    status: ORDER_STATUS.PENDING
  };

  const location = buildLocation(pickupAddress);
  if (location) orderPayload.location = location;

  const order = await Order.create(orderPayload);
  await order.populate('user', 'name phone email');

  logger.info(`Order created: ${order._id} by user: ${userId}`);

  // --- NOTIFY ONLINE, ACTIVE, KYC-VERIFIED SCRAPPERS NEARBY ---
  try {
    const scrapperQuery = {
      isOnline: true,
      status: 'active',
      'kyc.status': 'verified'
    };
    if (order.location?.coordinates?.[0] || order.location?.coordinates?.[1]) {
      const [oLng, oLat] = order.location.coordinates;
      scrapperQuery.liveLocation = {
        $geoWithin: {
          $centerSphere: [[oLng, oLat], 25 / 6378.1]
        }
      };
    }

    const onlineScrappers = await Scrapper.find(scrapperQuery).select('_id').limit(100);

    if (onlineScrappers.length > 0) {
      const notificationPayload = {
        title: 'New Order Request 🔔',
        body: 'A new pickup request is available near you!',
        data: { orderId: order._id.toString(), type: 'new_order' }
      };
      const scrapperIds = onlineScrappers.map((s) => s._id.toString());
      scrapperIds.forEach((id) => {
        notifyUser(id, 'new_order_request', {
          orderId: order._id,
          pickupAddress: order.pickupAddress,
          orderType: order.orderType || 'scrap_pickup',
          totalAmount: order.totalAmount,
          message: 'New pickup request available!'
        });
      });
      const { sendNotificationToMultipleUsers } = await import('../utils/pushNotificationHelper.js');
      sendNotificationToMultipleUsers(scrapperIds, notificationPayload);
      logger.info(`Notified ${onlineScrappers.length} online scrappers for Order ${order._id}`);
    }
  } catch (notifyError) {
    logger.error('Error notifying scrappers:', { error: notifyError.message });
  }

  sendNotificationToUser(userId, {
    title: 'Order Created 📦',
    body: `Your pickup request #${order._id.toString().slice(-6)} has been created successfully.`,
    data: { orderId: order._id.toString(), type: 'order_created' }
  });

  sendSuccess(res, 'Order created successfully', { order }, 201);
});

// @desc    Get user's orders
// @route   GET /api/orders/my-orders
// @access  Private (User)
export const getMyOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = parsePagination(req.query);
  const status = pickEnum(req.query.status, Object.values(ORDER_STATUS));

  const query = { user: userId };
  if (status) query.status = status;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('scrapper', 'name phone vehicleInfo rating profilePic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(query)
  ]);

  sendSuccess(res, 'Orders retrieved successfully', {
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Get available orders for scrappers
// @route   GET /api/orders/available
// @access  Private (Scrapper)
export const getAvailableOrders = asyncHandler(async (req, res) => {
  const scrapperId = req.user.id;

  const scrapper = req.scrapper || await Scrapper.findById(scrapperId);
  if (!scrapper) {
    return sendError(res, 'Scrapper profile not found', 404);
  }

  const services = scrapper.services?.length ? scrapper.services : ['scrap_pickup'];

  const query = {
    status: ORDER_STATUS.PENDING,
    assignmentStatus: 'unassigned'
  };

  const allowedOrderTypes = [];
  if (services.includes('scrap_pickup')) {
    allowedOrderTypes.push(null, 'scrap_pickup', 'scrap', 'scrap_sell');
  }
  if (services.includes('home_cleaning')) {
    allowedOrderTypes.push('cleaning_service');
  }
  query.orderType = { $in: allowedOrderTypes };

  // Strict 25km radius from the scrapper's live GPS position.
  const [lng, lat] = scrapper.liveLocation?.coordinates || [0, 0];
  if (!lng && !lat) {
    return sendSuccess(res, 'Available orders retrieved successfully', { orders: [] });
  }
  query.location = {
    $geoWithin: {
      $centerSphere: [[lng, lat], 25 / 6378.1]
    }
  };
  query.skippedBy = { $ne: scrapper._id };

  const orders = await Order.find(query).populate('user', 'name phone').limit(20);

  // Attach distanceKm for each order
  const ordersWithDistance = orders.map(ord => {
    const o = ord.toObject();
    const destCoords = o.pickupAddress?.coordinates;
    if (destCoords && Number.isFinite(destCoords.lat) && Number.isFinite(destCoords.lng) && lat && lng) {
      const R = 6371; // Earth radius in km
      const dLat = (destCoords.lat - lat) * (Math.PI / 180);
      const dLng = (destCoords.lng - lng) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat * (Math.PI / 180)) * Math.cos(destCoords.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      o.distanceKm = Number((R * c).toFixed(1));
    } else {
      o.distanceKm = 1.0;
    }
    return o;
  });

  sendSuccess(res, 'Available orders retrieved successfully', { orders: ordersWithDistance });
});

// @desc    Skip order (Scrapper) — hides request from scrapper's radar
// @route   POST /api/orders/:id/skip
// @access  Private (Scrapper)
export const skipOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const scrapperId = req.user.id;

  const order = await Order.findById(id);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }

  if (!order.skippedBy) order.skippedBy = [];
  if (!order.skippedBy.some(s => s.toString() === scrapperId)) {
    order.skippedBy.push(scrapperId);
    await order.save();
  }

  sendSuccess(res, 'Order skipped successfully', { orderId: id });
});

// @desc    Get scrapper's assigned orders
// @route   GET /api/orders/my-assigned
// @access  Private (Scrapper)
export const getMyAssignedOrders = asyncHandler(async (req, res) => {
  const scrapperId = req.user.id;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });

  const query = { scrapper: scrapperId };
  if (req.query.status) {
    const rawStatuses = String(req.query.status).split(',').map(s => s.trim().toLowerCase());
    const validStatuses = rawStatuses.filter(s => Object.values(ORDER_STATUS).includes(s));
    if (validStatuses.length === 1) {
      query.status = validStatuses[0];
    } else if (validStatuses.length > 1) {
      query.status = { $in: validStatuses };
    }
  }

  const orders = await Order.find(query)
    .populate('user', 'name phone email')
    .populate('scrapper', 'name phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  sendSuccess(res, 'Assigned orders retrieved successfully', { orders });
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private (owner user, assigned scrapper, admin)
export const getOrderById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const userId = req.user.id;
  const userRole = req.user.role;

  const order = await Order.findById(id)
    .populate('user', 'name phone email')
    .populate('scrapper', 'name phone liveLocation vehicleInfo rating profilePic');

  if (!order) {
    return sendError(res, 'Order not found', 404);
  }

  if (userRole === 'user' && order.user._id.toString() !== userId) {
    return sendError(res, 'Not authorized to access this order', 403);
  }
  if (userRole === 'scrapper') {
    const isAssigned = order.scrapper && order.scrapper._id.toString() === userId;
    const isOpen = order.status === ORDER_STATUS.PENDING && order.assignmentStatus === 'unassigned';
    if (!isAssigned && !isOpen) {
      return sendError(res, 'Not authorized to access this order', 403);
    }
  }

  sendSuccess(res, 'Order retrieved successfully', { order });
});

// @desc    Accept order (Scrapper) — atomic first-wins assignment
// @route   POST /api/orders/:id/accept
// @access  Private (Scrapper, active + KYC-verified)
export const acceptOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const scrapperId = req.user.id;

  // Eligibility checks (profile status/KYC handled by middleware).
  const scrapper = await Scrapper.findById(scrapperId).populate('subscription.planId');
  if (!scrapper) {
    return sendError(res, 'Scrapper profile not found', 404);
  }
  if (scrapper.status !== 'active') {
    return sendError(res, 'Your account is blocked or suspended.', 403);
  }
  if (scrapper.kyc?.status !== 'verified') {
    return sendError(res, 'KYC verification required before accepting orders.', 403);
  }
  if ((scrapper.wallet?.balance || 0) < 100) {
    return sendError(res, 'Insufficient wallet balance. You need minimum ₹100 to accept orders. Please recharge your wallet.', 403);
  }
  if (!scrapper.hasActiveSubscription()) {
    return sendError(res, 'Active subscription required to accept orders. Please subscribe first.', 403);
  }
  const maxPickups = scrapper.subscription.planId?.maxPickups;
  if (maxPickups !== null && maxPickups !== undefined) {
    const used = scrapper.subscription.usedPickups || 0;
    if (used >= maxPickups) {
      return sendError(res, `Your current plan limit (${maxPickups} pickups) has been reached. Please upgrade your subscription to continue accepting orders.`, 403);
    }
  }

  // ATOMIC assignment: only succeeds when the order is still pending AND
  // unassigned. Two concurrent scrappers can never both win.
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    {
      _id: id,
      status: ORDER_STATUS.PENDING,
      assignmentStatus: 'unassigned',
      scrapper: null
    },
    {
      $set: {
        scrapper: scrapperId,
        assignmentStatus: 'accepted',
        status: ORDER_STATUS.CONFIRMED,
        assignedAt: now,
        acceptedAt: now
      },
      $push: {
        assignmentHistory: { scrapper: scrapperId, assignedAt: now, status: 'accepted' }
      }
    },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findById(id).select('status scrapper');
    if (!existing) return sendError(res, 'Order not found', 404);
    if (existing.scrapper && existing.scrapper.toString() === scrapperId) {
      const populated = await Order.findById(id).populate('user', 'name phone').populate('scrapper', 'name phone');
      return sendSuccess(res, 'Order already accepted', { order: populated });
    }
    if (existing.status !== ORDER_STATUS.PENDING) {
      return sendError(res, `Order is not available for acceptance (Status: ${existing.status})`, 409);
    }
    return sendError(res, 'Order is already accepted by another scrapper', 409);
  }

  await order.populate('user', 'name phone');
  await order.populate('scrapper', 'name phone');

  logger.info(`Order ${id} accepted by scrapper ${scrapperId}`);

  sendNotificationToUser(order.user._id.toString(), {
    title: 'Order Accepted 🤝',
    body: `Scrapper ${scrapper.name} has accepted your order.`,
    data: { orderId: order._id.toString(), type: 'order_accepted' }
  });
  notifyUser(order.user._id.toString(), 'order_accepted', {
    orderId: order._id,
    scrapper: { name: scrapper.name, phone: scrapper.phone }
  });

  sendSuccess(res, 'Order accepted successfully', { order });
});

// @desc    Update order status (state-machine enforced)
// @route   PUT /api/orders/:id/status
// @access  Private (assigned scrapper, admin)
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const reqStatus = pickEnum(req.body.status, Object.values(ORDER_STATUS));
  const paymentStatus = pickEnum(req.body.paymentStatus, Object.values(PAYMENT_STATUS));
  const scrapItems = Array.isArray(req.body.scrapItems) ? req.body.scrapItems : null;
  const paidAmount = req.body.paidAmount !== undefined && req.body.paidAmount !== null ? Number(req.body.paidAmount) : null;
  const totalAmount = req.body.totalAmount !== undefined && req.body.totalAmount !== null ? Number(req.body.totalAmount) : null;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (!reqStatus && !scrapItems && !paymentStatus && paidAmount === null && totalAmount === null) {
    return sendError(res, 'Invalid order update: status, scrapItems, or paymentStatus required', 400);
  }

  try {
    const result = await withTransaction(async (session) => {
      const order = await Order.findById(id).session(session);
      if (!order) throw new AppError('Order not found', 404);

      // Authorization: only the assigned scrapper or an admin may drive status.
      if (userRole === 'scrapper') {
        if (!order.scrapper || order.scrapper.toString() !== userId) {
          throw new AppError('Not authorized to update this order', 403);
        }
      } else if (userRole === 'user') {
        // Users cancel through /cancel; direct status writes are not allowed.
        throw new AppError('Not authorized to update order status', 403);
      }

      const initialStatus = order.status;
      if (isTerminal(initialStatus)) {
        if (reqStatus && reqStatus !== initialStatus) {
          throw new AppError(`Cannot transition a finalised order from '${initialStatus}' to '${reqStatus}'`, 409);
        }
        if (scrapItems && scrapItems.length > 0) {
          throw new AppError('Cannot update scrap items of a finalised order', 409);
        }
        if (totalAmount !== null) {
          throw new AppError('Cannot change amount of a finalised order', 409);
        }
        // Idempotent repeat: return the existing order
        sendSuccess(res, 'Order status updated successfully', { order });
        return;
      }

      // Scrap items weighing update (e.g. from partner app weighing screen)
      if (scrapItems && scrapItems.length > 0) {
        // Map any items missing rate to rate from existing order item or active price
        const existingRates = new Map();
        (order.scrapItems || []).forEach(i => {
          existingRates.set(normalizeCategory(i.category), i.rate);
        });

        const preparedItems = scrapItems.map(i => ({
          ...i,
          rate: i.rate !== undefined ? i.rate : existingRates.get(normalizeCategory(i.category))
        }));

        const built = await buildScrapItems(preparedItems, order.pickupAddress?.state || 'IN-DL');
        order.scrapItems = built.items;
        order.totalWeight = built.totalWeight;
        order.totalAmount = built.totalAmount;
        order.weighedAt = new Date();
      } else if (totalAmount !== null) {
        if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 500000) {
          throw new AppError('Invalid totalAmount', 400);
        }
        order.totalAmount = roundMoney(totalAmount);
      }

      // Paid amount update (e.g. cash or direct settlement)
      if (paidAmount !== null && Number.isFinite(paidAmount) && paidAmount >= 0) {
        order.paidAmount = roundMoney(paidAmount);
      }

      // Payment marker (cash collection flow or completed payment).
      if (paymentStatus) {
        if (order.paymentStatus === PAYMENT_STATUS.COMPLETED && paymentStatus !== PAYMENT_STATUS.COMPLETED) {
          throw new AppError('Cannot revert a completed payment', 409);
        }
        if (paymentStatus === PAYMENT_STATUS.COMPLETED && order.paymentStatus !== PAYMENT_STATUS.COMPLETED) {
          order.paidVia = order.paidVia || 'cash';
        }
        order.paymentStatus = paymentStatus;
      }

      let statusChanged = false;
      const targetStatus = reqStatus || order.status;

      if (reqStatus && order.status !== reqStatus) {
        assertTransition(order, targetStatus, userRole);
        order.status = targetStatus;
        statusChanged = true;

        if (targetStatus === ORDER_STATUS.COMPLETED) {
          order.completedDate = new Date();
          await settleOrderOnCompletion(order, session);
        }
        if (targetStatus === ORDER_STATUS.CANCELLED) {
          order.cancelledAt = new Date();
          order.cancelledBy = userRole;
        }
      }

      await order.save({ session });
      return { order, idempotent: !statusChanged && !scrapItems && !paymentStatus && paidAmount === null && totalAmount === null };
    });

    const order = result.order;
    await order.populate('user', 'name phone');
    await order.populate('scrapper', 'name phone');

    const status = order.status;
    logger.info(`Order ${id} updated -> status: ${status} by ${userRole} ${userId}`);

    const shortId = order._id.toString().slice(-6);
    if (!result.idempotent) {
      if (status === ORDER_STATUS.IN_PROGRESS) {
        sendNotificationToUser(order.user._id.toString(), {
          title: 'Scrapper is on the way! 🚚',
          body: `Your pickup #${shortId} is now in progress.`,
          data: { orderId: order._id.toString(), type: 'order_status' }
        });
      } else if (status === ORDER_STATUS.COMPLETED) {
        sendNotificationToUser(order.user._id.toString(), {
          title: 'Order Completed ✅',
          body: `Your order #${shortId} has been completed. Thank you!`,
          data: { orderId: order._id.toString(), type: 'order_completed' }
        });
        if (order.scrapper) {
          sendNotificationToUser(order.scrapper._id.toString(), {
            title: 'Order Completed ✅',
            body: `Pickup #${shortId} completed successfully.`,
            data: { orderId: order._id.toString(), type: 'order_completed' }
          });
        }
      }
    }

    sendSuccess(res, 'Order status updated successfully', { order });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    throw error;
  }
});

// @desc    Cancel order
// @route   POST /api/orders/:id/cancel
// @access  Private (owner user, assigned scrapper, admin)
export const cancelOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const reason = asString(req.body.reason, 200);
  const userId = req.user.id;
  const userRole = req.user.role;

  const order = await Order.findById(id);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }

  if (userRole === 'user' && order.user.toString() !== userId) {
    return sendError(res, 'Not authorized to cancel this order', 403);
  }
  if (userRole === 'scrapper' && (!order.scrapper || order.scrapper.toString() !== userId)) {
    return sendError(res, 'Not authorized to cancel this order', 403);
  }

  if (order.status === ORDER_STATUS.COMPLETED) {
    return sendError(res, 'Cannot cancel completed order', 400);
  }
  if (order.status === ORDER_STATUS.CANCELLED) {
    return sendError(res, 'Order is already cancelled', 400);
  }
  if (order.paymentStatus === PAYMENT_STATUS.COMPLETED) {
    return sendError(res, 'Order has a completed payment. Please contact support for cancellation and refund.', 409);
  }

  const previousScrapper = order.scrapper ? order.scrapper.toString() : null;

  if (userRole === 'scrapper') {
    // Scrapper cancellation releases the order back to the pool.
    order.status = ORDER_STATUS.PENDING;
    order.assignmentStatus = 'unassigned';
    order.scrapper = null;
    order.assignedAt = null;
    order.acceptedAt = null;
    order.assignmentHistory.push({ scrapper: userId, assignedAt: new Date(), status: 'rejected' });
  } else {
    order.status = ORDER_STATUS.CANCELLED;
    order.assignmentStatus = 'unassigned';
    order.scrapper = null;
    order.cancelledAt = new Date();
    order.cancelledBy = userRole;
  }
  if (reason) {
    order.cancellationReason = reason;
  }

  await order.save();

  logger.info(`Order ${id} ${userRole === 'scrapper' ? 'released' : 'cancelled'} by ${userRole} ${userId}`);

  const shortId = order._id.toString().slice(-6);
  if (userRole === 'user' && previousScrapper) {
    sendNotificationToUser(previousScrapper, {
      title: 'Order Cancelled ⚠️',
      body: `Order #${shortId} has been cancelled by the customer.`,
      data: { orderId: order._id.toString(), type: 'order_cancelled' }
    });
  } else if (userRole === 'scrapper') {
    sendNotificationToUser(order.user.toString(), {
      title: 'Order Cancelled ⚠️',
      body: `The scrapper has cancelled your pickup #${shortId}. It is now available for other scrappers.`,
      data: { orderId: order._id.toString(), type: 'order_cancelled' }
    });
  }

  sendSuccess(res, 'Order cancelled successfully', { order });
});

// @desc    Update order (User can update pending orders)
// @route   PUT /api/orders/:id
// @access  Private (User)
export const updateOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, 'order id');
  const userId = req.user.id;
  const { scrapItems, pickupAddress, preferredTime, pickupSlot, images, notes } = req.body;

  const order = await Order.findById(id);
  if (!order) {
    return sendError(res, 'Order not found', 404);
  }
  if (order.user.toString() !== userId) {
    return sendError(res, 'Not authorized to update this order', 403);
  }
  if (order.status !== ORDER_STATUS.PENDING) {
    return sendError(res, 'Can only update pending orders', 400);
  }

  if (scrapItems) {
    const { items, totalWeight, totalAmount } = await buildScrapItems(scrapItems);
    order.scrapItems = items;
    order.totalWeight = totalWeight;
    order.totalAmount = totalAmount;
  }

  if (pickupAddress) {
    order.pickupAddress = pickupAddress;
    const location = buildLocation(pickupAddress);
    if (location) order.location = location;
  }
  if (preferredTime) order.preferredTime = asString(preferredTime, 100);
  if (pickupSlot) order.pickupSlot = pickupSlot;
  if (Array.isArray(images)) order.images = images.slice(0, 10);
  if (notes !== undefined) order.notes = asString(notes, 500) || '';

  await order.save();
  await order.populate('user', 'name phone');

  logger.info(`Order ${id} updated by user ${userId}`);

  sendSuccess(res, 'Order updated successfully', { order });
});
