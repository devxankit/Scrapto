import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: WalletTransaction } = await import('../models/WalletTransaction.js');
const { default: WithdrawalRequest } = await import('../models/WithdrawalRequest.js');
const { default: Coupon } = await import('../models/CouponModel.js');
const { default: CouponUsage } = await import('../models/CouponUsageModel.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, authHeader } = await import('./helpers.js');
const { creditWallet, debitWallet, reconcileWallet, withTransaction } = await import('../services/walletService.js');

describe('PHASE 2 — financial integrity & wallet system', () => {
  let app;

  before(async () => {
    await startTestDb();
    await syncIndexes();
    app = buildApp();
  });

  after(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  test('creditWallet increases balance and creates SUCCESS ledger entry (FIN-1)', async () => {
    const user = await makeUser({ wallet: { balance: 100, status: 'ACTIVE' } });
    const { transaction, balanceAfter } = await creditWallet({
      ownerId: user._id,
      ownerType: 'User',
      amount: 50.50,
      category: 'RECHARGE',
      description: 'Test credit'
    });

    assert.equal(balanceAfter, 150.50);
    assert.equal(transaction.status, 'SUCCESS');
    assert.equal(transaction.type, 'CREDIT');
    assert.equal(transaction.amount, 50.50);

    const updatedUser = await User.findById(user._id);
    assert.equal(updatedUser.wallet.balance, 150.50);
  });

  test('debitWallet decreases balance and creates SUCCESS ledger entry (FIN-2)', async () => {
    const user = await makeUser({ wallet: { balance: 200, status: 'ACTIVE' } });
    const { transaction, balanceAfter } = await debitWallet({
      ownerId: user._id,
      ownerType: 'User',
      amount: 75.25,
      category: 'PAYMENT_SENT',
      description: 'Test debit'
    });

    assert.equal(balanceAfter, 124.75);
    assert.equal(transaction.status, 'SUCCESS');
    assert.equal(transaction.type, 'DEBIT');
    assert.equal(transaction.amount, 75.25);

    const updatedUser = await User.findById(user._id);
    assert.equal(updatedUser.wallet.balance, 124.75);
  });

  test('debitWallet rejects overdraft and leaves balance untouched (FIN-3)', async () => {
    const user = await makeUser({ wallet: { balance: 50, status: 'ACTIVE' } });

    await assert.rejects(
      async () => {
        await debitWallet({
          ownerId: user._id,
          ownerType: 'User',
          amount: 100,
          category: 'PAYMENT_SENT'
        });
      },
      (err) => err.code === 'INSUFFICIENT_FUNDS'
    );

    const freshUser = await User.findById(user._id);
    assert.equal(freshUser.wallet.balance, 50);
    const count = await WalletTransaction.countDocuments({ user: user._id });
    assert.equal(count, 0);
  });

  test('idempotencyKey prevents double-credit on retried operation (FIN-4)', async () => {
    const user = await makeUser({ wallet: { balance: 100, status: 'ACTIVE' } });
    const idempotencyKey = 'unique-recharge-key-12345';

    const first = await creditWallet({
      ownerId: user._id,
      ownerType: 'User',
      amount: 100,
      category: 'RECHARGE',
      idempotencyKey
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.balanceAfter, 200);

    const second = await creditWallet({
      ownerId: user._id,
      ownerType: 'User',
      amount: 100,
      category: 'RECHARGE',
      idempotencyKey
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.balanceAfter, 200);

    const freshUser = await User.findById(user._id);
    assert.equal(freshUser.wallet.balance, 200);

    const txs = await WalletTransaction.find({ idempotencyKey });
    assert.equal(txs.length, 1);
  });

  test('FROZEN wallet rejects both credits and debits unless allowFrozen is set (FIN-5)', async () => {
    const user = await makeUser({ wallet: { balance: 500, status: 'FROZEN' } });

    await assert.rejects(
      async () => {
        await debitWallet({
          ownerId: user._id,
          ownerType: 'User',
          amount: 50,
          category: 'PAYMENT_SENT'
        });
      },
      (err) => err.code === 'WALLET_FROZEN'
    );

    await assert.rejects(
      async () => {
        await creditWallet({
          ownerId: user._id,
          ownerType: 'User',
          amount: 50,
          category: 'RECHARGE',
          allowFrozen: false
        });
      },
      (err) => err.code === 'WALLET_FROZEN'
    );

    // Incoming settlement with allowFrozen: true succeeds
    const allowed = await creditWallet({
      ownerId: user._id,
      ownerType: 'User',
      amount: 50,
      category: 'PAYMENT_RECEIVED',
      allowFrozen: true
    });
    assert.equal(allowed.balanceAfter, 550);
  });

  test('concurrent debits cannot drive balance below zero (FIN-6)', async () => {
    const user = await makeUser({ wallet: { balance: 100, status: 'ACTIVE' } });

    // Fire 5 concurrent requests of ₹30 each (total ₹150; only 3 should succeed)
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        debitWallet({
          ownerId: user._id,
          ownerType: 'User',
          amount: 30,
          category: 'PAYMENT_SENT'
        })
      )
    );

    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    const failed = attempts.filter((a) => a.status === 'rejected');

    assert.equal(succeeded.length, 3);
    assert.equal(failed.length, 2);

    const updatedUser = await User.findById(user._id);
    assert.equal(updatedUser.wallet.balance, 10);
  });

  test('withdrawal reserves funds on creation and refunds on rejection (FIN-7)', async () => {
    const user = await makeUser({ wallet: { balance: 1000, status: 'ACTIVE' } });
    const admin = await makeAdmin();

    // 1. Submit withdrawal request for ₹400
    const wdrRes = await request(app)
      .post('/api/v1/wallet/withdraw')
      .set(authHeader(user))
      .send({
        amount: 400,
        bankDetails: {
          accountHolderName: 'Test User',
          accountNumber: '1234567890',
          ifscCode: 'SBIN0001234',
          bankName: 'SBI'
        }
      });

    assert.equal(wdrRes.status, 200);
    assert.equal(wdrRes.body.data.newBalance, 600);

    const userAfterWdr = await User.findById(user._id);
    assert.equal(userAfterWdr.wallet.balance, 600);

    const wdr = await WithdrawalRequest.findOne({ user: user._id });
    assert.equal(wdr.status, 'PENDING');
    assert.equal(wdr.amount, 400);

    // Cannot submit second withdrawal while one is pending
    const secondWdr = await request(app)
      .post('/api/v1/wallet/withdraw')
      .set(authHeader(user))
      .send({
        amount: 100,
        bankDetails: { upiId: 'test@upi' }
      });
    assert.equal(secondWdr.status, 409);

    // 2. Admin rejects withdrawal -> funds refunded to wallet
    const rejectRes = await request(app)
      .put(`/api/v1/admin/finance/withdrawals/${wdr._id}`)
      .set(authHeader(admin))
      .send({ status: 'REJECTED', remarks: 'Invalid bank details' });

    assert.equal(rejectRes.status, 200);
    const userAfterReject = await User.findById(user._id);
    assert.equal(userAfterReject.wallet.balance, 1000);

    const refundTx = await WalletTransaction.findOne({ category: 'REFUND', user: user._id });
    assert.ok(refundTx);
    assert.equal(refundTx.amount, 400);
  });

  test('coupon redemption enforces single-use per user and atomic limit (FIN-8)', async () => {
    const user = await makeUser({ wallet: { balance: 0, status: 'ACTIVE' } });
    const user2 = await makeUser({ wallet: { balance: 0, status: 'ACTIVE' } });

    const coupon = await Coupon.create({
      code: 'WELCOME50',
      title: 'Welcome Bonus',
      amount: 50,
      usageType: 'LIMITED',
      limit: 1,
      usedCount: 0,
      isActive: true,
      validFrom: new Date(Date.now() - 3600000),
      validTo: new Date(Date.now() + 3600000),
      applicableRole: 'ALL'
    });

    // First user applies coupon -> succeeds
    const res1 = await request(app)
      .post('/api/v1/wallet/apply-coupon')
      .set(authHeader(user))
      .send({ code: 'WELCOME50' });

    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.newBalance, 50);

    // Same user applies again -> rejected
    const res2 = await request(app)
      .post('/api/v1/wallet/apply-coupon')
      .set(authHeader(user))
      .send({ code: 'WELCOME50' });

    assert.equal(res2.status, 400);

    // Second user applies -> rejected because coupon limit was 1
    const res3 = await request(app)
      .post('/api/v1/wallet/apply-coupon')
      .set(authHeader(user2))
      .send({ code: 'WELCOME50' });

    assert.equal(res3.status, 400);
  });

  test('ledger reconciliation computes exact balance match (FIN-9)', async () => {
    const user = await makeUser({ wallet: { balance: 0, status: 'ACTIVE' } });

    await creditWallet({ ownerId: user._id, ownerType: 'User', amount: 500, category: 'RECHARGE' });
    await debitWallet({ ownerId: user._id, ownerType: 'User', amount: 150, category: 'PAYMENT_SENT' });
    await creditWallet({ ownerId: user._id, ownerType: 'User', amount: 50, category: 'COUPON_CREDIT' });

    const recon = await reconcileWallet(user._id, 'User');
    assert.equal(recon.expected, 400);
    assert.equal(recon.actual, 400);
    assert.equal(recon.consistent, true);
  });

  test('payOrderViaWallet transfers funds atomically between parties (FIN-10)', async () => {
    const user = await makeUser({ wallet: { balance: 500, status: 'ACTIVE' } });
    const { user: scrapperUser, scrapper } = await makeScrapper({ wallet: { balance: 1000, status: 'ACTIVE' } });

    // In scrap sell: scrapper pays user
    const order = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: 'confirmed',
      totalAmount: 300,
      paymentStatus: 'pending'
    });

    const res = await request(app)
      .post('/api/v1/wallet/pay-order')
      .set(authHeader(scrapperUser))
      .send({ orderId: order._id.toString(), amount: 300 });

    assert.equal(res.status, 200);

    const freshScrapper = await Scrapper.findById(scrapper._id);
    const freshUser = await User.findById(user._id);

    assert.equal(freshScrapper.wallet.balance, 700);
    assert.equal(freshUser.wallet.balance, 800);

    // Order cannot be paid twice
    const resDuplicate = await request(app)
      .post('/api/v1/wallet/pay-order')
      .set(authHeader(scrapperUser))
      .send({ orderId: order._id.toString(), amount: 300 });

    assert.equal(resDuplicate.status, 400);
  });
});
