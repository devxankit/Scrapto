import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: Price } = await import('../models/Price.js');
const { default: Order } = await import('../models/Order.js');
const { makeUser, authHeader } = await import('./helpers.js');

/**
 * Category mapping approved 2026-11-17: the backend accepts the 26 categories
 * the mobile catalogs use, case-insensitively, and the admin price list is
 * matched case-insensitively so its rate is authoritative.
 */
describe('Order categories match the mobile catalog', () => {
  let app;
  before(async () => { await startTestDb(); await syncIndexes(); app = buildApp(); });
  after(async () => { await stopTestDb(); });
  beforeEach(async () => { await clearTestDb(); });

  const address = { street: '12 Green Park', city: 'Delhi', state: 'Delhi', pincode: '110016', coordinates: { lat: 28.6139, lng: 77.209 } };
  const place = (user, items) => request(app).post('/api/orders').set(authHeader(user)).send({ scrapItems: items, pickupAddress: address, preferredTime: 'now' });

  test('CAT-1 app categories that used to 400 are now accepted', async () => {
    const user = await makeUser();
    for (const category of ['copper', 'wire & cable', 'e-waste', 'tv / monitor', 'washing machine']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await place(user, [{ category, weight: 2, rate: 10 }]);
      assert.equal(res.status, 201, `${category}: ${res.body.message || JSON.stringify(res.body.errors)}`);
    }
  });

  test('CAT-2 admin-style capitalisation is accepted and stored lowercase', async () => {
    const user = await makeUser();
    const res = await place(user, [{ category: '  Copper ', weight: 2, rate: 10 }]);
    assert.equal(res.status, 201);
    const order = await Order.findById(res.body.data.order._id).lean();
    assert.equal(order.scrapItems[0].category, 'copper');
  });

  test('CAT-3 a capitalised admin price is authoritative over the client rate', async () => {
    const user = await makeUser();
    await Price.create({ category: 'Copper', pricePerKg: 400, regionCode: 'IN-DL' });

    const res = await place(user, [{ category: 'copper', weight: 2, rate: 99999 }]);
    assert.equal(res.status, 201);
    const order = await Order.findById(res.body.data.order._id).lean();
    assert.equal(order.scrapItems[0].rate, 400, 'server rate, not the client rate');
    assert.equal(order.totalAmount, 800);
  });

  test('CAT-4 unknown categories are still rejected', async () => {
    const user = await makeUser();
    const res = await place(user, [{ category: 'plutonium', weight: 2, rate: 10 }]);
    assert.equal(res.status, 400);
    assert.equal(await Order.countDocuments(), 0);
  });
});
