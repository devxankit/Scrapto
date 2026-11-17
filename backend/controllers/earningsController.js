import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../utils/responseHandler.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import Scrapper from '../models/Scrapper.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { ORDER_STATUS } from '../config/constants.js';
import { parsePagination, parseDateParam, assertObjectId, roundMoney } from '../utils/security.js';

/**
 * Earnings semantics (both order types are now counted correctly):
 *
 *   cleaning_service : the scrapper RECEIVES the order amount  -> income (+)
 *   scrap pickup     : the scrapper PAYS the user for the scrap -> outflow (-)
 *
 * `gross`   = money received for services
 * `payouts` = money paid out to users for scrap
 * `commission` = platform fees charged (from the wallet ledger)
 * `net`     = gross - payouts - commission
 *
 * Every bucket is computed in a single aggregation per scope instead of
 * loading all completed orders into memory.
 */
const CLEANING = 'cleaning_service';

const buildEarningsAggregation = (scrapperId, fromDate) => {
  const match = {
    scrapper: scrapperId,
    status: ORDER_STATUS.COMPLETED
  };
  if (fromDate) {
    match.$or = [{ completedDate: { $gte: fromDate } }, { completedDate: null, createdAt: { $gte: fromDate } }];
  }
  return [
    { $match: match },
    {
      $group: {
        _id: null,
        gross: {
          $sum: { $cond: [{ $eq: ['$orderType', CLEANING] }, { $ifNull: ['$totalAmount', 0] }, 0] }
        },
        payouts: {
          $sum: { $cond: [{ $eq: ['$orderType', CLEANING] }, 0, { $ifNull: ['$totalAmount', 0] }] }
        },
        orders: { $sum: 1 }
      }
    }
  ];
};

const sumCommission = async (scrapperId, fromDate) => {
  const match = {
    user: scrapperId,
    userType: 'Scrapper',
    category: 'COMMISSION',
    type: 'DEBIT',
    status: 'SUCCESS'
  };
  if (fromDate) match.createdAt = { $gte: fromDate };
  const [row] = await WalletTransaction.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return row?.total || 0;
};

const computeBuckets = async (scrapperObjectId) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allTime, today, week, month, commTotal, commToday, commWeek, commMonth] = await Promise.all([
    Order.aggregate(buildEarningsAggregation(scrapperObjectId, null)),
    Order.aggregate(buildEarningsAggregation(scrapperObjectId, todayStart)),
    Order.aggregate(buildEarningsAggregation(scrapperObjectId, weekAgo)),
    Order.aggregate(buildEarningsAggregation(scrapperObjectId, monthStart)),
    sumCommission(scrapperObjectId, null),
    sumCommission(scrapperObjectId, todayStart),
    sumCommission(scrapperObjectId, weekAgo),
    sumCommission(scrapperObjectId, monthStart)
  ]);

  const shape = (rows, commission) => {
    const row = rows[0] || { gross: 0, payouts: 0, orders: 0 };
    return {
      gross: roundMoney(row.gross),
      payouts: roundMoney(row.payouts),
      commission: roundMoney(commission),
      net: roundMoney(row.gross - row.payouts - commission),
      orders: row.orders
    };
  };

  return {
    allTime: shape(allTime, commTotal),
    today: shape(today, commToday),
    week: shape(week, commWeek),
    month: shape(month, commMonth)
  };
};

