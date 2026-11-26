import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { makeUser, makeScrapper, authHeader } = await import('./helpers.js');

/**
 * Cleaning services, end to end: book -> partner accepts -> partner quotes
 * -> user pays exactly the quote through the wallet (topped up by Razorpay in
 * the app) -> partner completes -> 1% platform fee is settled.
 */
describe('Cleaning service booking and online payment', () => {
  let app;
  before(async () => { await startTestDb(); await syncIndexes(); app = buildApp(); });
  after(async () => { await stopTestDb(); });
  beforeEach(async () => { await clearTestDb(); });

  const address = { street: '12 Green Park', city: 'Delhi', state: 'Delhi', pincode: '110016', coordinates: { lat: 28.6139, lng: 77.209 } };
  const book = (user, serviceType = 'car_cleaning') =>
    request(app).post('/api/orders').set(authHeader(user)).send({
      orderType: 'cleaning_service',
      serviceDetails: { serviceType, description: 'SUV · two cars' },
      pickupAddress: address,
      preferredTime: 'later',
    });

  const cleaner = async () => {
    const { user, scrapper } = await makeScrapper();
    await Scrapper.updateOne({ _id: scrapper._id }, { $set: { services: ['scrap_pickup', 'home_cleaning'] } });
    return user;
  };

  test('CLN-1 each new cleaning category can be booked; order starts unpriced', async () => {
    const user = await makeUser();
    for (const t of ['home_cleaning', 'car_cleaning', 'water_tank_cleaning', 'super_dry_carpet_cleaning', 'solar_panel_cleaning']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await book(user, t);
      assert.equal(res.status, 201, `${t}: ${res.body.message}`);
      assert.equal(res.body.data.order.orderType, 'cleaning_service');
      assert.equal(res.body.data.order.serviceDetails.serviceType, t);
      assert.equal(res.body.data.order.totalAmount, 0);
    }
  });

  test('CLN-2 unknown service types are rejected', async () => {
    const user = await makeUser();
    const res = await book(user, 'rocket_cleaning');
    assert.equal(res.status, 400);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('CLN-3 full flow: quote, exact payment, completion fee', async () => {
    const user = await makeUser({ wallet: { balance: 1000, currency: 'INR', status: 'ACTIVE' } });
    const partner = await cleaner();
    const orderId = (await book(user)).body.data.order._id;

    // Only partners offering cleaning see it.
    const avail = await request(app).get('/api/orders/available').set(authHeader(partner)).expect(200);
    assert.ok(avail.body.data.orders.some((o) => String(o._id) === String(orderId)));

    await request(app).post(`/api/orders/${orderId}/accept`).set(authHeader(partner)).expect(200);

    // Paying before a quote exists is refused.
    const early = await request(app).post('/api/wallet/pay-order').set(authHeader(user)).send({ orderId, amount: 500 });
    assert.equal(early.status, 400);

    // Partner shares the price after the visit.
    await request(app).put(`/api/orders/${orderId}/status`).set(authHeader(partner)).send({ status: 'in_progress', totalAmount: 800 }).expect(200);

    // Any amount other than the quote is refused (the old endpoint trusted the client).
    const cheap = await request(app).post('/api/wallet/pay-order').set(authHeader(user)).send({ orderId, amount: 1 });
    assert.equal(cheap.status, 400);

    await request(app).post('/api/wallet/pay-order').set(authHeader(user)).send({ orderId, amount: 800 }).expect(200);
    let order = await Order.findById(orderId);
    assert.equal(order.paymentStatus, 'completed');
    assert.equal(order.totalAmount, 800);
    assert.equal((await User.findById(user._id)).wallet.balance, 200);

    // Paying twice is refused.
    const again = await request(app).post('/api/wallet/pay-order').set(authHeader(user)).send({ orderId, amount: 800 });
    assert.ok([400, 409].includes(again.status));

    // The price is final once paid.
    const raise = await request(app).put(`/api/orders/${orderId}/status`).set(authHeader(partner)).send({ totalAmount: 1500 });
    assert.equal(raise.status, 409);

    // Completion settles the 1% fee (₹8) from the user's wallet.
    await request(app).put(`/api/orders/${orderId}/status`).set(authHeader(partner)).send({ status: 'completed' }).expect(200);
    order = await Order.findById(orderId);
    assert.equal(order.status, 'completed');
    assert.equal((await User.findById(user._id)).wallet.balance, 192);
  });

  test('CLN-4 a scrap-only partner does not see cleaning jobs', async () => {
    const user = await makeUser();
    const { user: scrapOnly } = await makeScrapper();
    const orderId = (await book(user)).body.data.order._id;
    const avail = await request(app).get('/api/orders/available').set(authHeader(scrapOnly)).expect(200);
    assert.ok(!avail.body.data.orders.some((o) => String(o._id) === String(orderId)));
  });

  test('CLN-6 a partner turns on cleaning in Edit profile and then sees cleaning jobs', async () => {
    const user = await makeUser();
    const { user: partner, scrapper } = await makeScrapper();
    const orderId = (await book(user)).body.data.order._id;

    // Same request the partner app's Edit profile sends.
    const on = await request(app).put('/api/scrappers/me').set(authHeader(partner))
      .send({ services: ['scrap_pickup', 'home_cleaning'] });
    assert.equal(on.status, 200, on.body.message);
    assert.deepEqual((await Scrapper.findById(scrapper._id).lean()).services.sort(), ['home_cleaning', 'scrap_pickup']);
    const avail = await request(app).get('/api/orders/available').set(authHeader(partner)).expect(200);
    assert.ok(avail.body.data.orders.some((o) => String(o._id) === String(orderId)), 'cleaning job should be offered');

    // Unknown values are dropped; an empty choice is refused and changes nothing.
    await request(app).put('/api/scrappers/me').set(authHeader(partner)).send({ services: ['home_cleaning', 'hacking'] }).expect(200);
    assert.deepEqual((await Scrapper.findById(scrapper._id).lean()).services, ['home_cleaning']);
    await request(app).put('/api/scrappers/me').set(authHeader(partner)).send({ services: [] }).expect(400);
    assert.deepEqual((await Scrapper.findById(scrapper._id).lean()).services, ['home_cleaning']);
  });
});
