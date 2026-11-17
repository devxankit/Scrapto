import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Referral } = await import('../models/Referral.js');
const { default: ReferralSetting } = await import('../models/ReferralSetting.js');
const { default: ReferralTier } = await import('../models/ReferralTier.js');
const { ORDER_STATUS } = await import('../config/constants.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, authHeader } = await import('./helpers.js');

/**
 * GET /api/referrals/me and /api/referrals/leaderboard — the read-only views the
 * user and partner apps called but the backend never served.
 */
describe('Referral views for the mobile apps', () => {
  let app;

  before(async () => {
    await startTestDb();
    await syncIndexes();
    app = buildApp();
  });
  after(async () => { await stopTestDb(); });
  beforeEach(async () => { await clearTestDb(); });

  const referee = (referrer, overrides = {}) => makeUser({ ...overrides }).then(async (u) => {
    await User.updateOne({ _id: u._id }, { $set: { referredBy: referrer._id, ...(overrides.set || {}) } });
    return User.findById(u._id);
  });

  test('REF-1 new user: own code, configured defaults, nothing earned, no tier card', async () => {
    const me = await makeUser();
    const res = await request(app).get('/api/referrals/me').set(authHeader(me)).expect(200);
    const d = res.body.data;

    assert.match(d.code, /^USER-/);
    assert.equal(d.rewardPerReferral, 50, 'userRewards.signupBonus default');
    assert.equal(d.friendReward, 25, 'userRewards.refereeWelcomeBonus default');
    assert.deepEqual(d.totals, { invited: 0, joined: 0, earned: 0 });
    assert.deepEqual(d.referrals, []);
    assert.equal(d.tier, null, 'no tiers configured -> no invented ladder');
  });

  test('REF-2 the endpoint is read-only (does not create a settings document)', async () => {
    const me = await makeUser();
    await request(app).get('/api/referrals/me').set(authHeader(me)).expect(200);
    assert.equal(await ReferralSetting.countDocuments(), 0);
  });

  test('REF-3 referees are listed with masked names and real pickup status', async () => {
    const me = await makeUser();
    const a = await referee(me, { name: 'Anil Yadav' });
    await referee(me, { name: 'Neha Gupta' });
    await makeOrder({ user: a._id, status: ORDER_STATUS.COMPLETED });

    const d = (await request(app).get('/api/referrals/me').set(authHeader(me)).expect(200)).body.data;
    assert.equal(d.totals.invited, 2);
    assert.equal(d.totals.joined, 2);
    const byName = Object.fromEntries(d.referrals.map((r) => [r.name, r]));
    assert.ok(byName['Anil Y.'], 'surname masked to an initial');
    assert.equal(byName['Anil Y.'].status, 'completed');
    assert.equal(byName['Neha G.'].status, 'joined');
    assert.equal(d.totals.earned, 0, 'no reward has actually been paid');
    assert.equal(byName['Anil Y.'].reward, 0);
  });

  test('REF-4 only rewards marked paid count as earned', async () => {
    const me = await makeUser();
    const a = await referee(me, { name: 'Anil Yadav' });
    const b = await referee(me, { name: 'Neha Gupta' });
    await Referral.create({ referrer: me._id, referee: a._id, codeUsed: me.referralCode, rewardEarned: 50, rewardStatus: 'paid' });
    await Referral.create({ referrer: me._id, referee: b._id, codeUsed: me.referralCode, rewardEarned: 50, rewardStatus: 'pending' });

    const d = (await request(app).get('/api/referrals/me').set(authHeader(me)).expect(200)).body.data;
    assert.equal(d.totals.earned, 50);
  });

  test('REF-5 scrappers see the scrapper reward configuration', async () => {
    const { user: s } = await makeScrapper();
    await ReferralSetting.create({ scrapperRewards: { signupBonus: 120, refereeWelcomeBonus: 60 } });

    const d = (await request(app).get('/api/referrals/me').set(authHeader(s)).expect(200)).body.data;
    assert.equal(d.rewardPerReferral, 120);
    assert.equal(d.friendReward, 60);
  });

  test('REF-6 tier progress follows the configured tiers', async () => {
    const me = await makeUser();
    await ReferralTier.create({ name: 'bronze', minReferrals: 1, bonusPercent: 0, monthlyBonus: 0 });
    await ReferralTier.create({ name: 'silver', minReferrals: 3, bonusPercent: 0, monthlyBonus: 200 });
    await referee(me, { name: 'Anil Yadav' });

    const d = (await request(app).get('/api/referrals/me').set(authHeader(me)).expect(200)).body.data;
    assert.deepEqual(d.tier, { name: 'Bronze', next: 'Silver', needed: 2, bonus: 200 });
  });

  test('REF-7 empty leaderboard still returns a usable "me" row', async () => {
    const me = await makeUser({ name: 'Asha Verma' });
    const d = (await request(app).get('/api/referrals/leaderboard').set(authHeader(me)).expect(200)).body.data;
    assert.deepEqual(d.leaders, []);
    assert.equal(d.me.rank, 1);
    assert.equal(d.me.referrals, 0);
    assert.equal(typeof d.month, 'string');
  });

  test('REF-8 leaderboard ranks by referrals, masks names, adds kg, scoped by role', async () => {
    const top = await makeUser({ name: 'Vikram Malhotra' });
    const second = await makeUser({ name: 'Pooja Arora' });
    for (let i = 0; i < 3; i += 1) await referee(top); // eslint-disable-line no-await-in-loop
    await referee(second);
    await makeOrder({ user: top._id, status: ORDER_STATUS.COMPLETED, scrapItems: [{ category: 'metal', weight: 42, rate: 30, total: 1260 }] });

    const { user: s } = await makeScrapper();
    await referee(s); // a partner referral must not appear on the user board

    const d = (await request(app).get('/api/referrals/leaderboard').set(authHeader(second)).expect(200)).body.data;
    assert.equal(d.leaders.length, 2);
    assert.equal(d.leaders[0].name, 'Vikram M.');
    assert.equal(d.leaders[0].referrals, 3);
    assert.equal(d.leaders[0].kg, 42);
    assert.equal(d.leaders[1].name, 'Pooja A.');
    assert.equal(d.me.rank, 2);

    const sb = (await request(app).get('/api/referrals/leaderboard').set(authHeader(s)).expect(200)).body.data;
    assert.equal(sb.leaders.length, 1, 'partner board only holds partners');
  });

  test('REF-9 auth: anonymous 401, admin 403', async () => {
    await request(app).get('/api/referrals/me').expect(401);
    const admin = await makeAdmin();
    await request(app).get('/api/referrals/me').set(authHeader(admin)).expect(403);
  });
});
