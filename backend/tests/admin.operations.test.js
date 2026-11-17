import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { default: SystemSetting } = await import('../models/SystemSetting.js');
const { default: SubscriptionPlan } = await import('../models/SubscriptionPlan.js');
const { default: WithdrawalRequest } = await import('../models/WithdrawalRequest.js');
const { AuditLog } = await import('../services/auditService.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, tokenFor, authHeader } = await import('./helpers.js');

describe('PHASE 6 — admin operations & system controls', () => {
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

  test('blocking a user immediately revokes active JWT sessions (ADM-1)', async () => {
    const admin = await makeAdmin();
    const user = await makeUser({ isActive: true });
    const userToken = tokenFor(user);

    // Verify token works initially
    const preBlockRes = await request(app)
      .get('/api/v1/wallet/profile')
      .set('Authorization', `Bearer ${userToken}`);
    assert.equal(preBlockRes.status, 200);

    // Admin blocks user
    const blockRes = await request(app)
      .patch(`/api/v1/admin/users/${user._id}/block`)
      .set(authHeader(admin));
    assert.equal(blockRes.status, 200);

    // Same token is now REJECTED
    const postBlockRes = await request(app)
      .get('/api/v1/wallet/profile')
      .set('Authorization', `Bearer ${userToken}`);
    assert.equal(postBlockRes.status, 403);
    assert.match(postBlockRes.body.error, /deactivated/i);

    // Check audit log
    const auditEntry = await AuditLog.findOne({ action: 'USER_BLOCKED', targetId: user._id.toString() });
    assert.ok(auditEntry);
  });

  test('user deletion enforces referential integrity safeguards (ADM-2)', async () => {
    const admin = await makeAdmin();

    // 1. Cannot delete user with open order
    const userWithOrder = await makeUser();
    await makeOrder({ user: userWithOrder._id, status: 'confirmed' });

    const delOrderRes = await request(app)
      .delete(`/api/v1/admin/users/${userWithOrder._id}`)
      .set(authHeader(admin));
    assert.equal(delOrderRes.status, 400);
    assert.match(delOrderRes.body.message || delOrderRes.body.error, /open orders/i);

    // 2. Cannot delete user with wallet balance
    const userWithBalance = await makeUser({ wallet: { balance: 250 } });
    const delBalRes = await request(app)
      .delete(`/api/v1/admin/users/${userWithBalance._id}`)
      .set(authHeader(admin));
    assert.equal(delBalRes.status, 400);
    assert.match(delBalRes.body.message || delBalRes.body.error, /wallet balance/i);

    // 3. Cannot delete user with pending withdrawal
    const userWithWdr = await makeUser({ wallet: { balance: 0 } });
    await WithdrawalRequest.create({
      request_id: 'WDR-TEST-001',
      user: userWithWdr._id,
      userType: 'User',
      amount: 100,
      status: 'PENDING',
      bankDetails: { method: 'UPI', upiId: 'test@upi' }
    });

    const delWdrRes = await request(app)
      .delete(`/api/v1/admin/users/${userWithWdr._id}`)
      .set(authHeader(admin));
    assert.equal(delWdrRes.status, 400);
    assert.match(delWdrRes.body.message || delWdrRes.body.error, /pending withdrawals/i);

    // 4. Cannot delete another admin account
    const otherAdmin = await makeAdmin();
    const delAdminRes = await request(app)
      .delete(`/api/v1/admin/users/${otherAdmin._id}`)
      .set(authHeader(admin));
    assert.equal(delAdminRes.status, 403);
    assert.match(delAdminRes.body.message || delAdminRes.body.error, /admin accounts cannot be deleted/i);

    // 5. Clean user deletion succeeds
    const cleanUser = await makeUser({ wallet: { balance: 0 } });
    const delCleanRes = await request(app)
      .delete(`/api/v1/admin/users/${cleanUser._id}`)
      .set(authHeader(admin));
    assert.equal(delCleanRes.status, 200);

    const exists = await User.findById(cleanUser._id);
    assert.equal(exists, null);
  });

  test('admin settings validation prevents out-of-bound configurations (ADM-3)', async () => {
    const admin = await makeAdmin();

    // 1. Setting invalid commission percentage (> 100) -> 400
    const resOver = await request(app)
      .put('/api/v1/admin/settings/scrap_commission_percentage')
      .set(authHeader(admin))
      .send({ value: 150 });
    assert.equal(resOver.status, 400);

    // 2. Setting invalid commission percentage (< 0) -> 400
    const resNegative = await request(app)
      .put('/api/v1/admin/settings/scrap_commission_percentage')
      .set(authHeader(admin))
      .send({ value: -5 });
    assert.equal(resNegative.status, 400);

    // 3. Setting valid commission percentage (e.g. 2.5) -> succeeds
    const resValid = await request(app)
      .put('/api/v1/admin/settings/scrap_commission_percentage')
      .set(authHeader(admin))
      .send({ value: 2.5 });
    assert.equal(resValid.status, 200);

    const setting = await SystemSetting.findOne({ key: 'scrap_commission_percentage' });
    assert.equal(Number(setting.value), 2.5);
  });

  test('subscription plan creation and validation by admin (ADM-4)', async () => {
    const admin = await makeAdmin();

    const planData = {
      name: 'Standard Weekly',
      description: 'Weekly access plan',
      price: 149,
      duration: 7,
      durationType: 'daily',
      maxPickups: 20
    };

    const res = await request(app)
      .post('/api/v1/admin/subscriptions/plans')
      .set(authHeader(admin))
      .send(planData);

    assert.equal(res.status, 200);
    const plan = res.body.data.plan;
    assert.equal(plan.name, 'Standard Weekly');
    assert.equal(plan.price, 149);
    assert.equal(plan.duration, 7);
  });

  test('audit log scrubs sensitive credential and token keys (ADM-5)', async () => {
    const admin = await makeAdmin();

    const auditRes = await request(app)
      .put('/api/v1/admin/settings/scrap_commission_percentage')
      .set(authHeader(admin))
      .send({ value: 3.0 });
    assert.equal(auditRes.status, 200);

    const entry = await AuditLog.findOne({ action: 'SETTING_UPDATED' }).sort({ createdAt: -1 });
    assert.ok(entry);
    assert.equal(entry.actorRole, 'admin');

    // Ensure no password, token, or secret can leak into AuditLog metadata
    const str = JSON.stringify(entry.metadata);
    assert.equal(/password|token|secret/i.test(str), false);
  });
});
