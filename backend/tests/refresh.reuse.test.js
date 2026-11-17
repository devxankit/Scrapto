import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { makeUser, refreshTokenFor, authHeader } = await import('./helpers.js');

/**
 * Found by the live API audit (AUTH-10, 2026-11-17): a refresh token stayed
 * valid after being rotated, so a stolen one worked for its whole 30-day life.
 * Refresh tokens are now single-use, with reuse detection.
 */
describe('Refresh tokens are single-use', () => {
  let app;
  before(async () => { await startTestDb(); await syncIndexes(); app = buildApp(); });
  after(async () => { await stopTestDb(); });
  beforeEach(async () => { await clearTestDb(); });

  const refresh = (rt) => request(app).post('/api/auth/refresh-token').send({ refreshToken: rt });

  /** A tracked session, obtained the way the apps obtain one (refresh migrates a legacy token). */
  const trackedSession = async (user) => (await refresh(refreshTokenFor(user)).expect(200)).body.data;

  test('RT-1 a rotated refresh token cannot be used again', async () => {
    const user = await makeUser();
    const s1 = await trackedSession(user);
    const s2 = (await refresh(s1.refreshToken).expect(200)).body.data;
    assert.notEqual(s2.refreshToken, s1.refreshToken);

    const replay = await refresh(s1.refreshToken).expect(401);
    assert.equal(replay.body.code, 'REFRESH_TOKEN_REUSED');
  });

  test('RT-2 reuse revokes every session, including the legitimate one', async () => {
    const user = await makeUser();
    const s1 = await trackedSession(user);
    const s2 = (await refresh(s1.refreshToken).expect(200)).body.data;

    await refresh(s1.refreshToken).expect(401); // attacker replays the old token

    await refresh(s2.refreshToken).expect(401);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${s2.token}`).expect(401);
    const after = await User.findById(user._id).select('+refreshSessions tokenVersion');
    assert.equal(after.refreshSessions.length, 0);
    assert.equal(after.tokenVersion, 1);
  });

  test('RT-3 two concurrent refreshes with one token: exactly one wins', async () => {
    const user = await makeUser();
    const s1 = await trackedSession(user);
    const [a, b] = await Promise.all([refresh(s1.refreshToken), refresh(s1.refreshToken)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 401]);
  });

  test('RT-4 separate devices keep separate refresh tokens', async () => {
    const user = await makeUser();
    const phone = await trackedSession(user);
    const tablet = await trackedSession(user);
    await refresh(phone.refreshToken).expect(200);
    await refresh(tablet.refreshToken).expect(200);
  });

  test('RT-5 logout revokes only this device refresh token', async () => {
    const user = await makeUser();
    const phone = await trackedSession(user);
    const tablet = await trackedSession(user);

    await request(app).post('/api/auth/logout').set(authHeader(user)).send({ refreshToken: phone.refreshToken }).expect(200);

    // The other device is unaffected...
    await refresh(tablet.refreshToken).expect(200);
    // ...and the logged-out token is dead.
    await refresh(phone.refreshToken).expect(401);
  });

  test('RT-6 logout-all clears every refresh token', async () => {
    const user = await makeUser();
    const s = await trackedSession(user);
    await request(app).post('/api/auth/logout-all').set(authHeader(user)).expect(200);
    await refresh(s.refreshToken).expect(401);
    const after = await User.findById(user._id).select('+refreshSessions');
    assert.equal(after.refreshSessions.length, 0);
  });

  test('RT-7 at most 10 device sessions are kept', async () => {
    const user = await makeUser();
    for (let i = 0; i < 12; i += 1) await trackedSession(user); // eslint-disable-line no-await-in-loop
    const after = await User.findById(user._id).select('+refreshSessions');
    assert.equal(after.refreshSessions.length, 10);
  });
});
