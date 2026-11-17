import mongoose from 'mongoose';
import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import WalletTransaction from '../models/WalletTransaction.js';
import { AppError, roundMoney, generateTrxId } from '../utils/security.js';
import logger from '../utils/logger.js';

/**
 * Wallet ledger service.
 *
 * Every balance change in the system flows through creditWallet / debitWallet:
 *  - balance updates are ATOMIC conditional updates ($inc guarded by a filter),
 *    so concurrent operations can never double-spend or lose updates;
 *  - a WalletTransaction ledger row is written for every change, and when the
 *    ledger write fails the balance change is compensated (or the whole thing
 *    runs inside the caller's session/transaction);
 *  - `idempotencyKey` makes externally-triggered credits (gateway callbacks,
 *    webhooks, retries) at-most-once: the unique index rejects the duplicate
 *    BEFORE any balance is touched;
 *  - FROZEN wallets reject both credits and debits (admin can unfreeze).
 */

export const modelForRole = (role) => (role === 'scrapper' ? Scrapper : User);
export const userTypeForRole = (role) => (role === 'scrapper' ? 'Scrapper' : 'User');

const assertAmount = (amount) => {
  const value = roundMoney(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError('Invalid amount', 400);
  }
  return value;
};

/**
 * Reserve the idempotency key by inserting a PENDING ledger row first.
 * Returns the row when reserved, or null when the key already exists
 * (operation already performed / in flight).
 */
