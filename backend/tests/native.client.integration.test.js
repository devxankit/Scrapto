import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');
const { USER_ROLES } = await import('../config/constants.js');

/**
 * End-to-end journeys driven the way the React Native apps drive them.
 *
 * This runs the real Express app over a real HTTP socket and a real MongoDB,
 * reproducing src/api/client.ts semantics: the `/api` prefix, the Bearer
 * header, the { success, message, data } envelope, 401 -> refresh -> replay,
 * and the single-flight refresh that stops concurrent 401s from revoking a
 * good session.
 *
 * It verifies CONTRACT + PERSISTENCE. It is not a device test: no React Native
 * runtime, no UI. Device-level verification remains outstanding.
 */

const TEST_PHONE_USER = '9999999999';
const TEST_PHONE_SCRAP = '8888888888';
const TEST_OTP = '123456';

describe('Native app <-> backend contract (real HTTP + MongoDB)', () => {
  let server;
  let base;

  before(async () => {
    // Fixed OTPs so a full auth journey needs no SMS provider.
    process.env.OTP_TEST_NUMBERS = `${TEST_PHONE_USER}:${TEST_OTP},${TEST_PHONE_SCRAP}:${TEST_OTP}`;

    await startTestDb();
    await syncIndexes();

    const app = buildApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  /* ------------------------------------------------------------------ */
  /* A faithful re-implementation of src/api/client.ts                  */
  /* ------------------------------------------------------------------ */

  const makeClient = () => {
    const state = { token: null, refresh: null, unauthorized: 0, refreshCalls: 0 };
    let refreshing = null;

    const rawApi = async (path, opts = {}) => {
      const { method = 'GET', body } = opts;
      const headers = { Accept: 'application/json' };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      if (body) headers['Content-Type'] = 'application/json';

      const res = await fetch(`${base}/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        // Controllers send `message`; middleware/auth.js sends `error`.
        const err = new Error(data.message || data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = data.code;
        throw err;
      }
      return data;
    };

    const refreshSession = async () => {
      state.refreshCalls += 1;
      if (!state.refresh) return false;
      const res = await fetch(`${base}/api/auth/refresh-token`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refresh })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false || !data?.data?.token) return false;
      state.token = data.data.token;
      state.refresh = data.data.refreshToken ?? state.refresh;
      return true;
    };

    const refreshOnce = () => {
      if (!refreshing) {
        refreshing = refreshSession().finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    };

    const api = async (path, opts = {}) => {
      try {
        return await rawApi(path, opts);
      } catch (e) {
        // Mirrors src/api/client.ts: a 403 carrying an account-state code is a
        // forced sign-out; ordinary authorization 403s are not.
        if (e.status === 403 && (e.code === 'ACCOUNT_DEACTIVATED' || e.code === 'SCRAPPER_BLOCKED')) {
          state.unauthorized += 1;
          throw e;
        }
        if (e.status !== 401) throw e;
        if (path.startsWith('/auth/refresh-token')) {
          state.unauthorized += 1;
          throw e;
        }
        const ok = await refreshOnce();
        if (!ok) {
          state.unauthorized += 1;
          throw e;
        }
        try {
          return await rawApi(path, opts);
        } catch (again) {
          if (again.status === 401) state.unauthorized += 1;
          throw again;
        }
      }
    };

    return { api, rawApi, state };
  };

  /** Mirrors AppStore.verifyOtp(): register when new, then verify the OTP. */
  const signUpUser = async (client, phone, role, profile) => {
    // requestOtp(): a 404 here is how the app learns the number is new.
    let isNewUser = false;
    try {
      await client.api('/auth/login-otp', { method: 'POST', body: { phone, role } });
    } catch (e) {
      if (e.status === 404) isNewUser = true;
      else throw e;
    }

    if (isNewUser) {
      await client.api('/auth/register', { method: 'POST', body: { ...profile, phone, role } });
    }

    const r = await client.api('/auth/verify-otp', {
      method: 'POST',
      body: { phone, otp: TEST_OTP, purpose: isNewUser ? 'verification' : 'login', role, profile }
    });
    client.state.token = r.data.token;
    client.state.refresh = r.data.refreshToken ?? null;
    return { isNewUser, user: r.data.user };
  };

  /* ---------------------------------------------------------- auth ---- */

  test('E2E-1 unknown phone 404s, so the app shows sign-up', async () => {
    const c = makeClient();
    await assert.rejects(
      () => c.api('/auth/login-otp', { method: 'POST', body: { phone: TEST_PHONE_USER, role: 'user' } }),
      (e) => e.status === 404,
      'login-otp must 404 for an unregistered number'
    );
  });

  test('E2E-2 full user sign-up journey persists the account', async () => {
    const c = makeClient();
    const { isNewUser, user } = await signUpUser(c, TEST_PHONE_USER, 'user', {
      name: 'Asha Verma',
      email: 'asha@test.local'
    });

    assert.equal(isNewUser, true);
    assert.ok(c.state.token, 'access token issued');
    assert.ok(c.state.refresh, 'refresh token issued â€” required for session renewal');
    assert.equal(user.phone, TEST_PHONE_USER);

    const inDb = await User.findOne({ phone: TEST_PHONE_USER });
    assert.ok(inDb, 'user row exists in MongoDB');
    assert.equal(inDb.role, USER_ROLES.USER);
    assert.equal(inDb.isPhoneVerified, true, 'OTP verification marks the phone verified');
  });

  test('E2E-3 returning user is recognised; OTP resend is rate limited', async () => {
    const first = makeClient();
    await signUpUser(first, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // A second login attempt for the SAME number inside the cooldown window is
    // refused with 429 by design (otpService: OTP_RESEND_COOLDOWN_MS = 60s).
    // The number is known, so the app would show "enter OTP", not sign-up.
    const second = makeClient();
    await assert.rejects(
      () => second.api('/auth/login-otp', { method: 'POST', body: { phone: TEST_PHONE_USER, role: 'user' } }),
      (e) => e.status === 429,
      'resend cooldown protects against OTP spam'
    );

    assert.equal(await User.countDocuments({ phone: TEST_PHONE_USER }), 1, 'no duplicate account');
  });

  test('E2E-3b a known number returns 200 (not 404), so the app skips sign-up', async () => {
    // Seed the account directly to avoid the resend cooldown entirely.
    await User.create({
      name: 'Known User',
      email: 'known@test.local',
      phone: TEST_PHONE_SCRAP,
      role: USER_ROLES.USER,
      isPhoneVerified: true,
      isVerified: true,
      isActive: true
    });

    const c2 = makeClient();
    const r = await c2.api('/auth/login-otp', {
      method: 'POST',
      body: { phone: TEST_PHONE_SCRAP, role: 'user' }
    });
    assert.equal(r.success, true, 'known number -> 200, so isNewUser stays false');
  });

  test('E2E-4 session restores after an app restart (/auth/me)', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // Restart: a fresh client rehydrating the tokens from AsyncStorage.
    const restarted = makeClient();
    restarted.state.token = c.state.token;
    restarted.state.refresh = c.state.refresh;

    const me = await restarted.api('/auth/me');
    assert.equal(me.data.user.phone, TEST_PHONE_USER);
  });

  test('E2E-5 expired/invalid access token is refreshed and the call replays', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // Simulate expiry: keep a valid refresh token, break the access token.
    c.state.token = 'not-a-valid-token';

    const me = await c.api('/auth/me');
    assert.equal(me.data.user.phone, TEST_PHONE_USER, 'request succeeded after refresh');
    assert.equal(c.state.unauthorized, 0, 'user was NOT signed out');
    assert.notEqual(c.state.token, 'not-a-valid-token', 'access token was replaced');
  });

  test('E2E-6 concurrent 401s trigger exactly one refresh (no sign-out storm)', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });
    c.state.token = 'not-a-valid-token';

    // Six parallel calls, as a screen with several widgets would fire.
    const results = await Promise.all([
      c.api('/auth/me'),
      c.api('/addresses'),
      c.api('/notifications'),
      c.api('/wallet/profile'),
      c.api('/orders/my-orders'),
      c.api('/auth/me')
    ]);

    assert.equal(results.length, 6);
    assert.ok(results.every((r) => r.success), 'every request recovered');
    assert.equal(
      c.state.refreshCalls,
      1,
      'refresh token rotates, so concurrent 401s MUST share one refresh'
    );
    assert.equal(c.state.unauthorized, 0, 'no spurious sign-out');
  });

  test('E2E-7 no refresh token means a clean sign-out, not a retry loop', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });
    c.state.token = 'not-a-valid-token';
    c.state.refresh = null;

    await assert.rejects(() => c.api('/auth/me'), (e) => e.status === 401);
    assert.equal(c.state.unauthorized, 1, 'exactly one sign-out signal');
  });

  test('E2E-8 logout-all revokes the session; refresh cannot resurrect it', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    await c.api('/auth/logout-all', { method: 'POST' });

    const stale = makeClient();
    stale.state.token = 'not-a-valid-token';
    stale.state.refresh = c.state.refresh;
    await assert.rejects(() => stale.api('/auth/me'), (e) => e.status === 401);
    assert.equal(stale.state.unauthorized, 1);
  });

  /* ------------------------------------------------- user journey ---- */

  test('E2E-9 address book: save, list and reuse for a pickup', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    const created = await c.api('/addresses', {
      method: 'POST',
      body: {
        type: 'home',
        label: 'Home',
        street: '12 Green Park',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110016',
        coordinates: { lat: 28.6139, lng: 77.209 }
      }
    });
    assert.equal(created.data.address.isDefault, true);

    const list = await c.api('/addresses');
    assert.equal(list.data.addresses.length, 1);

    const inDb = await User.findOne({ phone: TEST_PHONE_USER }).select('addresses');
    assert.equal(inDb.addresses[0].street, '12 Green Park', 'persisted in MongoDB');
  });

  test('E2E-10 notifications list and mark-read round trip', async () => {
    const c = makeClient();
    const { user } = await signUpUser(c, TEST_PHONE_USER, 'user', {
      name: 'Asha',
      email: 'asha@test.local'
    });

    await Notification.create({ recipient: user._id, title: 'Pickup confirmed', body: 'Tomorrow 9am' });

    const before = await c.api('/notifications');
    assert.equal(before.data.notifications.length, 1);
    assert.equal(before.data.unreadCount, 1);

    await c.api('/notifications/read', { method: 'PUT' });

    const after = await c.api('/notifications');
    assert.equal(after.data.unreadCount, 0, 'bell badge clears');
    assert.equal(after.data.notifications[0].read, true);
  });

  test('E2E-11 wallet profile returns the real balance envelope', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    const w = await c.api('/wallet/profile');
    assert.equal(w.success, true);
    assert.equal(typeof w.data.balance, 'number', 'screens read data.balance');
  });

  test('E2E-12 orders list is empty and correctly shaped for a new user', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    const r = await c.api('/orders/my-orders');
    assert.equal(r.success, true);
    assert.ok(Array.isArray(r.data.orders), 'screens map over data.orders');
  });

  /* --------------------------------------------- role separation ---- */

  test('E2E-13 a user token cannot reach scrapper endpoints', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    await assert.rejects(() => c.api('/scrappers/me'), (e) => e.status === 403);
    await assert.rejects(() => c.api('/orders/available'), (e) => e.status === 403);
  });

  test('E2E-14 wrong-portal login is refused with a clear message', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // The partner app sends role: 'scrapper' for a number registered as a user.
    const partner = makeClient();
    await assert.rejects(
      () => partner.api('/auth/login-otp', { method: 'POST', body: { phone: TEST_PHONE_USER, role: 'scrapper' } }),
      (e) => e.status === 400 && /user portal/i.test(e.message),
      'must explain the number belongs to the other portal'
    );
  });

  test('E2E-15 a blocked account cannot use its existing token', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });
    await c.api('/auth/me');

    // Admin blocks the account (bumping tokenVersion revokes live tokens).
    await User.updateOne(
      { phone: TEST_PHONE_USER },
      { $set: { isActive: false }, $inc: { tokenVersion: 1 } }
    );

    // The backend answers 403 (not 401) for a deactivated account.
    // Documented so the apps can treat it as a forced sign-out: client.ts only
    // calls onUnauthorized() for 401, so a blocked user would otherwise keep a
    // dead session on screen.
    await assert.rejects(
      () => c.api('/auth/me'),
      (e) => e.status === 403 || e.status === 401,
      'a blocked account must lose access'
    );
  });

  test('E2E-16 single-device logout keeps other devices signed in', async () => {
    const phoneA = makeClient();
    await signUpUser(phoneA, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // Same account on a second device.
    const phoneB = makeClient();
    phoneB.state.token = phoneA.state.token;
    phoneB.state.refresh = phoneA.state.refresh;

    await phoneA.api('/auth/logout', { method: 'POST', body: {} });

    const still = await phoneB.api('/auth/me');
    assert.equal(still.data.user.phone, TEST_PHONE_USER, 'other device unaffected');
  });
test('E2E-17 a deactivated account is signed out, not left on a dead session', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });
    await c.api('/auth/me');

    await User.updateOne({ phone: TEST_PHONE_USER }, { $set: { isActive: false } });

    await assert.rejects(
      () => c.api('/auth/me'),
      (e) => e.status === 403 && e.code === 'ACCOUNT_DEACTIVATED',
      'backend must send a machine-readable account-state code'
    );
    assert.equal(c.state.unauthorized, 1, 'the app signs the blocked user out');
  });

  test('E2E-18 an ordinary role 403 does NOT sign the user out', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });

    // A user hitting a scrapper-only route: refused, but still signed in.
    await assert.rejects(() => c.api('/scrappers/me'), (e) => e.status === 403);
    assert.equal(c.state.unauthorized, 0, 'authorization 403 must not end the session');

    const me = await c.api('/auth/me');
    assert.equal(me.data.user.phone, TEST_PHONE_USER, 'session survived');
  });

  test('E2E-19 middleware refusals carry a human-readable reason', async () => {
    const c = makeClient();
    await signUpUser(c, TEST_PHONE_USER, 'user', { name: 'Asha', email: 'asha@test.local' });
    await User.updateOne({ phone: TEST_PHONE_USER }, { $set: { isActive: false } });

    await assert.rejects(
      () => c.api('/auth/me'),
      (e) => /deactivated/i.test(e.message),
      'the app must be able to show why access was refused'
    );
  });
});
