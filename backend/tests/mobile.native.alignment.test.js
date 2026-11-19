import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDb, stopTestDb, clearTestDb, syncIndexes } from './setup.js';

const { default: request } = await import('supertest');
const { buildApp } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Scrapper } = await import('../models/Scrapper.js');
const { default: Order } = await import('../models/Order.js');
const { default: Price } = await import('../models/Price.js');
const { default: Review } = await import('../models/Review.js');
const { default: Chat } = await import('../models/Chat.js');
const { default: Message } = await import('../models/Message.js');
const { default: SubscriptionPlan } = await import('../models/SubscriptionPlan.js');
const { default: Banner } = await import('../models/Banner.js');
const { makeUser, makeScrapper, authHeader } = await import('./helpers.js');
const { ORDER_STATUS, PAYMENT_STATUS, PRICE_TYPES } = await import('../config/constants.js');

describe('Mobile React Native End-to-End Alignment Suite', () => {
  let app;
  let customerUser, scrapperUser, scrapperDoc, activePlan;

  before(async () => {
    await startTestDb();
    await syncIndexes();
    app = buildApp();

    // 1. Customer
    customerUser = await makeUser({
      name: 'Priya Sharma',
      phone: '+919876543210',
      role: 'user',
      isPhoneVerified: true
    });

    // 2. Scrapper User & Scrapper document
    const { user, scrapper } = await makeScrapper({
      name: 'Ramesh Patel',
      phone: '+919876543211',
      city: 'Delhi',
      status: 'active',
      isOnline: true,
      kyc: { status: 'verified' }
    });
    scrapperUser = user;
    scrapperDoc = scrapper;

    // 3. Plan
    activePlan = await SubscriptionPlan.create({
      name: 'Partner Pro',
      price: 199,
      duration: 1,
      durationType: 'monthly',
      type: 'general',
      isActive: true,
      features: ['Pickup requests']
    });

    scrapperDoc.subscription = {
      status: 'active',
      planId: activePlan._id,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    scrapperDoc.liveLocation = {
      type: 'Point',
      coordinates: [77.2090, 28.6139] // Delhi
    };
    await scrapperDoc.save();

    // 4. Prices
    await Price.create({
      category: 'newspaper',
      pricePerKg: 14,
      price: 14,
      regionCode: 'IN-DL',
      type: PRICE_TYPES.MATERIAL,
      isActive: true,
      effectiveDate: new Date()
    });
    await Price.create({
      category: 'copper',
      pricePerKg: 450,
      price: 450,
      regionCode: 'IN-DL',
      type: PRICE_TYPES.MATERIAL,
      isActive: true,
      effectiveDate: new Date()
    });
  });

  after(async () => {
    await stopTestDb();
  });

  test('MOBILE-1: Scrapper goes online passing mobile lat/lng format', async () => {
    const res = await request(app)
      .put('/api/scrappers/me')
      .set(authHeader(scrapperUser))
      .send({
        isOnline: true,
        liveLocation: { lat: 28.6200, lng: 77.2100 }
      });

    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.data.scrapper.isOnline, true);

    const reloaded = await Scrapper.findById(scrapperUser._id);
    assert.equal(reloaded.isOnline, true);
    assert.equal(reloaded.liveLocation.coordinates[0], 77.2100);
    assert.equal(reloaded.liveLocation.coordinates[1], 28.6200);
  });

  test('MOBILE-2: /scrappers/stats returns mobile-aligned metrics and 7-day trend', async () => {
    const res = await request(app)
      .get('/api/scrappers/stats')
      .set(authHeader(scrapperUser));

    assert.equal(res.status, 200);
    const s = res.body.data.stats;
    assert.ok(Array.isArray(s.days), 'days must be an array');
    assert.equal(s.days.length, 7, 'days must have 7 elements');
    assert.ok(typeof s.week === 'number', 'week must be a number');
    assert.ok(typeof s.previousWeek === 'number', 'previousWeek must be a number');
    assert.ok(typeof s.myOpenBids === 'number', 'myOpenBids must be a number');
    assert.ok(typeof s.openLots === 'number', 'openLots must be a number');
    assert.ok(typeof s.completedOrders === 'number', 'completedOrders must be a number');
    assert.ok(typeof s.rating === 'number', 'rating must be a number');
  });

  test('MOBILE-3: Order Lifecycle — Order creation, Radar, Skip, Accept', async () => {
    // Customer creates order
    const orderRes = await request(app)
      .post('/api/orders')
      .set(authHeader(customerUser))
      .send({
        scrapItems: [
          { category: 'newspaper', weight: 10 }
        ],
        pickupAddress: {
          street: '12 Connaught Place',
          city: 'Delhi',
          state: 'IN-DL',
          pincode: '110001',
          coordinates: { lat: 28.6315, lng: 77.2167 },
          location: { type: 'Point', coordinates: [77.2167, 28.6315] }
        }
      });

    assert.equal(orderRes.status, 201, orderRes.body.message);
    const order = orderRes.body.data.order;
    assert.ok(order.orderNo, 'Order must have orderNo generated');

    // Scrapper checks available orders: order should appear with distanceKm
    let availRes = await request(app)
      .get('/api/orders/available')
      .set(authHeader(scrapperUser));

    assert.equal(availRes.status, 200);
    const available = availRes.body.data.orders;
    const found = available.find(o => o._id === order._id);
    assert.ok(found, 'Order must appear in available orders');
    assert.ok(typeof found.distanceKm === 'number', 'distanceKm must be computed');

    // Scrapper skips order: POST /orders/:id/skip
    const skipRes = await request(app)
      .post(`/api/orders/${order._id}/skip`)
      .set(authHeader(scrapperUser));

    assert.equal(skipRes.status, 200);

    // Available orders should no longer include skipped order
    availRes = await request(app)
      .get('/api/orders/available')
      .set(authHeader(scrapperUser));

    const foundAfterSkip = availRes.body.data.orders.find(o => o._id === order._id);
    assert.equal(foundAfterSkip, undefined, 'Skipped order must not appear in available orders');

    // Scrapper accepts the order
    const acceptRes = await request(app)
      .post(`/api/orders/${order._id}/accept`)
      .set(authHeader(scrapperUser));

    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.data.order.status, ORDER_STATUS.CONFIRMED);
  });

  test('MOBILE-4: Scrapper Arrives -> Weighs items -> Pays -> Completes', async () => {
    const order = await Order.findOne({ user: customerUser._id, status: ORDER_STATUS.CONFIRMED });
    assert.ok(order);

    // Step 0 -> Step 1: Arrive
    const arriveRes = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.IN_PROGRESS });

    assert.equal(arriveRes.status, 200);
    assert.equal(arriveRes.body.data.order.status, ORDER_STATUS.IN_PROGRESS);

    // Step 1 -> Step 2: Weigh scrap (mobile sends ONLY scrapItems without status)
    const weighRes = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({
        scrapItems: [
          { category: 'newspaper', weight: 15 },
          { category: 'copper', weight: 2 }
        ]
      });

    assert.equal(weighRes.status, 200, weighRes.body.message);
    const weighedOrder = weighRes.body.data.order;
    assert.ok(weighedOrder.weighedAt, 'weighedAt must be recorded');
    assert.equal(weighedOrder.totalWeight, 17); // 15 + 2
    // 15*14 (210) + 2*450 (900) = 1110
    assert.equal(weighedOrder.totalAmount, 1110);

    // Step 2 -> Step 3: Pay customer (mobile sends status, paymentStatus, paidAmount)
    const payRes = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({
        status: ORDER_STATUS.IN_PROGRESS,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        paidAmount: 1110
      });

    assert.equal(payRes.status, 200);
    const paidOrder = payRes.body.data.order;
    assert.equal(paidOrder.paymentStatus, PAYMENT_STATUS.COMPLETED);
    assert.equal(paidOrder.paidAmount, 1110);

    // Step 3 -> Step 4: Complete pickup
    const completeRes = await request(app)
      .put(`/api/orders/${order._id}/status`)
      .set(authHeader(scrapperUser))
      .send({ status: ORDER_STATUS.COMPLETED });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.data.order.status, ORDER_STATUS.COMPLETED);
  });

  test('MOBILE-5: Customer Reviews Completed Order (no scrapperId required in payload)', async () => {
    const order = await Order.findOne({ user: customerUser._id, status: ORDER_STATUS.COMPLETED });
    assert.ok(order);

    // User submits review matching React Native user-app payload
    const reviewRes = await request(app)
      .post('/api/reviews')
      .set(authHeader(customerUser))
      .send({
        orderId: order._id.toString(),
        rating: 5,
        tags: ['On time', 'Fair weighing', 'Polite'],
        comment: 'Very polite and weighed accurately!',
        title: 'Excellent'
      });

    assert.equal(reviewRes.status, 201, reviewRes.body.message);
    const rev = reviewRes.body.data.review || reviewRes.body.data;
    assert.equal(rev.rating, 5);

    // Order must be marked reviewed
    const updatedOrder = await Order.findById(order._id);
    assert.equal(updatedOrder.reviewed, true);
    assert.ok(updatedOrder.review);

    // Scrapper rating must be live and updated
    const updatedScrapper = await Scrapper.findById(scrapperUser._id);
    assert.equal(updatedScrapper.rating.count, 1);
    assert.equal(updatedScrapper.rating.average, 5);
  });

  test('MOBILE-6: Chat Thread and Chat List Alignment', async () => {
    const order = await Order.findOne({ user: customerUser._id, status: ORDER_STATUS.COMPLETED });

    // Open chat for order
    const chatRes = await request(app)
      .get(`/api/chats/order/${order._id}`)
      .set(authHeader(customerUser));

    assert.equal(chatRes.status, 200);
    const chat = chatRes.body.data.chat;
    assert.ok(chat._id);
    assert.ok(chat.participant, 'chat.participant must be present');
    assert.equal(chat.participant.name, scrapperUser.name);

    // Send a message
    const sendRes = await request(app)
      .post(`/api/chats/${chat._id}/messages`)
      .set(authHeader(customerUser))
      .send({ message: 'Hello Ramesh, when can you reach?' });

    assert.equal(sendRes.status, 201);

    // Customer views chat list: GET /chats
    const listRes = await request(app)
      .get('/api/chats')
      .set(authHeader(customerUser));

    assert.equal(listRes.status, 200);
    const chats = listRes.body.data.chats;
    assert.ok(chats.length > 0);
    const item = chats[0];
    assert.ok(Array.isArray(item.messages), 'item.messages must be an array');
    assert.ok(item.messages.length > 0);
    assert.equal(item.messages[0].text, 'Hello Ramesh, when can you reach?');
    assert.equal(item.messages[0].from, 'me');
    assert.equal(item.participant.name, scrapperUser.name);
    assert.ok(item.orderNo);

    // Scrapper views chat list
    const scrapperListRes = await request(app)
      .get('/api/chats')
      .set(authHeader(scrapperUser));

    assert.equal(scrapperListRes.status, 200);
    const sItem = scrapperListRes.body.data.chats[0];
    assert.equal(sItem.participant.name, customerUser.name);
    assert.equal(sItem.messages[0].from, 'them');
  });

  test('MOBILE-7: Public Banners Alignment', async () => {
    await Banner.create({
      title: 'Free doorstep pickup',
      subtitle: 'Weighed at your door, paid on UPI',
      image: 'bannerPickup',
      imageUrl: 'bannerPickup',
      link: 'sell',
      targetAudience: 'both',
      isActive: true
    });

    const res = await request(app).get('/api/banners/public?audience=user');
    assert.equal(res.status, 200);
    const banners = res.body.data.banners;
    assert.ok(banners.length > 0);
    assert.equal(banners[0].image, 'bannerPickup');
    assert.equal(banners[0].subtitle, 'Weighed at your door, paid on UPI');
  });

  test('MOBILE-8: Subscription Plans type query filter', async () => {
    const res = await request(app).get('/api/subscriptions/plans?type=general');
    assert.equal(res.status, 200);
    const plans = res.body.data.plans;
    assert.ok(plans.length > 0);
    assert.equal(plans[0].name, 'Partner Pro');
  });
});
