import test, { before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { makeUser, makeAdmin, makeScrapper, tokenFor, refreshTokenFor, authHeader } = await import('./helpers.js');
const { issueOtp, hashOtp, OTP_MAX_ATTEMPTS } = await import('../utils/otpService.js');

let app;

before(async () => {
  await startTestDb();
  app = buildApp();
  await syncIndexes();
});
after(stopTestDb);
beforeEach(clearTestDb);

const OTP_SELECT = '+phoneVerificationOTP +otpExpiresAt +otpAttempts +otpLastSentAt +otpSendWindowStart +otpSendCount';

/** Register then read the OTP hash to derive a valid code for assertions. */
const registerAndGetOtp = async (payload) => {
  const res = await request(app).post('/api/v1/auth/register').send(payload);
  const user = await User.findOne({ phone: payload.phone }).select(OTP_SELECT);
  return { res, user };
};

/** Find the plaintext OTP matching a stored hash (test-only brute force over issued code). */
const resolveOtp = async (phone) => {
  const user = await User.findOne({ phone }).select(OTP_SELECT);
  // We cannot reverse the HMAC, so set a known OTP instead.
  const known = '424242';
  user.phoneVerificationOTP = hashOtp(phone, known);
  user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.otpAttempts = 0;
  await user.save();
  return known;
};

describe('PHASE 1 — authentication & privilege escalation', () => {
  test('registration cannot self-assign the admin role (REG-1)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Attacker',
      email: 'attacker@test.local',
      phone: '9123456780',
      password: 'Secret123!',
      role: 'admin'
    });
    assert.equal(res.status, 400);
    const created = await User.findOne({ email: 'attacker@test.local' });
    assert.equal(created, null, 'no account should be created for an invalid role');
  });

  test('registration ignores an object role (NoSQL injection attempt)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Injector',
      email: 'inject@test.local',
      phone: '9123456781',
      password: 'Secret123!',
      role: { $ne: 'user' }
    });
    assert.equal(res.status, 400);
  });

  test('registration does NOT return a session token before phone verification (REG-2)', async () => {
    const { res } = await registerAndGetOtp({
      name: 'New User',
      email: 'newuser@test.local',
      phone: '9123456782',
      password: 'Secret123!'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.token, undefined, 'no access token before verification');
    assert.equal(res.body.data.requiresVerification, true);
  });

  test('verify-otp cannot escalate an existing user to scrapper or admin (OTP-1)', async () => {
    const user = await makeUser({ phone: '9123456783', role: 'user' });
    const otp = await resolveOtp(user.phone);

    // Attempt cross-role verification
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: user.phone, otp, role: 'scrapper' });

    assert.equal(res.status, 400);
    const after = await User.findById(user._id);
    assert.equal(after.role, 'user', 'role must NOT be rewritten by the client');
  });

  test('hardcoded OTPs 123456 / 110211 are rejected in test/production config (OTP-2)', async () => {
    const user = await makeUser({ phone: '7610416911' });
    await resolveOtp(user.phone); // issues 424242 as the only valid code

    for (const legacy of ['123456', '110211']) {
      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: user.phone, otp: legacy });
      assert.equal(res.status, 400, `legacy OTP ${legacy} must be rejected`);
    }
  });

  test('OTP is single-use (OTP-3)', async () => {
    const user = await makeUser({ phone: '9123456784' });
    const otp = await resolveOtp(user.phone);

    const first = await request(app).post('/api/v1/auth/verify-otp').send({ phone: user.phone, otp });
    assert.equal(first.status, 200);
    assert.ok(first.body.data.token, 'verification issues a token');

    const replay = await request(app).post('/api/v1/auth/verify-otp').send({ phone: user.phone, otp });
    assert.equal(replay.status, 400, 'the same OTP must not verify twice');
  });

  test('OTP brute force is capped at OTP_MAX_ATTEMPTS (OTP-4)', async () => {
    const user = await makeUser({ phone: '9123456785' });
    const otp = await resolveOtp(user.phone);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: user.phone, otp: '000000' });
      assert.equal(res.status, 400);
    }
    // Even the CORRECT code must now fail: the OTP was invalidated.
    const res = await request(app).post('/api/v1/auth/verify-otp').send({ phone: user.phone, otp });
    assert.equal(res.status, 400, 'OTP must be invalidated after too many attempts');
  });

  test('OTP is not stored in plaintext (OTP-5)', async () => {
    const user = await makeUser({ phone: '9123456786' });
    const otp = await resolveOtp(user.phone);
    const stored = await User.findById(user._id).select(OTP_SELECT);
    assert.notEqual(stored.phoneVerificationOTP, otp);
    assert.match(stored.phoneVerificationOTP, /^[a-f0-9]{64}$/, 'stored value is an HMAC digest');
  });

  test('OTP resend is throttled per account (OTP-6)', async () => {
    const user = await makeUser({ phone: '9123456787' });
    const first = await request(app).post('/api/v1/auth/resend-otp').send({ phone: user.phone });
    assert.equal(first.status, 200);
    const second = await request(app).post('/api/v1/auth/resend-otp').send({ phone: user.phone });
    assert.equal(second.status, 429, 'resend within cooldown must be rejected');
  });

  test('scrapper registration starts with KYC not verified (KYC-1)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'New Scrapper',
      email: 'scrapper1@test.local',
      phone: '9123456788',
      password: 'Secret123!',
      role: 'scrapper',
      city: 'Delhi'
    });
    assert.equal(res.status, 201);
    const scrapper = await Scrapper.findOne({ phone: '9123456788' });
    assert.ok(scrapper);
    assert.equal(scrapper.kyc.status, 'not_submitted', 'KYC must NOT default to verified');
  });

  test('blocked account cannot use an existing token (AUTH-1)', async () => {
    const user = await makeUser({ phone: '9123456789' });
    const token = tokenFor(user);

    const before = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(before.status, 200);

    // Admin blocks the account (bumps tokenVersion + isActive=false)
    user.isActive = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const after = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.ok(after.status === 401 || after.status === 403, `expected 401/403, got ${after.status}`);
  });

  test('token issued before a tokenVersion bump is revoked (AUTH-2)', async () => {
    const user = await makeUser({ phone: '9123456770' });
    const token = tokenFor(user);
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'TOKEN_REVOKED');
  });

  test('a refresh token cannot be used as an access token (AUTH-3)', async () => {
    const user = await makeUser({ phone: '9123456771' });
    const refresh = refreshTokenFor(user);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${refresh}`);
    assert.equal(res.status, 401, 'separate secrets + typ claim must reject this');
  });

  test('access and refresh secrets are distinct (AUTH-4)', () => {
    assert.notEqual(process.env.JWT_SECRET, process.env.JWT_REFRESH_SECRET);
  });

  test('refresh-token rotation works and respects revocation (AUTH-5)', async () => {
    const user = await makeUser({ phone: '9123456772' });
    const refresh = refreshTokenFor(user);

    const ok = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: refresh });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.token);
    assert.ok(ok.body.data.refreshToken);

    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    const revoked = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: refresh });
    assert.equal(revoked.status, 401);
  });

  test('password login is rejected for non-admin accounts (AUTH-6)', async () => {
    await makeUser({ phone: '9123456773', email: 'otponly@test.local', password: 'Secret123!' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'otponly@test.local', password: 'Secret123!' });
    assert.equal(res.status, 400);
  });

  test('admin password login succeeds and returns a usable token (AUTH-7)', async () => {
    const admin = await makeAdmin({ email: 'admin1@test.local', phone: '9123456774', password: 'AdminPass123!' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin1@test.local', password: 'AdminPass123!' });
    assert.equal(res.status, 200);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.role, 'admin');
    assert.equal(admin.role, 'admin');
  });

  test('wrong admin password locks the account after repeated failures (AUTH-8)', async () => {
    await makeAdmin({ email: 'admin2@test.local', phone: '9123456775', password: 'AdminPass123!' });
    let lastStatus;
    for (let i = 0; i < 9; i += 1) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin2@test.local', password: 'wrong-password' });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 423, 'account should be temporarily locked');
  });

  test('unchanged password is not re-hashed on save (MODEL-1)', async () => {
    const admin = await makeAdmin({ email: 'admin3@test.local', phone: '9123456776', password: 'AdminPass123!' });
    const withHash = await User.findById(admin._id).select('+password');
    const originalHash = withHash.password;

    withHash.name = 'Renamed Admin';
    await withHash.save();

    const after = await User.findById(admin._id).select('+password');
    assert.equal(after.password, originalHash, 'hash must be stable when password is untouched');
    assert.equal(await after.matchPassword('AdminPass123!'), true, 'password still verifies');
  });

  test('user JSON never leaks secrets (PRIV-1)', async () => {
    const admin = await makeAdmin({ email: 'admin4@test.local', phone: '9123456777', password: 'AdminPass123!' });
    const res = await request(app).get('/api/v1/auth/me').set(authHeader(admin));
    const body = JSON.stringify(res.body);
    for (const field of ['password', 'phoneVerificationOTP', 'tokenVersion', 'fcmTokens', 'resetPasswordToken']) {
      assert.ok(!body.includes(field), `${field} must not be serialised`);
    }
  });

  test('admin role cannot be assigned via the self profile endpoint (ESC-1)', async () => {
    const user = await makeUser({ phone: '9123456778' });
    const res = await request(app)
      .put('/api/v1/auth/profile')
      .set(authHeader(user))
      .send({ name: 'Still A User', role: 'admin', isActive: true, wallet: { balance: 99999 } });
    assert.equal(res.status, 200);
    const after = await User.findById(user._id);
    assert.equal(after.role, 'user');
    assert.equal(after.wallet.balance, 0, 'wallet must not be settable by the client');
  });

  test('NoSQL operator injection in login-otp role is neutralised (INJ-1)', async () => {
    await makeScrapper({ user: { phone: '9123456760' } });
    const res = await request(app)
      .post('/api/v1/auth/login-otp')
      .send({ phone: '9123456760', role: { $ne: null } });
    // Falls back to 'user' and reports the portal mismatch rather than matching anything.
    assert.ok([400, 404].includes(res.status), `expected 400/404, got ${res.status}`);
  });

  test('logout-all revokes every outstanding token (AUTH-9)', async () => {
    const user = await makeUser({ phone: '9123456761' });
    const token = tokenFor(user);

    const logout = await request(app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${token}`);
    assert.equal(logout.status, 200);

    const after = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(after.status, 401);
  });
});
