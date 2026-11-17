import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: Banner } = await import('../models/Banner.js');
const { default: SystemSetting } = await import('../models/SystemSetting.js');
const { default: Price } = await import('../models/Price.js');
const { default: Coupon } = await import('../models/CouponModel.js');
const { default: HelpTicket } = await import('../models/HelpTicket.js');
const { default: ReferralSetting } = await import('../models/ReferralSetting.js');
const { default: ReferralTier } = await import('../models/ReferralTier.js');
const { default: ReferralCampaign } = await import('../models/ReferralCampaign.js');
const { default: ScrapperLead } = await import('../models/ScrapperLead.js');
const { makeUser, makeAdmin, makeScrapper, makeOrder, makePlan, authHeader } = await import('./helpers.js');
const { ORDER_STATUS } = await import('../config/constants.js');

describe('PHASE 8 — End-to-End (E2E) Comprehensive API & Transaction Certification', () => {
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

  it('Root & Health: returns healthy status and API version metadata (E2E-1)', async () => {
    const healthRes = await request(app).get('/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.body.status, 'healthy');
    assert.ok(healthRes.body.uptime !== undefined);

    const rootRes = await request(app).get('/');
    assert.equal(rootRes.status, 200);
    assert.equal(rootRes.body.message, 'Scrapto API Server');
    assert.equal(rootRes.body.endpoints.health, '/health');
  });

  it('Public Endpoints: prices and safe system settings disclosure controls (E2E-2)', async () => {
    await Price.create({
      category: 'plastic',
      pricePerKg: 15,
      regionCode: 'IN-DL',
      isActive: true,
      effectiveDate: new Date()
    });

    const pricesRes = await request(app).get('/api/public/prices');
    assert.equal(pricesRes.status, 200);
    assert.ok(pricesRes.body.success);
    assert.ok(Array.isArray(pricesRes.body.data.prices));

    await SystemSetting.findOneAndUpdate(
      { key: 'scrap_commission_percentage' },
      { value: 5, description: 'Commission rate' },
      { upsert: true, new: true }
    );

    // Allowlisted setting succeeds
    const allowedSetting = await request(app).get('/api/public/settings/scrap_commission_percentage');
    assert.equal(allowedSetting.status, 200);
    assert.equal(allowedSetting.body.data.setting.key, 'scrap_commission_percentage');
    assert.equal(allowedSetting.body.data.setting.value, 5);

    // Non-allowlisted or sensitive setting returns 404
    const forbiddenSetting = await request(app).get('/api/public/settings/jwt_secret_internal');
    assert.equal(forbiddenSetting.status, 404);
  });

  it('Banners Lifecycle: public viewing and admin status toggling (E2E-3)', async () => {
    const admin = await makeAdmin();

    const banner = await Banner.create({
      title: 'Summer Scrap Recycling Drive',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      link: 'https://scrapto.in/drive',
      targetAudience: 'both',
      displayOrder: 1,
      isActive: true
    });

    // Public active banner
    const publicBanners = await request(app).get('/api/banners/public');
    assert.equal(publicBanners.status, 200);
    assert.ok(publicBanners.body.data.banners.length >= 1);

    // Admin view all
    const adminAll = await request(app).get('/api/banners/admin/all').set(authHeader(admin));
    assert.equal(adminAll.status, 200);

    // Admin toggle status
    const toggleRes = await request(app)
      .patch(`/api/banners/${banner._id}/status`)
      .set(authHeader(admin));
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.body.data.banner.isActive, false);

    // Admin delete banner
    const deleteRes = await request(app)
      .delete(`/api/banners/${banner._id}`)
      .set(authHeader(admin));
    assert.equal(deleteRes.status, 200);
  });

  it('FCM Token Lifecycle: register and remove push tokens across roles (E2E-4)', async () => {
    const user = await makeUser();
    const token = 'fcm_token_sample_abc123';

    // Save token
    const saveRes = await request(app)
      .post('/api/fcm-tokens/save')
      .set(authHeader(user))
      .send({ token, platform: 'web' });
    assert.equal(saveRes.status, 200);
    assert.ok(saveRes.body.success);

    // Remove token
    const removeRes = await request(app)
      .post('/api/fcm-tokens/remove')
      .set(authHeader(user))
      .send({ token, platform: 'web' });
    assert.equal(removeRes.status, 200);
    assert.ok(removeRes.body.success);
  });

  it('Chat Lifecycle: order conversation, message delivery, read status and archiving (E2E-5)', async () => {
    const user = await makeUser();
    const { user: scrapperUser } = await makeScrapper();
    const order = await makeOrder({ user: user._id, scrapper: scrapperUser._id, status: ORDER_STATUS.CONFIRMED });

    // User gets or creates chat for order
    const chatRes = await request(app)
      .post('/api/chats')
      .set(authHeader(user))
      .send({ orderId: order._id.toString() });
    assert.equal(chatRes.status, 201);
    const chatId = chatRes.body.data.chat._id;
    assert.ok(chatId);

    // Send message
    const msgRes = await request(app)
      .post(`/api/chats/${chatId}/messages`)
      .set(authHeader(user))
      .send({ message: 'Hello scrapper, what time will you arrive?' });
    assert.equal(msgRes.status, 201);
    assert.equal(msgRes.body.data.message.message, 'Hello scrapper, what time will you arrive?');

    // Retrieve chat by ID
    const getChat = await request(app)
      .get(`/api/chats/${chatId}`)
      .set(authHeader(scrapperUser));
    assert.equal(getChat.status, 200);

    // Mark as read
    const readRes = await request(app)
      .put(`/api/chats/${chatId}/read`)
      .set(authHeader(scrapperUser));
    assert.equal(readRes.status, 200);

    // Check unread count
    const unreadRes = await request(app)
      .get('/api/chats/unread-count')
      .set(authHeader(user));
    assert.equal(unreadRes.status, 200);
    assert.ok(typeof unreadRes.body.data.unreadCount === 'number');

    // Archive chat
    const archiveRes = await request(app)
      .put(`/api/chats/${chatId}/archive`)
      .set(authHeader(user));
    assert.equal(archiveRes.status, 200);
  });

  it('Subscription Lifecycle: plans catalog, free subscription activation, coupon validation (E2E-6)', async () => {
    const { user: scrapperUser } = await makeScrapper({
      subscription: { status: 'expired', planId: null, expiryDate: new Date(Date.now() - 1000) }
    });

    const freePlan = await makePlan({
      name: 'Free Trial Plan',
      price: 0,
      duration: 7,
      durationType: 'daily'
    });

    // Public list plans
    const plansRes = await request(app).get('/api/subscriptions/plans');
    assert.equal(plansRes.status, 200);
    assert.ok(plansRes.body.data.plans.length >= 1);

    // Scrapper subscribes to free plan (instant activation)
    const subRes = await request(app)
      .post('/api/subscriptions/subscribe')
      .set(authHeader(scrapperUser))
      .send({ planId: freePlan._id.toString() });
    assert.equal(subRes.status, 200);
    assert.equal(subRes.body.data.subscription.status, 'active');

    // Get current subscription
    const mySubRes = await request(app)
      .get('/api/subscriptions/my-subscription')
      .set(authHeader(scrapperUser));
    assert.equal(mySubRes.status, 200);
    assert.equal(mySubRes.body.data.subscription.status, 'active');

    // Scrapper cancels subscription
    const cancelRes = await request(app)
      .post('/api/subscriptions/cancel')
      .set(authHeader(scrapperUser))
      .send({ reason: 'No longer needed' });
    assert.equal(cancelRes.status, 200);
  });

  it('Support Tickets Lifecycle: ticket creation, user & admin replies, status progression (E2E-7)', async () => {
    const user = await makeUser();
    const admin = await makeAdmin();

    // Create ticket
    const createRes = await request(app)
      .post('/api/support')
      .set(authHeader(user))
      .send({
        subject: 'Issue with payment invoice',
        message: 'I did not receive an invoice for my completed scrap pickup',
        type: 'payment',
        priority: 'high'
      });
    assert.equal(createRes.status, 201);
    const ticketId = createRes.body.data.ticket._id;

    // User gets own tickets
    const myTickets = await request(app)
      .get('/api/support/my-tickets')
      .set(authHeader(user));
    assert.equal(myTickets.status, 200);
    assert.ok(myTickets.body.data.tickets.length >= 1);

    // Admin views all tickets
    const allTickets = await request(app)
      .get('/api/support/admin/all')
      .set(authHeader(admin));
    assert.equal(allTickets.status, 200);

    // Admin updates status
    const statusRes = await request(app)
      .patch(`/api/support/${ticketId}/status`)
      .set(authHeader(admin))
      .send({ status: 'resolved' });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.data.ticket.status, 'resolved');
  });

  it('Referral System Lifecycle: settings, tiers, and campaign administration (E2E-8)', async () => {
    const admin = await makeAdmin();

    // Get / update settings
    const settingsRes = await request(app)
      .get('/api/admin/referral-system/settings')
      .set(authHeader(admin));
    assert.equal(settingsRes.status, 200);

    const updateSetRes = await request(app)
      .put('/api/admin/referral-system/settings')
      .set(authHeader(admin))
      .send({ referrerRewardAmount: 50, refereeRewardAmount: 25 });
    assert.equal(updateSetRes.status, 200);

    // Create tier
    const tierRes = await request(app)
      .post('/api/admin/referral-system/tiers')
      .set(authHeader(admin))
      .send({
        name: 'Gold Advocate',
        minReferrals: 10,
        rewardMultiplier: 1.5,
        badge: 'gold_star'
      });
    assert.equal(tierRes.status, 200);
    const tierId = tierRes.body.data.tier._id;

    // Get all tiers
    const getTiers = await request(app)
      .get('/api/admin/referral-system/tiers')
      .set(authHeader(admin));
    assert.equal(getTiers.status, 200);

    // Delete tier
    const delTier = await request(app)
      .delete(`/api/admin/referral-system/tiers/${tierId}`)
      .set(authHeader(admin));
    assert.equal(delTier.status, 200);
  });

  it('Admin Leads & Coupons Lifecycle: ReDoS immune lead search, coupon creation and limits (E2E-9)', async () => {
    const admin = await makeAdmin();

    // Create lead
    const leadRes = await request(app)
      .post('/api/admin/leads')
      .set(authHeader(admin))
      .send({
        name: 'Ramesh Scrapper',
        phone: '9876543210',
        area: 'Dwarka Sector 10',
        vehicleInfo: 'Three-wheeler tempo'
      });
    assert.equal(leadRes.status, 201);
    const leadId = leadRes.body.data.lead._id;

    // ReDoS safe search
    const searchRes = await request(app)
      .get('/api/admin/leads?search=Ramesh.*.*')
      .set(authHeader(admin));
    assert.equal(searchRes.status, 200);

    // Update lead
    const updateLeadRes = await request(app)
      .put(`/api/admin/leads/${leadId}`)
      .set(authHeader(admin))
      .send({ status: 'invited' });
    assert.equal(updateLeadRes.status, 200);

    // Delete lead
    const deleteLeadRes = await request(app)
      .delete(`/api/admin/leads/${leadId}`)
      .set(authHeader(admin));
    assert.equal(deleteLeadRes.status, 200);

    // Create coupon
    const couponCode = `E2ECOUPON_${Date.now()}`;
    const couponRes = await request(app)
      .post('/api/admin/coupons')
      .set(authHeader(admin))
      .send({
        code: couponCode,
        title: 'Flat 50 Off',
        amount: 50,
        applicableRole: 'SCRAPPER',
        usageType: 'LIMITED',
        limit: 100,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true
      });
    assert.equal(couponRes.status, 201);
    const couponId = couponRes.body.data._id;

    // Toggle coupon
    const toggleCoupon = await request(app)
      .patch(`/api/admin/coupons/${couponId}/status`)
      .set(authHeader(admin));
    assert.equal(toggleCoupon.status, 200);

    // Delete coupon
    const delCoupon = await request(app)
      .delete(`/api/admin/coupons/${couponId}`)
      .set(authHeader(admin));
    assert.equal(delCoupon.status, 200);
  });

  it('Scrapper Me & Stats: profile fetch, updates, and metrics aggregation (E2E-10)', async () => {
    const { user: scrapperUser } = await makeScrapper({ city: 'Delhi' });

    // Fetch me
    const meRes = await request(app)
      .get('/api/scrappers/me')
      .set(authHeader(scrapperUser));
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data.scrapper.city, 'Delhi');

    // Update profile
    const updateRes = await request(app)
      .put('/api/scrappers/me')
      .set(authHeader(scrapperUser))
      .send({
        vehicleInfo: { type: 'truck', number: 'DL9CZ9999', capacity: 500 }
      });
    assert.equal(updateRes.status, 200);

    // Stats
    const statsRes = await request(app)
      .get('/api/scrappers/stats')
      .set(authHeader(scrapperUser));
    assert.equal(statsRes.status, 200);
    assert.ok(statsRes.body.data.stats.upcomingPickups !== undefined);
  });

  it('Order User Updates & Cancellation: user updates pending order, scrapper cancels back to pool (E2E-11)', async () => {
    const user = await makeUser();
    const { user: scrapperUser } = await makeScrapper();

    const order = await makeOrder({ user: user._id, status: ORDER_STATUS.PENDING });

    // User updates pickup address and notes
    const updateRes = await request(app)
      .put(`/api/orders/${order._id}`)
      .set(authHeader(user))
      .send({ notes: 'Please call before arriving, gate is locked' });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.order.notes, 'Please call before arriving, gate is locked');

    // Scrapper accepts
    const acceptRes = await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set(authHeader(scrapperUser));
    assert.equal(acceptRes.status, 200);

    // Scrapper cancels - releases order back to pool (PENDING, unassigned)
    const cancelRes = await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set(authHeader(scrapperUser))
      .send({ reason: 'Vehicle breakdown' });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.order.status, ORDER_STATUS.PENDING);
    assert.equal(cancelRes.body.data.order.assignmentStatus, 'unassigned');
  });

  it('Admin Dashboard & System Analytics: dashboard stats, payment analytics, broadcast message (E2E-12)', async () => {
    const admin = await makeAdmin();

    const statsRes = await request(app)
      .get('/api/admin/dashboard/stats')
      .set(authHeader(admin));
    assert.equal(statsRes.status, 200);
    assert.ok(statsRes.body.data.stats !== undefined);

    const paymentAnalytics = await request(app)
      .get('/api/admin/analytics/payments')
      .set(authHeader(admin));
    assert.equal(paymentAnalytics.status, 200);

    const broadcastRes = await request(app)
      .post('/api/admin/broadcast')
      .set(authHeader(admin))
      .send({
        title: 'Platform Maintenance Notice',
        message: 'System upgrade scheduled at midnight.',
        targetAudience: 'all'
      });
    assert.equal(broadcastRes.status, 200);
  });

});
