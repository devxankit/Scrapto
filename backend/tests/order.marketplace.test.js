import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { default: Price } = await import('../models/Price.js');
const { default: MarketplaceRequest } = await import('../models/MarketplaceRequest.js');
const { default: Bid } = await import('../models/Bid.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, authHeader } = await import('./helpers.js');
const { ORDER_STATUS } = await import('../config/constants.js');

describe('PHASE 4 — orders & marketplace lifecycle', () => {
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

  test('server computes scrap item total and enforces authoritative price (ORD-1)', async () => {
    const user = await makeUser();

    // Create authoritative price for 'metal' at ₹40/kg
    await Price.create({
      category: 'metal',
      pricePerKg: 40,
      minPrice: 35,
      maxPrice: 45,
      effectiveDate: new Date(Date.now() - 3600000),
      isActive: true
    });

    // Client requests 10kg with client-claimed rate of ₹10 (trying to underpay/tamper)
    const res = await request(app)
      .post('/api/v1/orders')
      .set(authHeader(user))
      .send({
        scrapItems: [{ category: 'metal', weight: 10, rate: 10 }],
        pickupAddress: {
          street: '123 Test St',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          coordinates: { lat: 28.6139, lng: 77.209 }
        }
      });

    assert.equal(res.status, 201);
    const order = res.body.data.order;
    assert.equal(order.totalWeight, 10);
    // Rate must be authoritative ₹40 and total must be ₹400
    assert.equal(order.scrapItems[0].rate, 40);
    assert.equal(order.totalAmount, 400);
  });

  test('order state machine strictly enforces valid transitions (ORD-2)', async () => {
    const user = await makeUser();
    const { user: scrapperUser, scrapper } = await makeScrapper({ wallet: { balance: 1000 } });
    const order = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: ORDER_STATUS.CONFIRMED,
      totalAmount: 200
    });

    // 1. User cannot update status directly
    const userRes = await request(app)
      .put(`/api/v1/orders/${order._id}/status`)
      .set(authHeader(user))
      .send({ status: ORDER_STATUS.IN_PROGRESS });
    assert.equal(userRes.status, 403);

    // 2. Scrapper transitions to in_progress -> succeeds
    const scrapperRes1 = await request(app)
      .put(`/api/v1/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.IN_PROGRESS });
    assert.equal(scrapperRes1.status, 200);

    // 3. Illegal backward transition (in_progress -> pending) -> 409 Conflict
    const illegalRes = await request(app)
      .put(`/api/v1/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.PENDING });
    assert.equal(illegalRes.status, 409);
  });

  test('atomic order acceptance: first scrapper wins, second gets 409 (ORD-3)', async () => {
    const user = await makeUser();
    const { user: scrapper1User } = await makeScrapper({ wallet: { balance: 500 } });
    const { user: scrapper2User } = await makeScrapper({ wallet: { balance: 500 } });

    const order = await makeOrder({
      user: user._id,
      scrapper: null,
      status: ORDER_STATUS.PENDING,
      assignmentStatus: 'unassigned'
    });

    // Both attempt to accept the same order concurrently
    const [res1, res2] = await Promise.all([
      request(app).post(`/api/v1/orders/${order._id}/accept`).set(authHeader(scrapper1User)),
      request(app).post(`/api/v1/orders/${order._id}/accept`).set(authHeader(scrapper2User))
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const freshOrder = await Order.findById(order._id);
    assert.equal(freshOrder.status, ORDER_STATUS.CONFIRMED);
    assert.equal(freshOrder.assignmentStatus, 'accepted');
    assert.ok(freshOrder.scrapper);
  });

  test('order acceptance enforces scrapper eligibility checks (ORD-4)', async () => {
    const user = await makeUser();
    const order = await makeOrder({ user: user._id, status: ORDER_STATUS.PENDING, assignmentStatus: 'unassigned' });

    // 1. Unverified KYC scrapper
    const { user: unverifiedScrapper } = await makeScrapper({ kycStatus: 'pending', wallet: { balance: 500 } });
    const resKyc = await request(app)
      .post(`/api/v1/orders/${order._id}/accept`)
      .set(authHeader(unverifiedScrapper));
    assert.equal(resKyc.status, 403);
    assert.match(resKyc.body.message || resKyc.body.error, /kyc/i);

    // 2. Low wallet balance (< ₹100)
    const { user: poorScrapper } = await makeScrapper({ wallet: { balance: 50 } });
    const resBalance = await request(app)
      .post(`/api/v1/orders/${order._id}/accept`)
      .set(authHeader(poorScrapper));
    assert.equal(resBalance.status, 403);
    assert.match(resBalance.body.message || resBalance.body.error, /balance/i);

    // 3. Inactive subscription
    const { user: unsubscribedScrapper } = await makeScrapper({
      wallet: { balance: 500 },
      subscription: { status: 'expired', expiryDate: new Date(Date.now() - 3600000) }
    });
    const resSub = await request(app)
      .post(`/api/v1/orders/${order._id}/accept`)
      .set(authHeader(unsubscribedScrapper));
    assert.equal(resSub.status, 403);
    assert.match(resSub.body.message || resSub.body.error, /subscription/i);
  });

  test('order completion settlement pays user and deducts commission (ORD-5)', async () => {
    const user = await makeUser({ wallet: { balance: 0 } });
    const { user: scrapperUser, scrapper } = await makeScrapper({
      wallet: { balance: 1000 },
      subscription: { status: 'active', expiryDate: new Date(Date.now() + 86400000), usedPickups: 0 }
    });

    const order = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: ORDER_STATUS.IN_PROGRESS,
      totalAmount: 400,
      paymentStatus: 'pending'
    });

    // Scrapper completes order
    const res = await request(app)
      .put(`/api/v1/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.COMPLETED });

    assert.equal(res.status, 200);

    const freshUser = await User.findById(user._id);
    const freshScrapper = await Scrapper.findById(scrapper._id);
    const freshOrder = await Order.findById(order._id);

    // User credited ₹400
    assert.equal(freshUser.wallet.balance, 400);

    // Scrapper debited ₹400 (order pay) + ₹4 (1% commission) = ₹404 deducted -> balance ₹596
    assert.equal(freshScrapper.wallet.balance, 596);
    assert.equal(freshScrapper.subscription.usedPickups, 1);
    assert.equal(freshOrder.settlementDone, true);
    assert.equal(freshOrder.status, ORDER_STATUS.COMPLETED);

    // Calling status again is idempotent and cannot double-settle
    const resRepeat = await request(app)
      .put(`/api/v1/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.COMPLETED });
    assert.equal(resRepeat.status, 200);

    const scrapperCheck = await Scrapper.findById(scrapper._id);
    assert.equal(scrapperCheck.wallet.balance, 596);
  });

  test('marketplace bidding, privacy disclosure and atomic deal closing (ORD-6)', async () => {
    const admin = await makeAdmin();
    const customer = await makeUser();
    const { user: scrapper1User, scrapper: scrapper1 } = await makeScrapper({ wallet: { balance: 500 } });
    const { user: scrapper2User, scrapper: scrapper2 } = await makeScrapper({ wallet: { balance: 500 } });

    // 1. Admin creates marketplace request
    const createReq = await request(app)
      .post('/api/v1/marketplace/requests')
      .set(authHeader(admin))
      .send({
        name: customer.name,
        title: 'Bulk Copper Scrap 500kg',
        description: 'Clean stripped wire copper',
        item: 'copper',
        unit: 'kg',
        fullAddress: 'Plot 45, Secret Industrial Area, Delhi',
        phoneNumber: '9876543210',
        city: 'Delhi',
        state: 'Delhi',
        basePrice: 50000
      });
    assert.equal(createReq.status, 201);
    const mktReqId = createReq.body.data[0]._id;

    // 2. Scrapper views request details: sensitive address & phone are REDACTED
    const viewRes = await request(app)
      .get(`/api/v1/marketplace/requests/${mktReqId}`)
      .set(authHeader(scrapper1User));
    assert.equal(viewRes.status, 200);
    assert.equal(viewRes.body.data.fullAddress, undefined);
    assert.equal(viewRes.body.data.phoneNumber, undefined);

    // 3. Both scrappers place bids
    const bid1Res = await request(app)
      .post(`/api/v1/marketplace/requests/${mktReqId}/bids`)
      .set(authHeader(scrapper1User))
      .send({ bidAmount: 55000, message: 'Ready to pick up today' });
    assert.equal(bid1Res.status, 200);

    const bid2Res = await request(app)
      .post(`/api/v1/marketplace/requests/${mktReqId}/bids`)
      .set(authHeader(scrapper2User))
      .send({ bidAmount: 58000, message: 'Higher offer' });
    assert.equal(bid2Res.status, 200);

    // 4. Admin accepts scrapper 2's bid
    const acceptRes = await request(app)
      .patch(`/api/v1/marketplace/bids/${bid2Res.body.data._id}/accept`)
      .set(authHeader(admin));
    assert.equal(acceptRes.status, 200);

    // 5. Winner scrapper 2 can now view fullAddress and phoneNumber
    const winnerView = await request(app)
      .get(`/api/v1/marketplace/requests/${mktReqId}`)
      .set(authHeader(scrapper2User));
    assert.equal(winnerView.status, 200);
    assert.equal(winnerView.body.data.fullAddress, 'Plot 45, Secret Industrial Area, Delhi');
    assert.equal(winnerView.body.data.phoneNumber, '9876543210');

    // Loser scrapper 1 still cannot view private details
    const loserView = await request(app)
      .get(`/api/v1/marketplace/requests/${mktReqId}`)
      .set(authHeader(scrapper1User));
    assert.equal(loserView.status, 200);
    assert.equal(loserView.body.data.fullAddress, undefined);
  });
});