// @desc    Get scrapper earnings summary
// @route   GET /api/scrapper/earnings/summary
// @access  Private (Scrapper)
export const getEarningsSummary = asyncHandler(async (req, res) => {
  const scrapperId = req.user.id;
  const scrapper = await Scrapper.findById(scrapperId).select('_id rating wallet.balance');
  if (!scrapper) {
    return sendError(res, 'Scrapper profile not found', 404);
  }

  const buckets = await computeBuckets(scrapper._id);

  // Rating: prefer the maintained aggregate, fall back to computing it.
  let avgRating = scrapper.rating?.average || 0;
  if (!avgRating) {
    const [ratingRow] = await Review.aggregate([
      { $match: { scrapper: scrapper._id, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    avgRating = ratingRow?.avg ? Number(ratingRow.avg.toFixed(1)) : 0;
  }

  const summary = {
    // Backward-compatible fields consumed by the existing scrapper UI
    today: buckets.today.net,
    week: buckets.week.net,
    month: buckets.month.net,
    total: buckets.allTime.net,
    completedOrders: buckets.allTime.orders,
    rating: avgRating || 5.0,
    walletBalance: roundMoney(scrapper.wallet?.balance || 0),
    // Full breakdown
    breakdown: buckets
  };

  sendSuccess(res, 'Earnings summary retrieved successfully', { summary });
});

const mapHistoryRow = (order) => {
  const amount = roundMoney(order.totalAmount || 0);
  const isIncome = order.orderType === CLEANING;
  return {
    id: order._id,
    orderId: order._id,
    userName: order.user?.name || 'User',
    userPhone: order.user?.phone || '',
    scrapType: order.scrapItems?.map((item) => item.category).join(', ') || 'Scrap',
    weight: order.totalWeight,
    amount: isIncome ? amount : -amount,
    direction: isIncome ? 'credit' : 'debit',
    location: order.pickupAddress
      ? `${order.pickupAddress.street || ''}, ${order.pickupAddress.city || ''}, ${order.pickupAddress.state || ''} ${order.pickupAddress.pincode || ''}`.trim()
      : 'Address not available',
    completedAt: order.completedDate || order.createdAt,
    createdAt: order.createdAt,
    orderType: order.orderType || 'scrap_pickup'
  };
};

// @desc    Get scrapper earnings history
// @route   GET /api/scrapper/earnings/history
// @access  Private (Scrapper)
export const getEarningsHistory = asyncHandler(async (req, res) => {
  const scrapperId = req.user.id;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const startDate = parseDateParam(req.query.startDate, 'startDate');
  const endDate = parseDateParam(req.query.endDate, 'endDate');

  const query = { scrapper: scrapperId, status: ORDER_STATUS.COMPLETED };
  if (startDate || endDate) {
    query.completedDate = {};
    if (startDate) query.completedDate.$gte = startDate;
    if (endDate) query.completedDate.$lte = endDate;
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('user', 'name phone')
      .select('totalAmount completedDate createdAt scrapItems totalWeight pickupAddress orderType')
      .sort({ completedDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(query)
  ]);

  sendSuccess(res, 'Earnings history retrieved successfully', {
    history: orders.map(mapHistoryRow),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// @desc    Get admin view of scrapper earnings
// @route   GET /api/admin/scrappers/:scrapperId/earnings
// @access  Private (Admin)
export const getScrapperEarningsForAdmin = asyncHandler(async (req, res) => {
  const scrapperId = assertObjectId(req.params.scrapperId, 'scrapperId');
  const startDate = parseDateParam(req.query.startDate, 'startDate');
  const endDate = parseDateParam(req.query.endDate, 'endDate');
  const { limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

  const scrapper = await Scrapper.findById(scrapperId).select('_id name phone wallet.balance rating');
  if (!scrapper) {
    return sendError(res, 'Scrapper not found', 404);
  }

  const query = { scrapper: scrapper._id, status: ORDER_STATUS.COMPLETED };
  if (startDate || endDate) {
    query.completedDate = {};
    if (startDate) query.completedDate.$gte = startDate;
    if (endDate) query.completedDate.$lte = endDate;
  }

  const [orders, totalOrders, buckets] = await Promise.all([
    Order.find(query)
      .populate('user', 'name phone')
      .select('totalAmount completedDate createdAt scrapItems totalWeight pickupAddress orderType')
      .sort({ completedDate: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(query),
    computeBuckets(scrapper._id)
  ]);

  const summary = {
    scrapperId: scrapper._id,
    name: scrapper.name,
    phone: scrapper.phone,
    walletBalance: roundMoney(scrapper.wallet?.balance || 0),
    today: buckets.today.net,
    week: buckets.week.net,
    month: buckets.month.net,
    total: buckets.allTime.net,
    breakdown: buckets,
    totalOrders,
    orders: orders.map(mapHistoryRow)
  };

  sendSuccess(res, 'Scrapper earnings retrieved successfully', { summary });
});