const reserveIdempotency = async ({ idempotencyKey, session, ...fields }) => {
  try {
    const [row] = await WalletTransaction.create(
      [{ ...fields, idempotencyKey, status: 'PENDING' }],
      session ? { session } : {}
    );
    return row;
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
};

/**
 * Atomically credit a wallet.
 * @returns {Promise<{transaction, balanceAfter, duplicate: boolean}>}
 */
export const creditWallet = async ({
  ownerId,
  ownerType, // 'User' | 'Scrapper'
  amount,
  category,
  description = '',
  orderId = null,
  couponCode = null,
  gateway = { provider: 'SYSTEM' },
  idempotencyKey = null,
  metadata = undefined,
  session = null,
  allowFrozen = false
}) => {
  const value = assertAmount(amount);
  const Model = ownerType === 'Scrapper' ? Scrapper : User;

  // Snapshot for balanceBefore (informational; the update itself is atomic).
  const before = await Model.findById(ownerId).select('wallet').session(session);
  if (!before) throw new AppError(`${ownerType} not found`, 404);
  if (!allowFrozen && before.wallet?.status === 'FROZEN') {
    throw new AppError('Wallet is frozen. Please contact support.', 403, 'WALLET_FROZEN');
  }
  const balanceBefore = roundMoney(before.wallet?.balance || 0);

  let row = null;
  if (idempotencyKey) {
    row = await reserveIdempotency({
      idempotencyKey,
      session,
      trxId: generateTrxId('TRX'),
      user: ownerId,
      userType: ownerType,
      amount: value,
      type: 'CREDIT',
      balanceBefore,
      balanceAfter: balanceBefore, // provisional; fixed below
      category,
      orderId,
      couponCode,
      gateway,
      description,
      metadata
    });
    if (!row) {
      const existing = await WalletTransaction.findOne({ idempotencyKey }).session(session);
      return { transaction: existing, balanceAfter: existing?.balanceAfter, duplicate: true };
    }
  }

  const filter = { _id: ownerId };
  if (!allowFrozen) filter.$or = [{ 'wallet.status': 'ACTIVE' }, { 'wallet.status': { $exists: false } }];

  const updated = await Model.findOneAndUpdate(
    filter,
    { $inc: { 'wallet.balance': value } },
    { new: true, session, select: 'wallet' }
  );
  if (!updated) {
    if (row && !session) await WalletTransaction.deleteOne({ _id: row._id });
    throw new AppError('Wallet is frozen. Please contact support.', 403, 'WALLET_FROZEN');
  }
  const balanceAfter = roundMoney(updated.wallet.balance);

  try {
    if (row) {
      row.balanceBefore = roundMoney(balanceAfter - value);
      row.balanceAfter = balanceAfter;
      row.status = 'SUCCESS';
      await row.save(session ? { session } : {});
    } else {
      [row] = await WalletTransaction.create(
        [{
          trxId: generateTrxId('TRX'),
          user: ownerId,
          userType: ownerType,
          amount: value,
          type: 'CREDIT',
          balanceBefore: roundMoney(balanceAfter - value),
          balanceAfter,
          category,
          orderId,
          couponCode,
          gateway,
          description,
          metadata,
          status: 'SUCCESS'
        }],
        session ? { session } : {}
      );
    }
  } catch (err) {
    if (!session) {
      // Compensate the credit so money and ledger never diverge.
      await Model.updateOne({ _id: ownerId }, { $inc: { 'wallet.balance': -value } });
    }
    throw err;
  }

  return { transaction: row, balanceAfter, duplicate: false };
};

/**
 * Atomically debit a wallet. The conditional update guarantees the balance can
 * never go below zero even under concurrency.
 */
export const debitWallet = async ({
  ownerId,
  ownerType,
  amount,
  category,
  description = '',
  orderId = null,
  gateway = { provider: 'WALLET' },
  idempotencyKey = null,
  metadata = undefined,
  session = null,
  status = 'SUCCESS'
}) => {
  const value = assertAmount(amount);
  const Model = ownerType === 'Scrapper' ? Scrapper : User;

  const before = await Model.findById(ownerId).select('wallet').session(session);
  if (!before) throw new AppError(`${ownerType} not found`, 404);
  if (before.wallet?.status === 'FROZEN') {
    throw new AppError('Wallet is frozen. Please contact support.', 403, 'WALLET_FROZEN');
  }
  const balanceBefore = roundMoney(before.wallet?.balance || 0);

  let row = null;
  if (idempotencyKey) {
    row = await reserveIdempotency({
      idempotencyKey,
      session,
      trxId: generateTrxId('TRX'),
      user: ownerId,
      userType: ownerType,
      amount: value,
      type: 'DEBIT',
      balanceBefore,
      balanceAfter: balanceBefore,
      category,
      orderId,
      gateway,
      description,
      metadata
    });
    if (!row) {
      const existing = await WalletTransaction.findOne({ idempotencyKey }).session(session);
      return { transaction: existing, balanceAfter: existing?.balanceAfter, duplicate: true };
    }
  }

  // Atomic conditional debit: only succeeds when funds are sufficient AND the
  // wallet is not frozen. This is the race-condition kill-switch.
  const updated = await Model.findOneAndUpdate(
    {
      _id: ownerId,
      'wallet.balance': { $gte: value },
      $or: [{ 'wallet.status': 'ACTIVE' }, { 'wallet.status': { $exists: false } }]
    },
    { $inc: { 'wallet.balance': -value } },
    { new: true, session, select: 'wallet' }
  );

  if (!updated) {
    if (row && !session) await WalletTransaction.deleteOne({ _id: row._id });
    const fresh = await Model.findById(ownerId).select('wallet').session(session);
    if (fresh?.wallet?.status === 'FROZEN') {
      throw new AppError('Wallet is frozen. Please contact support.', 403, 'WALLET_FROZEN');
    }
    throw new AppError('Insufficient wallet balance', 400, 'INSUFFICIENT_FUNDS');
  }
  const balanceAfter = roundMoney(updated.wallet.balance);

  try {
    if (row) {
      row.balanceBefore = roundMoney(balanceAfter + value);
      row.balanceAfter = balanceAfter;
      row.status = status;
      await row.save(session ? { session } : {});
    } else {
      [row] = await WalletTransaction.create(
        [{
          trxId: generateTrxId('TRX'),
          user: ownerId,
          userType: ownerType,
          amount: value,
          type: 'DEBIT',
          balanceBefore: roundMoney(balanceAfter + value),
          balanceAfter,
          category,
          orderId,
          gateway,
          description,
          metadata,
          status
        }],
        session ? { session } : {}
      );
    }
  } catch (err) {
    if (!session) {
      await Model.updateOne({ _id: ownerId }, { $inc: { 'wallet.balance': value } });
    }
    throw err;
  }

  return { transaction: row, balanceAfter, duplicate: false };
};

/**
 * Run `fn` inside a MongoDB replica-set transaction.
 *
 * In accordance with financial system safety rules, we NEVER silently fall back
 * to non-transactional writes if the underlying database does not support transactions.
 * If atomicity cannot be guaranteed, the operation fails safely with a documented error.
 */
export const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (err?.code === 20 || /Transaction numbers are only allowed/.test(err?.message || '')) {
      logger.error('[wallet] MongoDB topology does not support transactions. A replica set is strictly required for financial safety.', { error: err.message });
      throw new AppError(
        'Database configuration does not support atomic transactions. A MongoDB replica set is required for financial operations.',
        503,
        'TRANSACTIONS_UNSUPPORTED'
      );
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Ledger-vs-balance reconciliation for one owner: recomputes the expected
 * balance from SUCCESS ledger rows and compares with the stored balance.
 */
export const reconcileWallet = async (ownerId, ownerType) => {
  const Model = ownerType === 'Scrapper' ? Scrapper : User;
  const [owner, sums] = await Promise.all([
    Model.findById(ownerId).select('wallet'),
    WalletTransaction.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(ownerId)), status: { $in: ['SUCCESS', 'PENDING'] } } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ])
  ]);
  if (!owner) throw new AppError(`${ownerType} not found`, 404);
  const credits = sums.find((s) => s._id === 'CREDIT')?.total || 0;
  const debits = sums.find((s) => s._id === 'DEBIT')?.total || 0;
  const expected = roundMoney(credits - debits);
  const actual = roundMoney(owner.wallet?.balance || 0);
  return { expected, actual, consistent: Math.abs(expected - actual) < 0.01 };
};
