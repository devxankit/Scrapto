import User from '../models/User.js';
import Scrapper from '../models/Scrapper.js';
import Order from '../models/Order.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { generateToken, generateRefreshToken } from '../utils/generateToken.js';
import { ORDER_STATUS, USER_ROLES, ORDER_TYPES } from '../config/constants.js';

let counter = 0;
const nextSuffix = () => {
  counter += 1;
  return String(10000000 + counter);
};

export const makeUser = async (overrides = {}) => {
  const suffix = nextSuffix();
  const user = await User.create({
    name: overrides.name || `Test User ${suffix}`,
    email: overrides.email || `user${suffix}@test.local`,
    phone: overrides.phone || `9${suffix}0`.slice(0, 10),
    role: overrides.role || USER_ROLES.USER,
    isPhoneVerified: overrides.isPhoneVerified !== undefined ? overrides.isPhoneVerified : true,
    isVerified: true,
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...(overrides.password ? { password: overrides.password } : {}),
    ...(overrides.wallet ? { wallet: overrides.wallet } : {})
  });
  return user;
};

export const makeAdmin = async (overrides = {}) =>
  makeUser({ role: USER_ROLES.ADMIN, password: overrides.password || 'AdminPass123!', ...overrides });

export const makeScrapper = async (overrides = {}) => {
  const user = await makeUser({ role: USER_ROLES.SCRAPPER, ...overrides.user });
  const scrapper = await Scrapper.create({
    _id: user._id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    city: overrides.city !== undefined ? overrides.city : 'Delhi',
    vehicleInfo: overrides.vehicleInfo || { type: 'bike', number: 'DL1AB1234', capacity: 100 },
    kyc: { status: overrides.kycStatus || 'verified' },
    status: overrides.status || 'active',
    isOnline: overrides.isOnline !== undefined ? overrides.isOnline : true,
    wallet: overrides.wallet || { balance: 5000, currency: 'INR', status: 'ACTIVE' },
    liveLocation: overrides.liveLocation || { type: 'Point', coordinates: [77.209, 28.6139], updatedAt: new Date() },
    subscription: overrides.subscription || {
      status: 'active',
      planId: null,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usedPickups: 0
    }
  });
  return { user, scrapper };
};

export const makePlan = async (overrides = {}) =>
  SubscriptionPlan.create({
    name: overrides.name || 'Test Plan',
    price: overrides.price !== undefined ? overrides.price : 199,
    duration: overrides.duration || 1,
    durationType: overrides.durationType || 'monthly',
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    maxPickups: overrides.maxPickups !== undefined ? overrides.maxPickups : null,
    maxMarketplaceRequests: overrides.maxMarketplaceRequests !== undefined ? overrides.maxMarketplaceRequests : null
  });

export const makeOrder = async (overrides = {}) => {
  const items = overrides.scrapItems || [{ category: 'metal', weight: 10, rate: 30, total: 300 }];
  const totalAmount = overrides.totalAmount !== undefined
    ? overrides.totalAmount
    : items.reduce((s, i) => s + i.total, 0);
  return Order.create({
    user: overrides.user,
    scrapper: overrides.scrapper || null,
    orderType: overrides.orderType || ORDER_TYPES.SCRAP_SELL,
    scrapItems: items,
    totalWeight: items.reduce((s, i) => s + i.weight, 0),
    totalAmount,
    status: overrides.status || ORDER_STATUS.PENDING,
    paymentStatus: overrides.paymentStatus || 'pending',
    assignmentStatus: overrides.assignmentStatus || (overrides.scrapper ? 'accepted' : 'unassigned'),
    pickupAddress: overrides.pickupAddress || {
      street: '1 Test Road',
      city: 'Delhi',
      state: 'DL',
      pincode: '110001',
      coordinates: { lat: 28.6139, lng: 77.209 }
    },
    location: overrides.location || { type: 'Point', coordinates: [77.209, 28.6139] }
  });
};

/** Bearer token for a user document (uses the real token pipeline). */
export const tokenFor = (user) => generateToken(user._id, user.role, user.tokenVersion || 0);
export const refreshTokenFor = (user) => generateRefreshToken(user._id, user.tokenVersion || 0);
export const authHeader = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
