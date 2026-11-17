import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Payment } = await import('../models/Payment.js');
const { default: Order } = await import('../models/Order.js');
const { default: SubscriptionPlan } = await import('../models/SubscriptionPlan.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, makePlan, authHeader } = await import('./helpers.js');
const { verifyPaymentSignature } = await import('../services/paymentService.js');
const { PAYMENT_STATUS } = await import('../config/constants.js');

describe('PHASE 3 — payments & webhook security', () => {
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

  test('verifyPaymentSignature correctly validates HMAC-SHA256 (PAY-1)', () => {
    const orderId = 'order_test_123';
    const paymentId = 'pay_test_456';
    const secret = process.env.RAZORPAY_KEY_SECRET;

    const validSig = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    assert.equal(verifyPaymentSignature(orderId, paymentId, validSig), true);
    assert.equal(verifyPaymentSignature(orderId, paymentId, 'invalid_signature_hex'), false);
    assert.equal(verifyPaymentSignature(orderId, 'tampered_payment', validSig), false);
  });

  test('createPaymentOrder rejects non-owner and orders in invalid states (PAY-2)', async () => {
    const owner = await makeUser();
    const otherUser = await makeUser();
    const order = await makeOrder({ user: owner._id, status: 'pending', totalAmount: 500 });

    // Non-owner cannot create payment
    const resForbidden = await request(app)
      .post('/api/v1/payments/create-order')
      .set(authHeader(otherUser))
      .send({ orderId: order._id.toString() });
    assert.equal(resForbidden.status, 403);

    // Pending order is not ready for payment
    const resBadState = await request(app)
      .post('/api/v1/payments/create-order')
      .set(authHeader(owner))
      .send({ orderId: order._id.toString() });
    assert.equal(resBadState.status, 400);
    assert.match(resBadState.body.message || resBadState.body.error, /not ready for payment/i);
  });

  test('verifyPayment rejects invalid signature (PAY-3)', async () => {
    const user = await makeUser();
    const order = await makeOrder({ user: user._id, status: 'confirmed', totalAmount: 500 });

    const payment = await Payment.create({
      order: order._id,
      user: user._id,
      amount: 500,
      currency: 'INR',
      razorpayOrderId: 'order_test_999',
      receipt: 'rcpt_123',
      status: PAYMENT_STATUS.PENDING
    });

    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set(authHeader(user))
      .send({
        orderId: order._id.toString(),
        razorpay_order_id: 'order_test_999',
        razorpay_payment_id: 'pay_test_999',
        razorpay_signature: 'fake_tampered_signature'
      });

    assert.equal(res.status, 400);
    assert.match(res.body.message || res.body.error, /invalid payment signature/i);

    const freshPayment = await Payment.findById(payment._id);
    assert.equal(freshPayment.status, PAYMENT_STATUS.PENDING);
  });

  test('Razorpay webhook rejects requests with invalid or missing signature (PAY-4)', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_123', order_id: 'order_123', amount: 50000 } } }
    });

    // 1. Missing signature header
    const resNoSig = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(payload);
    assert.equal(resNoSig.status, 400);

    // 2. Tampered signature
    const resBadSig = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'deadbeefcafebabe')
      .send(payload);
    assert.equal(resBadSig.status, 400);
  });

  test('Razorpay webhook processes payment.captured idempotently (PAY-5)', async () => {
    const user = await makeUser();
    const { scrapper } = await makeScrapper({ wallet: { balance: 0, status: 'ACTIVE' } });
    const order = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: 'confirmed',
      totalAmount: 500,
      paymentStatus: 'pending'
    });

    const payment = await Payment.create({
      order: order._id,
      user: user._id,
      amount: 500,
      currency: 'INR',
      entityType: 'order',
      razorpayOrderId: 'order_rzp_webhook_123',
      receipt: 'rcpt_webhook_123',
      status: PAYMENT_STATUS.PENDING
    });

    const payloadObj = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp_webhook_456',
            order_id: 'order_rzp_webhook_123',
            amount: 50000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    };
    const rawPayload = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    // First webhook delivery
    const res1 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSignature)
      .send(rawPayload);

    assert.equal(res1.status, 200);
    assert.equal(res1.body.success, true);

    const updatedPayment = await Payment.findById(payment._id);
    assert.equal(updatedPayment.status, PAYMENT_STATUS.COMPLETED);
    assert.equal(updatedPayment.razorpayPaymentId, 'pay_rzp_webhook_456');

    const updatedOrder = await Order.findById(order._id);
    assert.equal(updatedOrder.paymentStatus, PAYMENT_STATUS.COMPLETED);

    const updatedScrapper = await Scrapper.findById(scrapper._id);
    assert.equal(updatedScrapper.wallet.balance, 500);

    // Second webhook delivery (replay/retry): returns 200 without duplicate credit
    const res2 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSignature)
      .send(rawPayload);

    assert.equal(res2.status, 200);
    const scrapperAfterReplay = await Scrapper.findById(scrapper._id);
    assert.equal(scrapperAfterReplay.wallet.balance, 500);
  });

  test('Razorpay webhook processes payment.failed event (PAY-6)', async () => {
    const user = await makeUser();
    const order = await makeOrder({ user: user._id, status: 'confirmed', totalAmount: 200 });

    const payment = await Payment.create({
      order: order._id,
      user: user._id,
      amount: 200,
      currency: 'INR',
      entityType: 'order',
      razorpayOrderId: 'order_fail_123',
      receipt: 'rcpt_fail_123',
      status: PAYMENT_STATUS.PENDING
    });

    const payloadObj = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail_456',
            order_id: 'order_fail_123',
            amount: 20000,
            currency: 'INR'
          }
        }
      }
    };
    const rawPayload = JSON.stringify(payloadObj);
    const validSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSignature)
      .send(rawPayload);

    assert.equal(res.status, 200);

    const failedPayment = await Payment.findById(payment._id);
    assert.equal(failedPayment.status, PAYMENT_STATUS.FAILED);

    const failedOrder = await Order.findById(order._id);
    assert.equal(failedOrder.paymentStatus, PAYMENT_STATUS.FAILED);
  });

  test('subscription payment order creation validates plan from database (PAY-7)', async () => {
    const { user: scrapperUser } = await makeScrapper();
    const plan = await makePlan({ name: 'Pro Scrapper', price: 299, duration: 30, durationType: 'daily' });

    // Client passes planId; amount must be fetched from DB, not trusted from client
    const res = await request(app)
      .post('/api/v1/payments/subscription/create')
      .set(authHeader(scrapperUser))
      .send({ planId: plan._id.toString() });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.amount, 29900); // 299 in paise

    const payment = await Payment.findById(res.body.data.paymentId);
    assert.equal(payment.amount, 299);
    assert.equal(payment.entityType, 'subscription');
    assert.equal(payment.durationDays, 30);
  });
});
