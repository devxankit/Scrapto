import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as Client } from 'socket.io-client';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { default: Review } = await import('../models/Review.js');
const { default: HelpTicket } = await import('../models/HelpTicket.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, tokenFor, authHeader } = await import('./helpers.js');
const { initializeSocket } = await import('../services/socketService.js');
const { ORDER_STATUS } = await import('../config/constants.js');

describe('PHASE 7 — socket, review routing, translation & supporting modules', () => {
  let app;
  let server;
  let serverPort;

  before(async () => {
    await startTestDb();
    await syncIndexes();
    app = buildApp();
    server = http.createServer(app);
    initializeSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  test('review route ordering: /my-reviews is not swallowed by /:id (REV-1)', async () => {
    const user = await makeUser();

    // Call /my-reviews — must return 200 array, never 400 CastError from /:id
    const res = await request(app)
      .get('/api/v1/reviews/my-reviews')
      .set(authHeader(user));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.reviews || res.body.data));
  });

  test('review authorization: user must have completed order with scrapper (REV-2)', async () => {
    const user = await makeUser();
    const { scrapper } = await makeScrapper();

    // 1. Order exists but is NOT completed -> 400
    const incompleteOrder = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: 'confirmed'
    });

    const resIncomplete = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .send({
        orderId: incompleteOrder._id.toString(),
        scrapperId: scrapper._id.toString(),
        rating: 5,
        comment: 'Premature review'
      });
    assert.equal(resIncomplete.status >= 400, true);
    assert.match(resIncomplete.body.message || resIncomplete.body.error, /incomplete|completed/i);

    // 2. With completed order -> succeeds
    const completedOrder = await makeOrder({
      user: user._id,
      scrapper: scrapper._id,
      status: ORDER_STATUS.COMPLETED
    });

    const resWithOrder = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .send({
        orderId: completedOrder._id.toString(),
        scrapperId: scrapper._id.toString(),
        rating: 5,
        comment: 'Excellent experience!'
      });
    assert.equal(resWithOrder.status, 201);
  });

  test('translation endpoint abuse protection and validation (TRN-1)', async () => {
    // 1. Valid translation request
    const resValid = await request(app)
      .post('/api/v1/translate')
      .send({
        text: 'Hello world',
        targetLanguage: 'hi'
      });
    assert.equal(resValid.status, 200);
    assert.ok(resValid.body.translatedText || resValid.body.translations);

    // 2. Oversized text string (> 1000 chars) -> 400
    const longText = 'A'.repeat(1005);
    const resTooLong = await request(app)
      .post('/api/v1/translate')
      .send({
        text: longText,
        targetLanguage: 'hi'
      });
    assert.equal(resTooLong.status, 400);

    // 3. Batch exceeding max 50 items -> 400
    const bigBatch = Array.from({ length: 55 }, (_, i) => `Item ${i}`);
    const resTooMany = await request(app)
      .post('/api/v1/translate')
      .send({
        texts: bigBatch,
        targetLanguage: 'hi'
      });
    assert.equal(resTooMany.status, 400);

    // 4. Invalid target language code (injection attempt) -> 400
    const resBadLang = await request(app)
      .post('/api/v1/translate')
      .send({
        text: 'test',
        targetLanguage: '<script>alert(1)</script>'
      });
    assert.equal(resBadLang.status, 400);
  });

  test('support tickets: safe search regex and status validation (SUP-1)', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();

    // 1. Create ticket
    const createRes = await request(app)
      .post('/api/v1/support')
      .set(authHeader(user))
      .send({
        subject: 'Payment verification inquiry [urgent]',
        message: 'My recharge has not appeared yet.'
      });
    assert.equal(createRes.status, 201);
    const ticketId = createRes.body.data.ticket._id;

    // 2. Admin searches with regex metacharacters (e.g. "[urgent]") — must NOT throw or crash
    const searchRes = await request(app)
      .get('/api/v1/support/admin/all?search=[urgent]')
      .set(authHeader(admin));
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.data.tickets.length, 1);

    // 3. Update status with invalid enum -> 400
    const invalidStatusRes = await request(app)
      .patch(`/api/v1/support/${ticketId}/status`)
      .set(authHeader(admin))
      .send({ status: 'INVALID_STATUS' });
    assert.equal(invalidStatusRes.status, 400);

    // 4. Update status with valid enum -> 200
    const validStatusRes = await request(app)
      .patch(`/api/v1/support/${ticketId}/status`)
      .set(authHeader(admin))
      .send({ status: 'resolved' });
    assert.equal(validStatusRes.status, 200);
  });

  test('earnings aggregation accurately categorizes cleaning vs scrap sell (ERN-1)', async () => {
    const customer = await makeUser();
    const { user: scrapperUser, scrapper } = await makeScrapper();

    // Order 1: Scrap sell (scrapper pays user ₹300 -> outflow)
    await makeOrder({
      user: customer._id,
      scrapper: scrapper._id,
      orderType: 'scrap_sell',
      status: ORDER_STATUS.COMPLETED,
      totalAmount: 300,
      completedDate: new Date()
    });

    // Order 2: Cleaning service (scrapper receives ₹800 -> gross income)
    await makeOrder({
      user: customer._id,
      scrapper: scrapper._id,
      orderType: 'cleaning_service',
      status: ORDER_STATUS.COMPLETED,
      totalAmount: 800,
      completedDate: new Date()
    });

    const res = await request(app)
      .get('/api/v1/scrapper/earnings/summary')
      .set(authHeader(scrapperUser));

    assert.equal(res.status, 200);
    const summary = res.body.data.summary;
    assert.equal(summary.breakdown.allTime.gross, 800);
    assert.equal(summary.breakdown.allTime.payouts, 300);
    assert.equal(summary.completedOrders, 2);
    assert.equal(summary.total, 500); // 800 - 300
  });

  test('socket handshake enforces authentication and tokenVersion revocation (SOC-1)', async () => {
    const user = await makeUser({ isActive: true });
    const validToken = tokenFor(user);

    // 1. Connection without token -> rejected
    await new Promise((resolve) => {
      const client = Client(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        reconnection: false
      });
      client.on('connect_error', (err) => {
        assert.match(err.message, /authentication error/i);
        client.close();
        resolve();
      });
    });

    // 2. Connection with valid token -> connected
    await new Promise((resolve) => {
      const client = Client(`http://localhost:${serverPort}`, {
        auth: { token: validToken },
        transports: ['websocket'],
        reconnection: false
      });
      client.on('connect', () => {
        client.close();
        resolve();
      });
    });

    // 3. User tokenVersion bumped (revocation) -> rejected
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await new Promise((resolve) => {
      const client = Client(`http://localhost:${serverPort}`, {
        auth: { token: validToken },
        transports: ['websocket'],
        reconnection: false
      });
      client.on('connect_error', (err) => {
        assert.match(err.message, /authentication error/i);
        client.close();
        resolve();
      });
    });
  });
});
