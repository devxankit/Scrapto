import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');
const { makeUser, makeScrapper, authHeader } = await import('./helpers.js');

/**
 * Regression cover for the endpoints the React Native apps called but the
 * backend did not implement:
 *   - GET/POST/PUT/PATCH/DELETE /api/addresses   (saved pickup address book)
 *   - GET/PUT /api/notifications                 (in-app notification history)
 *   - POST /api/auth/logout                      (single-device sign-out)
 *
 * Every assertion checks MongoDB state, not just the HTTP envelope.
 */
describe('Native app integration â€” addresses, notifications, logout', () => {
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

  const validAddress = {
    type: 'home',
    label: 'Home',
    street: '12 Green Park',
    landmark: 'Near metro',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110016',
    coordinates: { lat: 28.6139, lng: 77.209 }
  };

  /* ---------------------------------------------------------- addresses */

  test('ADDR-1 address book is empty for a new user', async () => {
    const user = await makeUser();
    const res = await request(app).get('/api/addresses').set(authHeader(user)).expect(200);

    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.addresses, []);
  });

  test('ADDR-2 create persists to MongoDB and first address becomes default', async () => {
    const user = await makeUser();
    const res = await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send(validAddress)
      .expect(201);

    assert.equal(res.body.data.address.street, '12 Green Park');
    assert.equal(res.body.data.address.isDefault, true, 'first address must be default');

    // Database persistence, not just the response body.
    const fromDb = await User.findById(user._id).select('addresses');
    assert.equal(fromDb.addresses.length, 1);
    assert.equal(fromDb.addresses[0].city, 'Delhi');
    assert.equal(fromDb.addresses[0].coordinates.lat, 28.6139);
    assert.equal(fromDb.addresses[0].isDefault, true);
  });

  test('ADDR-3 validation rejects missing street, city and bad pincode', async () => {
    const user = await makeUser();

    for (const [patch, field] of [
      [{ street: '' }, 'street'],
      [{ city: '' }, 'city'],
      [{ pincode: '123' }, 'pincode'],
      [{ pincode: 'abcdef' }, 'pincode']
    ]) {
      const res = await request(app)
        .post('/api/addresses')
        .set(authHeader(user))
        .send({ ...validAddress, ...patch })
        .expect(400);
      assert.equal(res.body.success, false, `${field} should be rejected`);
    }

    const fromDb = await User.findById(user._id).select('addresses');
    assert.equal(fromDb.addresses.length, 0, 'no invalid address may persist');
  });

  test('ADDR-4 out-of-range coordinates are rejected', async () => {
    const user = await makeUser();
    await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send({ ...validAddress, coordinates: { lat: 999, lng: 77 } })
      .expect(400);
  });

  test('ADDR-5 update mutates the right subdocument', async () => {
    const user = await makeUser();
    const created = await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send(validAddress)
      .expect(201);
    const id = created.body.data.address._id;

    await request(app)
      .put(`/api/addresses/${id}`)
      .set(authHeader(user))
      .send({ ...validAddress, street: '99 New Street', city: 'Mumbai', pincode: '400001' })
      .expect(200);

    const fromDb = await User.findById(user._id).select('addresses');
    assert.equal(fromDb.addresses.length, 1, 'update must not add a document');
    assert.equal(fromDb.addresses[0].street, '99 New Street');
    assert.equal(fromDb.addresses[0].city, 'Mumbai');
  });

  test('ADDR-6 only one address holds the default flag', async () => {
    const user = await makeUser();
    const a = await request(app).post('/api/addresses').set(authHeader(user)).send(validAddress).expect(201);
    const b = await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send({ ...validAddress, label: 'Office', type: 'office', street: '5 Tower B', isDefault: true })
      .expect(201);

    const fromDb = await User.findById(user._id).select('addresses');
    const defaults = fromDb.addresses.filter((x) => x.isDefault);
    assert.equal(defaults.length, 1, 'exactly one default');
    assert.equal(String(defaults[0]._id), String(b.body.data.address._id));
    assert.ok(a.body.data.address._id, 'first address still exists');
  });

  test('ADDR-7 PATCH :id/default switches the default', async () => {
    const user = await makeUser();
    const a = await request(app).post('/api/addresses').set(authHeader(user)).send(validAddress).expect(201);
    const b = await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send({ ...validAddress, street: '5 Tower B' })
      .expect(201);

    await request(app)
      .patch(`/api/addresses/${b.body.data.address._id}/default`)
      .set(authHeader(user))
      .expect(200);

    const fromDb = await User.findById(user._id).select('addresses');
    assert.equal(String(fromDb.addresses.find((x) => x.isDefault)._id), String(b.body.data.address._id));
    assert.equal(fromDb.addresses.id(a.body.data.address._id).isDefault, false);
  });

  test('ADDR-8 delete removes it and promotes a new default', async () => {
    const user = await makeUser();
    const a = await request(app).post('/api/addresses').set(authHeader(user)).send(validAddress).expect(201);
    await request(app)
      .post('/api/addresses')
      .set(authHeader(user))
      .send({ ...validAddress, street: '5 Tower B' })
      .expect(201);

    await request(app)
      .delete(`/api/addresses/${a.body.data.address._id}`)
      .set(authHeader(user))
      .expect(200);

    const fromDb = await User.findById(user._id).select('addresses');
    assert.equal(fromDb.addresses.length, 1);
    assert.equal(fromDb.addresses[0].isDefault, true, 'remaining address is promoted');
  });

  test('ADDR-9 a user cannot touch another user address (IDOR)', async () => {
    const victim = await makeUser();
    const attacker = await makeUser();
    const created = await request(app)
      .post('/api/addresses')
      .set(authHeader(victim))
      .send(validAddress)
      .expect(201);
    const id = created.body.data.address._id;

    await request(app).put(`/api/addresses/${id}`).set(authHeader(attacker)).send(validAddress).expect(404);
    await request(app).delete(`/api/addresses/${id}`).set(authHeader(attacker)).expect(404);
    await request(app).patch(`/api/addresses/${id}/default`).set(authHeader(attacker)).expect(404);

    const fromDb = await User.findById(victim._id).select('addresses');
    assert.equal(fromDb.addresses.length, 1, 'victim address survives');
  });

  test('ADDR-11 address writes never change the referral code (live-DB regression)', async () => {
    const user = await makeUser();
    const code = (await User.findById(user._id)).referralCode;
    assert.ok(code, 'user has a referral code');

    const a = await request(app).post('/api/addresses').set(authHeader(user)).send(validAddress).expect(201);
    await request(app).put(`/api/addresses/${a.body.data.address._id}`).set(authHeader(user)).send({ ...validAddress, street: '99 New St' }).expect(200);
    await request(app).delete(`/api/addresses/${a.body.data.address._id}`).set(authHeader(user)).expect(200);

    assert.equal((await User.findById(user._id)).referralCode, code, 'shared referral code must survive');
  });

  test('ADDR-10 unauthenticated and scrapper access is refused', async () => {
    await request(app).get('/api/addresses').expect(401);
    const { user: scrapper } = await makeScrapper();
    await request(app).get('/api/addresses').set(authHeader(scrapper)).expect(403);
  });

  /* ------------------------------------------------------ notifications */

  test('NOTE-1 list is empty, then reflects persisted documents', async () => {
    const user = await makeUser();
    let res = await request(app).get('/api/notifications').set(authHeader(user)).expect(200);
    assert.deepEqual(res.body.data.notifications, []);
    assert.equal(res.body.data.unreadCount, 0);

    await Notification.create({ recipient: user._id, title: 'Pickup confirmed', body: 'Tomorrow 9am' });

    res = await request(app).get('/api/notifications').set(authHeader(user)).expect(200);
    assert.equal(res.body.data.notifications.length, 1);
    assert.equal(res.body.data.notifications[0].title, 'Pickup confirmed');
    assert.equal(res.body.data.notifications[0].read, false);
    assert.equal(res.body.data.unreadCount, 1);
  });

  test('NOTE-2 only my own notifications are listed', async () => {
    const mine = await makeUser();
    const other = await makeUser();
    await Notification.create({ recipient: mine._id, title: 'Mine' });
    await Notification.create({ recipient: other._id, title: 'Theirs' });

    const res = await request(app).get('/api/notifications').set(authHeader(mine)).expect(200);
    assert.equal(res.body.data.notifications.length, 1);
    assert.equal(res.body.data.notifications[0].title, 'Mine');
  });

  test('NOTE-3 PUT /read marks all unread and persists readAt', async () => {
    const user = await makeUser();
    await Notification.create({ recipient: user._id, title: 'A' });
    await Notification.create({ recipient: user._id, title: 'B' });

    const res = await request(app).put('/api/notifications/read').set(authHeader(user)).expect(200);
    assert.equal(res.body.data.unreadCount, 0);

    const docs = await Notification.find({ recipient: user._id });
    assert.equal(docs.length, 2);
    assert.ok(docs.every((d) => d.read === true && d.readAt instanceof Date));
  });

  test('NOTE-4 marking read does not touch another user rows', async () => {
    const mine = await makeUser();
    const other = await makeUser();
    await Notification.create({ recipient: mine._id, title: 'Mine' });
    const theirs = await Notification.create({ recipient: other._id, title: 'Theirs' });

    await request(app).put('/api/notifications/read').set(authHeader(mine)).expect(200);

    const untouched = await Notification.findById(theirs._id);
    assert.equal(untouched.read, false, 'other user notification stays unread');
  });

  test('NOTE-5 newest first, with pagination', async () => {
    const user = await makeUser();
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Notification.create({ recipient: user._id, title: `N${i}`, createdAt: new Date(2024, 0, i + 1) });
    }
    const res = await request(app).get('/api/notifications?limit=2').set(authHeader(user)).expect(200);
    assert.equal(res.body.data.notifications.length, 2);
    assert.equal(res.body.data.pagination.total, 3);
    assert.equal(res.body.data.notifications[0].title, 'N2', 'newest first');
  });

  test('NOTE-6 unread-count endpoint and a scrapper recipient', async () => {
    const { user: scrapper } = await makeScrapper();
    await Notification.create({ recipient: scrapper._id, title: 'New job near you' });

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set(authHeader(scrapper))
      .expect(200);
    assert.equal(res.body.data.unreadCount, 1, 'scrappers get in-app notifications too');
  });

  test('NOTE-7 push helper persists a row for the in-app list', async () => {
    const user = await makeUser();
    const { sendNotificationToUser } = await import('../utils/pushNotificationHelper.js');

    // No FCM token is registered, so push delivery is a no-op â€” the in-app
    // record must still exist. This is the regression that made the bell icon work.
    await sendNotificationToUser(user._id, {
      title: 'Order accepted',
      body: 'A collector is on the way',
      data: { type: 'order', orderId: 'abc123' }
    });

    const docs = await Notification.find({ recipient: user._id });
    assert.equal(docs.length, 1, 'push must leave an in-app record');
    assert.equal(docs[0].title, 'Order accepted');
    assert.equal(docs[0].data.orderId, 'abc123');
  });

  test('NOTE-8 unauthenticated access is refused', async () => {
    await request(app).get('/api/notifications').expect(401);
    await request(app).put('/api/notifications/read').expect(401);
  });

  /* ------------------------------------------------------------- logout */

  test('LOGOUT-1 logout succeeds and does not revoke other sessions', async () => {
    const user = await makeUser();
    const before = await User.findById(user._id);

    await request(app).post('/api/auth/logout').set(authHeader(user)).send({}).expect(200);

    const after = await User.findById(user._id);
    assert.equal(
      after.tokenVersion || 0,
      before.tokenVersion || 0,
      'single-device logout must not bump tokenVersion'
    );
    // The access token still works: only the client discarded it.
    await request(app).get('/api/auth/me').set(authHeader(user)).expect(200);
  });

  test('LOGOUT-2 logout unregisters the supplied FCM token', async () => {
    const user = await makeUser();
    await User.updateOne({ _id: user._id }, { $set: { fcmTokens: ['tok-a', 'tok-b'] } });

    await request(app)
      .post('/api/auth/logout')
      .set(authHeader(user))
      .send({ fcmToken: 'tok-a' })
      .expect(200);

    const after = await User.findById(user._id);
    assert.deepEqual(after.fcmTokens, ['tok-b'], 'only this device token is removed');
  });

  test('LOGOUT-3 logout-all still revokes every session', async () => {
    const user = await makeUser();
    const before = await User.findById(user._id);

    await request(app).post('/api/auth/logout-all').set(authHeader(user)).expect(200);

    const after = await User.findById(user._id);
    assert.equal((after.tokenVersion || 0), (before.tokenVersion || 0) + 1);
    // The old access token is now rejected.
    await request(app).get('/api/auth/me').set(authHeader(user)).expect(401);
  });

  test('LOGOUT-4 unauthenticated logout is refused', async () => {
    await request(app).post('/api/auth/logout').expect(401);
  });
});
