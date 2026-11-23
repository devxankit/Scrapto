import Scrapper from '../models/Scrapper.js';
import SystemSetting from '../models/SystemSetting.js';
import { creditWallet, debitWallet } from './walletService.js';
import { AppError, roundMoney } from '../utils/security.js';
import logger from '../utils/logger.js';
import { cleaningPlatformFee } from '../config/constants.js';

/**
 * Completion-time financial settlement. Runs inside the caller's transaction.
 * Idempotent: guarded by order.settlementDone AND per-order idempotency keys,
 * so a retried completion can never double-debit or double-charge commission.
 */
export const getCommissionRate = async () => {
  const setting = await SystemSetting.findOne({ key: 'scrap_commission_percentage' }).lean();
  const pct = Number(setting?.value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 0.01;
  return pct / 100;
};

export const settleOrderOnCompletion = async (order, session) => {
  if (order.settlementDone) return { skipped: true };

  const amount = roundMoney(order.totalAmount || 0);

  if (order.orderType === 'cleaning_service') {
    // User pays a 1% platform fee.
    if (amount > 0) {
      const commission = roundMoney(cleaningPlatformFee(amount));
      await debitWallet({
        ownerId: order.user,
        ownerType: 'User',
        amount: commission,
        category: 'COMMISSION',
        description: `Platform Fee (1%) for Cleaning Request #${order._id}`,
        orderId: order._id,
        gateway: { provider: 'SYSTEM' },
        idempotencyKey: `settle-comm:${order._id}`,
        session
      });
    }
    order.settlementDone = true;
    return { commissionCharged: true };
  }

  // Scrap sell: scrapper owes the user the order amount, platform charges commission.
  if (!order.scrapper) {
    order.settlementDone = true;
    return { skipped: true };
  }

  const scrapper = await Scrapper.findById(order.scrapper)
    .populate('subscription.planId')
    .session(session);
  if (!scrapper) throw new AppError('Assigned scrapper not found', 404);

  // 1. If the user has not been paid yet (no wallet transfer, no cash marker),
  //    settle scrapper -> user through the wallet now. BOTH sides move, atomically.
  if (amount > 0 && order.paymentStatus !== 'completed') {
    const debit = await debitWallet({
      ownerId: scrapper._id,
      ownerType: 'Scrapper',
      amount,
      category: 'PAYMENT_SENT',
      description: `Payment to User for Order #${order._id}`,
      orderId: order._id,
      idempotencyKey: `order-pay-debit:${order._id}`,
      session
    });
    if (!debit.duplicate) {
      await creditWallet({
        ownerId: order.user,
        ownerType: 'User',
        amount,
        category: 'PAYMENT_RECEIVED',
        description: `Payment received for Order #${order._id}`,
        orderId: order._id,
        idempotencyKey: `order-pay-credit:${order._id}`,
        session,
        allowFrozen: true
      });
    }
    order.paymentStatus = 'completed';
    order.paidVia = order.paidVia || 'wallet';
  }

  // 2. Platform commission (configurable, default 1%).
  if (amount > 0) {
    const rate = await getCommissionRate();
    const commission = Math.max(1, roundMoney(amount * rate));
    await debitWallet({
      ownerId: scrapper._id,
      ownerType: 'Scrapper',
      amount: commission,
      category: 'COMMISSION',
      description: `Platform Fee (${roundMoney(rate * 100)}%) for Order #${order._id}`,
      orderId: order._id,
      gateway: { provider: 'SYSTEM' },
      idempotencyKey: `settle-comm:${order._id}`,
      session
    });
  }

  // 3. Subscription usage accounting.
  if (scrapper.subscription && scrapper.subscription.status === 'active') {
    scrapper.subscription.usedPickups = (scrapper.subscription.usedPickups || 0) + 1;
    const maxPickups = scrapper.subscription.planId?.maxPickups;
    if (maxPickups !== null && maxPickups !== undefined && scrapper.subscription.usedPickups >= maxPickups) {
      scrapper.subscription.status = 'expired';
      logger.info(`[subscription] Pickup limit reached for scrapper ${scrapper._id}; marked expired`);
    }
  }
  scrapper.totalPickups = (scrapper.totalPickups || 0) + 1;
  await scrapper.save({ session });

  order.settlementDone = true;
  return { settled: true };
};
