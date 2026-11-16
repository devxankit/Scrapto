/**
 * Mock backend for the Partner app's first build (USE_MOCK in client.ts).
 *
 * Answers the same paths with the same `{ success, message, data }` shapes as
 * the Express backend (backend/routes + controllers, scrapper side), so
 * switching to the real server changes nothing in the screens. State is kept
 * on the phone (AsyncStorage). Clearly demo:
 *  - any 6-digit OTP works
 *  - KYC is approved by itself about 8 s after it is submitted
 *  - no real payment is taken (plans, top-ups and withdrawals are simulated)
 *  - while online, a new nearby pickup request arrives about every 40 s
 *  - the sample customer replies in chat a moment after you write
 *
 * Endpoints marked PROPOSED do not exist on the backend yet; they are the
 * contract for the backend phase: GET /notifications, PUT /notifications/read,
 * GET /referrals/me, GET /referrals/leaderboard,
 * PUT /orders/:id/status with `scrapItems` (final weights from the scale).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Opts } from './client';

const KEY = 'scraptox.partner.mockdb.v1';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* --------------------------------------------------------------- price list */

/** Sample admin price list (GET /api/public/prices). Rates are placeholders. */
const PRICES = [
  ['Newspaper', 14, 'kg'], ['Cardboard', 10, 'kg'], ['Copper', 720, 'kg'], ['Brass', 420, 'kg'], ['Aluminium', 160, 'kg'],
  ['Iron', 32, 'kg'], ['Steel', 38, 'kg'], ['Wire & cable', 180, 'kg'], ['Plastic', 12, 'kg'], ['Glass', 2, 'kg'],
  ['E-waste', 30, 'kg'], ['Battery', 80, 'kg'], ['Split AC', 4200, 'pc'], ['Refrigerator', 1800, 'pc'],
  ['Washing machine', 1100, 'pc'], ['Cooler', 600, 'pc'], ['Ceiling fan', 150, 'pc'], ['Geyser', 350, 'pc'],
  ['Microwave', 300, 'pc'], ['TV / Monitor', 250, 'pc'], ['Tyres', 6, 'kg'], ['Old vehicle', 22, 'kg'], ['Wooden furniture', 4, 'kg'],
].map(([category, rate, unit], i) => ({
  _id: `price${i + 1}`,
  category: category as string,
  pricePerKg: rate as number,
  price: rate as number,
  unit: unit as 'kg' | 'pc',
  type: 'material',
  regionCode: 'IN-DL',
  change: [2.1, -0.4, 1.2, 0, 0.8, -1.1, 0.5, 3.0, 0, 0, 1.6, -0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0][i],
}));

const priceOf = (category: string) => PRICES.find((p) => p.category === category);
const rateOf = (category: string) => priceOf(category)?.pricePerKg ?? 0;
const isPc = (category: string) => priceOf(category)?.unit === 'pc';

/* ------------------------------------------------------------------ plans */

/** Sample plans (GET /subscriptions/plans). Prices are placeholders for the admin's real plans. */
const PLANS = [
  { _id: 'plan_silver', name: 'Silver', description: 'For part-time collectors', price: 199, currency: 'INR', duration: 1, durationType: 'monthly', features: ['Up to 5 pickups a day', 'Requests within 10 km', 'Partner wallet and payouts'], maxPickups: 150, maxMarketplaceRequests: 0, isPopular: false, sortOrder: 1, type: 'general', image: 'planSilver' },
  { _id: 'plan_gold', name: 'Gold', description: 'For full-time collectors', price: 499, currency: 'INR', duration: 1, durationType: 'monthly', features: ['Unlimited pickups', 'Requests within 25 km', 'Bid on bulk marketplace lots', 'Priority support'], maxPickups: null, maxMarketplaceRequests: 20, isPopular: true, sortOrder: 2, type: 'general', image: 'planGold' },
  { _id: 'plan_platinum', name: 'Platinum', description: 'For scrap businesses', price: 1299, currency: 'INR', duration: 3, durationType: 'quarterly', features: ['Everything in Gold', 'Requests within 40 km', 'Unlimited marketplace bids', 'Daily market-price alerts'], maxPickups: null, maxMarketplaceRequests: null, isPopular: false, sortOrder: 3, type: 'general', image: 'planPlatinum' },
  { _id: 'plan_market', name: 'Market price alerts', description: 'Daily mandi rates for metals, paper and plastic in your city', price: 99, currency: 'INR', duration: 1, durationType: 'monthly', features: ['Morning rate alerts', 'Rate trends for 30 days', 'Best-buyer suggestions'], maxPickups: null, maxMarketplaceRequests: null, isPopular: false, sortOrder: 4, type: 'market_price', image: 'planGold' },
];

const COUPONS: Record<string, number> = { PARTNER50: 50, FIRST100: 100 };

/* ---------------------------------------------------------------- people */

const CUSTOMERS = [
  { name: 'Harpreet Singh', phone: '9876501234', street: 'B-204, Palm Grove Apartments, Sector 21', landmark: 'Near Tau Devi Lal Park', city: 'Gurugram', d: [0, 0] },
  { name: 'Neha Agarwal', phone: '9811122233', street: 'H.No. 1187, Sector 23A', landmark: 'Opp. Shiv Mandir', city: 'Gurugram', d: [0.0071, 0.0052] },
  { name: 'Rakesh Yadav', phone: '9899012345', street: 'Shop 14, Palam Vihar Market', landmark: '', city: 'Gurugram', d: [-0.0062, -0.0108] },
  { name: 'Sunita Sharma', phone: '9810098100', street: 'C-9, Ashok Vihar Phase 3', landmark: 'Behind the post office', city: 'Gurugram', d: [-0.0118, 0.0141] },
  { name: 'Mohit Bansal', phone: '9958300400', street: 'Tower 6, 1102, Orchid Petals, Sector 49', landmark: '', city: 'Gurugram', d: [0.0154, -0.0047] },
  { name: 'Farah Khan', phone: '9711155566', street: '22, DLF Phase 2, Block K', landmark: 'Near Cyber Hub gate 3', city: 'Gurugram', d: [-0.0051, 0.0193] },
];

const BASKETS: [string, number][][] = [
  [['Newspaper', 12], ['Copper', 2], ['Split AC', 1]],
  [['Cardboard', 18], ['Plastic', 6]],
  [['Iron', 40], ['Steel', 9]],
  [['Refrigerator', 1], ['Newspaper', 8]],
  [['E-waste', 7], ['Battery', 3], ['Wire & cable', 2]],
  [['Washing machine', 1], ['Aluminium', 3]],
];

/** Sample partner home base when GPS is off (Sector 21, Gurugram). */
const BASE = { lat: 28.5108, lng: 77.0705 };

/* ------------------------------------------------------------------- db */

type Db = {
  users: Record<string, any>;
  me: string | null;
  pendingOtp: Record<string, { purpose: string; draft?: any }>;
  /** Pickup requests waiting for a partner (GET /orders/available). */
  available: any[];
  /** Orders this partner accepted (GET /orders/my-assigned). */
  jobs: any[];
  skipped: string[];
  nextRequestAt: number;
  market: any[];
  chats: any[];
  tickets: any[];
  notifications: any[];
  wallet: { balance: number; upiId: string | null; transactions: any[] };
  seq: number;
  turn: number;
};

let db: Db | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const empty = (): Db => ({
  users: {}, me: null, pendingOtp: {}, available: [], jobs: [], skipped: [], nextRequestAt: 0, market: [], chats: [], tickets: [], notifications: [],
  wallet: { balance: 0, upiId: null, transactions: [] }, seq: 24800, turn: 0,
});

async function load(): Promise<Db> {
  if (db) return db;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    db = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    db = empty();
  }
  return db!;
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  }, 300);
}

/** Wipes the demo data (Profile → "Reset demo data"). */
export async function resetMock() {
  db = empty();
  await AsyncStorage.removeItem(KEY);
}

const id = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ok = (message: string, data: any = {}) => ({ success: true, message, data });
const round2 = (n: number) => Math.round(n * 100) / 100;

class MockError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function credit(d: Db, amount: number, title: string, sub: string, category: string, at = new Date().toISOString()) {
  d.wallet.balance = round2(d.wallet.balance + amount);
  d.wallet.transactions.unshift({ _id: id('txn'), type: 'credit', category, amount, title, description: sub, createdAt: at, status: 'completed' });
}

function debit(d: Db, amount: number, title: string, sub: string, category: string, at = new Date().toISOString()) {
  d.wallet.balance = round2(d.wallet.balance - amount);
  d.wallet.transactions.unshift({ _id: id('txn'), type: 'debit', category, amount, title, description: sub, createdAt: at, status: 'completed' });
}

function notify(d: Db, type: string, title: string, message: string, orderId?: string) {
  d.notifications.unshift({ _id: id('ntf'), type, title, message, orderId, read: false, createdAt: new Date().toISOString() });
}

/* --------------------------------------------------------------- orders */

/** A sample order in the backend's Order shape. */
function makeOrder(d: Db, ci: number, bi: number, extra: any = {}) {
  const c = CUSTOMERS[ci % CUSTOMERS.length];
  const items = BASKETS[bi % BASKETS.length].map(([category, weight]) => ({ category, weight, rate: rateOf(category), total: round2(weight * rateOf(category)) }));
  const coords = { lat: BASE.lat + c.d[0], lng: BASE.lng + c.d[1] };
  return {
    _id: id('ord'),
    orderNo: `SX-${++d.seq}`,
    orderType: 'scrap_sell',
    user: { _id: `usr_${ci}`, name: c.name, phone: c.phone },
    scrapItems: items,
    totalWeight: items.reduce((n, i) => n + (isPc(i.category) ? 0 : i.weight), 0),
    totalAmount: round2(items.reduce((n, i) => n + i.total, 0)),
    status: 'pending',
    paymentStatus: 'pending',
    assignmentStatus: 'unassigned',
    pickupAddress: { street: c.street, landmark: c.landmark, city: c.city, state: 'Haryana', pincode: '122016', coordinates: coords },
    preferredTime: 'now',
    pickupSlot: null,
    images: [],
    notes: bi % 3 === 0 ? 'Items are in the balcony. Please bring a weighing scale.' : '',
    scrapper: null,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

/** While the partner is online, keep 1–3 requests waiting nearby. */
function refreshAvailable(d: Db, me: any) {
  const now = Date.now();
  // Requests expire after 10 minutes (another partner took them).
  d.available = d.available.filter((o) => now - Date.parse(o.createdAt) < 10 * MIN);
  if (!me.isOnline || me.kyc?.status !== 'verified' || me.subscription?.status !== 'active') return;
  if (d.available.length < 3 && now >= d.nextRequestAt) {
    const o = makeOrder(d, d.turn + 1, d.turn, d.turn % 4 === 3 ? { preferredTime: 'later', pickupSlot: { date: new Date(now + DAY).toISOString().slice(0, 10), dayLabel: 'Tomorrow', time: '11 AM – 1 PM' } } : {});
    d.turn += 1;
    d.available.unshift(o);
    d.nextRequestAt = now + 40 * 1000;
    notify(d, 'new_order', 'New pickup request', `${o.user.name.split(' ')[0]} · ${o.scrapItems.map((i: any) => i.category).join(', ')}`, o._id);
  }
}

/* ------------------------------------------------------------------ seed */

/** A new demo account opens with some history, so no screen starts empty. */
function seed(d: Db, me: any) {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  d.wallet = { balance: 0, upiId: null, transactions: [] };
  credit(d, 40000, 'Added to wallet', 'Demo top-up · no real payment', 'recharge', ago(9 * DAY));

  // Completed pickups over the last two weeks (amounts the partner paid customers).
  const done = [
    [1, 1, 13 * DAY], [2, 2, 11 * DAY], [3, 4, 8 * DAY], [4, 5, 6 * DAY], [5, 1, 4 * DAY], [1, 2, 3 * DAY], [2, 3, 2 * DAY], [3, 1, 1 * DAY], [4, 4, 5 * HOUR],
  ];
  d.jobs = done.map(([ci, bi, t]) => {
    const o = makeOrder(d, ci, bi);
    const at = ago(t);
    Object.assign(o, {
      status: 'completed', paymentStatus: 'completed', assignmentStatus: 'accepted', createdAt: ago(t + 2 * HOUR), acceptedAt: ago(t + 90 * MIN), completedDate: at,
      scrapper: { _id: me._id, name: me.name }, paidAmount: o.totalAmount, seeded: true, rating: ci % 3 === 0 ? 4 : 5,
    });
    debit(d, o.totalAmount, `Paid for pickup #${o.orderNo}`, o.user.name, 'order_payment', at);
    return o;
  });
  d.wallet.transactions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  // One accepted pickup for later today, so "Jobs" has work in it.
  d.jobs.unshift(makeOrder(d, 0, 0, { status: 'confirmed', assignmentStatus: 'accepted', acceptedAt: ago(20 * MIN), scrapper: { _id: me._id, name: me.name }, preferredTime: 'later', pickupSlot: { date: new Date().toISOString().slice(0, 10), dayLabel: 'Today', time: '4 PM – 6 PM' } }));

  d.market = [
    { _id: id('mkt'), title: 'Office e-waste lot', description: 'Old CPUs, monitors, keyboards and cables from an office move. Loading help available.', category: 'E-waste', estimatedWeight: 180, unit: 'kg', location: { area: 'DLF Cyber City', city: 'Gurugram', distanceKm: 6.8 }, seller: { name: 'Infra Office Pvt Ltd' }, image: 'E-waste', status: 'open', endsAt: new Date(Date.now() + 5 * HOUR + 12 * MIN).toISOString(), createdAt: ago(DAY), bids: [
      { _id: id('bid'), scrapper: { _id: 'p1', name: 'Green Metals Co.' }, amount: 6450, createdAt: ago(3 * HOUR) },
      { _id: id('bid'), scrapper: { _id: me._id, name: me.name }, amount: 6200, message: 'Same-day pickup with loader.', createdAt: ago(5 * HOUR) },
      { _id: id('bid'), scrapper: { _id: 'p3', name: 'City E-Recyclers' }, amount: 5900, createdAt: ago(9 * HOUR) },
    ] },
    { _id: id('mkt'), title: 'Factory steel offcuts', description: 'Mild steel offcuts and sheet trimmings, sorted in bins. Truck access at gate 2.', category: 'Steel', estimatedWeight: 1200, unit: 'kg', location: { area: 'IMT Manesar', city: 'Gurugram', distanceKm: 18 }, seller: { name: 'Shree Auto Components' }, image: 'Steel', status: 'open', endsAt: new Date(Date.now() + DAY).toISOString(), createdAt: ago(10 * HOUR), bids: [
      { _id: id('bid'), scrapper: { _id: 'p4', name: 'Haryana Steel Traders' }, amount: 41000, createdAt: ago(2 * HOUR) },
    ] },
    { _id: id('mkt'), title: 'Copper cable drums', description: 'Two drums of armoured copper cable left after a site job.', category: 'Wire & cable', estimatedWeight: 90, unit: 'kg', location: { area: 'Udyog Vihar Phase 4', city: 'Gurugram', distanceKm: 9 }, seller: { name: 'Volt Electricals' }, image: 'Wire & cable', status: 'open', endsAt: new Date(Date.now() + 9 * HOUR).toISOString(), createdAt: ago(6 * HOUR), bids: [
      { _id: id('bid'), scrapper: { _id: 'p5', name: 'Copper King' }, amount: 58500, createdAt: ago(HOUR) },
    ] },
    { _id: id('mkt'), title: 'Hotel AC units × 14', description: 'Split ACs removed during renovation. Indoor and outdoor units, compressors intact.', category: 'Split AC', estimatedWeight: 14, unit: 'pc', location: { area: 'Sector 29', city: 'Gurugram', distanceKm: 4 }, seller: { name: 'The Leela Residency' }, image: 'Split AC', status: 'open', endsAt: new Date(Date.now() + 2 * DAY).toISOString(), createdAt: ago(3 * HOUR), bids: [] },
    { _id: id('mkt'), title: 'Printing press paper waste', description: 'Shredded and bundled paper waste, about 2 tonnes.', category: 'Newspaper', estimatedWeight: 2000, unit: 'kg', location: { area: 'Sector 37', city: 'Gurugram', distanceKm: 7.5 }, seller: { name: 'Sun Offset Printers' }, image: 'Newspaper', status: 'awarded', awardedTo: me._id, endsAt: ago(2 * DAY), createdAt: ago(5 * DAY), bids: [
      { _id: id('bid'), scrapper: { _id: me._id, name: me.name }, amount: 24500, createdAt: ago(4 * DAY) },
      { _id: id('bid'), scrapper: { _id: 'p1', name: 'Green Metals Co.' }, amount: 23800, createdAt: ago(4 * DAY) },
    ] },
  ];

  d.notifications = [];
  notify(d, 'market', 'You won a bulk lot', 'Sun Offset Printers accepted your bid of ₹24,500. Chat to plan the pickup.');
  notify(d, 'promotion', 'Copper rates are up 2.1% today', 'Good day to sell your copper stock.');
  notify(d, 'payment', 'Wallet topped up', '₹40,000 added to your partner wallet.');
  d.notifications.forEach((n, i) => (n.createdAt = ago((i + 1) * 6 * HOUR)));
  d.notifications[2].read = true;
}

/* ---------------------------------------------------------------- router */

function meOrThrow(d: Db) {
  const u = d.me ? d.users[d.me] : null;
  if (!u) throw new MockError('Please log in again.', 401);
  return u;
}

/** Brings KYC and subscription state up to date with the clock. */
function tick(d: Db, me: any) {
  if (me.kyc?.status === 'pending' && Date.now() - Date.parse(me.kyc.submittedAt) > 8000) {
    me.kyc.status = 'verified';
    me.kyc.verifiedAt = new Date().toISOString();
    notify(d, 'kyc', 'KYC approved', 'Your documents are verified. Choose a plan to start taking pickups.');
  }
  const s = me.subscription;
  if (s?.status === 'active' && Date.parse(s.expiryDate) < Date.now()) {
    s.status = 'expired';
    me.isOnline = false;
  }
}

const subView = (s: any) => (s?.planId ? { ...s, plan: PLANS.find((p) => p._id === s.planId) ?? null } : s);
const meView = (me: any) => ({ ...me, subscription: subView(me.subscription), marketSubscription: subView(me.marketSubscription) });

function addPeriod(start: number, p: any) {
  const d = new Date(start);
  if (p.durationType === 'daily') d.setDate(d.getDate() + p.duration);
  else if (p.durationType === 'yearly') d.setFullYear(d.getFullYear() + p.duration);
  else d.setMonth(d.getMonth() + (p.durationType === 'quarterly' ? 3 * p.duration : p.duration));
  return d.toISOString();
}

function priceAfterCoupon(plan: any, code?: string) {
  const off = code ? COUPONS[code.trim().toUpperCase()] ?? 0 : 0;
  return Math.max(0, plan.price - off);
}

function earningsSummary(d: Db, me: any) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = now.getTime() - 7 * DAY;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const done = d.jobs.filter((o) => o.status === 'completed');
  let today = 0;
  let week = 0;
  let month = 0;
  let total = 0;
  let weekCount = 0;
  let prevWeek = 0;
  done.forEach((o) => {
    const at = Date.parse(o.completedDate || o.createdAt);
    // Backend rule: a scrap pickup is money the partner PAYS (negative); cleaning is income.
    const amt = o.orderType === 'cleaning_service' ? Math.abs(o.totalAmount) : -Math.abs(o.paidAmount ?? o.totalAmount);
    total += amt;
    if (at >= todayStart.getTime()) today += amt;
    if (at >= weekAgo) {
      week += amt;
      weekCount += 1;
    } else if (at >= weekAgo - 7 * DAY) prevWeek += amt;
    if (at >= monthStart) month += amt;
  });
  const rated = done.filter((o) => o.rating);
  const rating = rated.length ? Math.round((rated.reduce((n, o) => n + o.rating, 0) / rated.length) * 10) / 10 : 5;
  const days: { day: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const s = new Date(todayStart.getTime() - i * DAY);
    const e = s.getTime() + DAY;
    const amount = done.filter((o) => {
      const at = Date.parse(o.completedDate);
      return at >= s.getTime() && at < e;
    }).reduce((n, o) => n + Math.abs(o.paidAmount ?? o.totalAmount), 0);
    days.push({ day: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][s.getDay()], amount: round2(amount) });
  }
  return {
    today: round2(today), week: round2(week), month: round2(month), total: round2(total), completedOrders: done.length, rating,
    weekPickups: weekCount, previousWeek: round2(prevWeek), days, totalPickupsAllTime: (me.totalPickups ?? 0) + done.length,
  };
}

export async function mockApi(path: string, { method = 'GET', body = {}, query = {} }: Opts): Promise<any> {
  const d = await load();
  const b: any = body ?? {};
  const q: any = query ?? {};
  await delay(path.startsWith('/translate') ? 50 : 320); // feels like a network
  const [p, qs] = path.split('?');
  if (qs) qs.split('&').forEach((kv) => { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v ?? ''); });
  const m = (re: RegExp) => re.exec(p);
  let r: RegExpExecArray | null;

  /* ---------- auth */
  if (p === '/auth/login-otp' && method === 'POST') {
    if (!/^\d{10}$/.test(b.phone ?? '')) throw new MockError('Please enter a valid 10-digit mobile number.');
    const exists = !!d.users[b.phone];
    d.pendingOtp[b.phone] = { purpose: exists ? 'login' : 'register' };
    save();
    return ok('OTP sent successfully', { phone: b.phone, isNewUser: !exists });
  }
  if (p === '/auth/register' && method === 'POST') {
    d.pendingOtp[b.phone] = { purpose: 'register', draft: b };
    save();
    return ok('OTP sent successfully', { phone: b.phone });
  }
  if (p === '/auth/resend-otp' && method === 'POST') return ok('OTP resent', { phone: b.phone });
  if (p === '/auth/verify-otp' && method === 'POST') {
    if (!/^\d{6}$/.test(b.otp ?? '')) throw new MockError('Enter the 6-digit code.');
    let u = d.users[b.phone];
    if (!u) {
      const draft = d.pendingOtp[b.phone]?.draft ?? b.profile ?? {};
      const initials = (draft.name || 'SX').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
      u = {
        _id: id('scr'), name: draft.name || 'Scraptox partner', email: draft.email || '', phone: b.phone, role: 'scrapper', isVerified: true,
        vehicleInfo: draft.vehicleInfo ?? { type: 'auto', number: '', capacity: 300 }, services: draft.services?.length ? draft.services : ['scrap_pickup'],
        city: draft.city || 'Gurugram', heardFrom: draft.heardFrom ?? null, referredBy: draft.referralCode || null,
        referralCode: `SCRAP-${initials}${b.phone.slice(-2)}`, isOnline: false, rating: 4.8, totalRatings: 0, totalPickups: 0,
        kyc: { status: 'not_submitted' }, subscription: { status: 'none' }, marketSubscription: { status: 'none' },
        liveLocation: BASE, createdAt: new Date().toISOString(),
      };
      d.users[b.phone] = u;
      seed(d, u);
    }
    d.me = b.phone;
    delete d.pendingOtp[b.phone];
    save();
    return ok('Login successful', { token: `mock.${u._id}`, user: meView(u) });
  }
  if (p === '/auth/logout') {
    d.me = null;
    save();
    return ok('Logged out');
  }

  /* ---------- public */
  if (p === '/public/prices' || p === '/public/prices/active') return ok('Public prices retrieved successfully', { prices: PRICES });
  if (p.startsWith('/translate')) return { success: true, translations: (b.texts ?? []).map(() => null) };

  const me = meOrThrow(d);
  tick(d, me);

  /* ---------- profile */
  if (p === '/auth/me' || (p === '/scrappers/me' && method === 'GET')) {
    save();
    return ok('Profile fetched', { user: meView(me), scrapper: meView(me) });
  }
  if (p === '/scrappers/me' && method === 'PUT') {
    if (b.isOnline === true) {
      if (me.kyc?.status !== 'verified') throw new MockError('Your KYC must be verified before you go online.', 403, 'KYC_REQUIRED');
      if (me.subscription?.status !== 'active') throw new MockError('Active subscription required to go online. Please subscribe first.', 403, 'SUBSCRIPTION_REQUIRED');
      if (!me.city) throw new MockError('Please set your city in profile before going online.');
      d.nextRequestAt = Math.min(d.nextRequestAt || 0, Date.now() + 6000);
      if (!d.available.length) d.nextRequestAt = Date.now() + 6000;
    }
    ['name', 'email', 'city', 'services', 'isOnline', 'liveLocation'].forEach((k) => {
      if (b[k] !== undefined) me[k] = b[k];
    });
    if (b.vehicleInfo) me.vehicleInfo = { ...me.vehicleInfo, ...b.vehicleInfo };
    save();
    return ok('Profile updated', { scrapper: meView(me), user: meView(me) });
  }
  if (p === '/scrappers/stats') {
    const s = earningsSummary(d, me);
    const active = d.jobs.filter((o) => o.status === 'confirmed' || o.status === 'in_progress');
    return ok('Stats fetched', { stats: { ...s, activeJobs: active.length, openLots: d.market.filter((x) => x.status === 'open').length, myOpenBids: d.market.filter((x) => x.status === 'open' && x.bids.some((bd: any) => bd.scrapper._id === me._id)).length } });
  }

  /* ---------- KYC */
  if (p === '/kyc/me') return ok('KYC fetched', { kyc: me.kyc });
  if (p === '/kyc' && method === 'POST') {
    if (!/^\d{12}$/.test(b.aadhaarNumber ?? '')) throw new MockError('Please enter a valid 12-digit Aadhaar number');
    if (!b.aadhaar) throw new MockError('Please upload Aadhaar photo');
    if (!b.selfie) throw new MockError('Please upload selfie photo');
    me.kyc = { status: 'pending', aadhaarLast4: b.aadhaarNumber.slice(-4), aadhaarPhotoUrl: b.aadhaar, selfieUrl: b.selfie, licenseUrl: b.license ?? null, submittedAt: new Date().toISOString() };
    save();
    return ok('KYC submitted successfully', { kyc: me.kyc });
  }

  /* ---------- subscriptions */
  if (p === '/subscriptions/plans') return ok('Plans fetched', { plans: PLANS.filter((x) => x.type === (q.type || 'general')) });
  if (p === '/subscriptions/my-subscription') return ok('Subscription fetched', { subscription: subView(me.subscription), marketSubscription: subView(me.marketSubscription) });
  if (p === '/subscriptions/validate-coupon' && method === 'POST') {
    const plan = PLANS.find((x) => x._id === b.planId);
    const code = String(b.code ?? '').trim().toUpperCase();
    if (!plan) throw new MockError('Plan not found', 404);
    if (!COUPONS[code]) throw new MockError('This coupon code is not valid.');
    return ok('Coupon applied', { code, discount: Math.min(COUPONS[code], plan.price), finalAmount: priceAfterCoupon(plan, code) });
  }
  if (p === '/subscriptions/subscribe' && method === 'POST') {
    const plan = PLANS.find((x) => x._id === b.planId);
    if (!plan) throw new MockError('Plan not found', 404);
    if (me.kyc?.status !== 'verified') throw new MockError('Your KYC must be verified before you subscribe.', 403);
    return ok('Payment order created', { razorpayOrderId: id('order'), amount: priceAfterCoupon(plan, b.couponCode) * 100, currency: 'INR', demo: true });
  }
  if (p === '/subscriptions/verify-payment' && method === 'POST') {
    const plan = PLANS.find((x) => x._id === b.planId);
    if (!plan) throw new MockError('Plan not found', 404);
    const key = plan.type === 'market_price' ? 'marketSubscription' : 'subscription';
    const cur = me[key];
    const from = cur?.status === 'active' && cur.planId === plan._id ? Date.parse(cur.expiryDate) : Date.now();
    me[key] = { status: 'active', planId: plan._id, startDate: new Date().toISOString(), expiryDate: addPeriod(from, plan), usedPickups: cur?.planId === plan._id ? cur.usedPickups ?? 0 : 0, amountPaid: priceAfterCoupon(plan, b.couponCode) };
    notify(d, 'subscription', `${plan.name} plan active`, `Valid till ${new Date(me[key].expiryDate).toDateString().slice(4)}.`);
    save();
    return ok('Subscription activated', { subscription: subView(me[key]) });
  }

  /* ---------- orders (scrapper side) */
  if (p === '/orders/available') {
    refreshAvailable(d, me);
    save();
    const list = d.available.filter((o) => !d.skipped.includes(o._id)).map((o) => {
      const dx = (o.pickupAddress.coordinates.lat - (me.liveLocation?.lat ?? BASE.lat)) * 111;
      const dy = (o.pickupAddress.coordinates.lng - (me.liveLocation?.lng ?? BASE.lng)) * 98;
      const km = Math.max(0.6, Math.round(Math.sqrt(dx * dx + dy * dy) * 1.3 * 10) / 10);
      return { ...o, distanceKm: km, etaMin: Math.max(4, Math.round(km * 3.4)) };
    });
    return ok('Available orders fetched', { orders: list });
  }
  if ((r = m(/^\/orders\/([^/]+)\/skip$/)) && method === 'POST') {
    d.skipped.push(r[1]);
    save();
    return ok('Skipped');
  }
  if ((r = m(/^\/orders\/([^/]+)\/accept$/)) && method === 'POST') {
    if (me.subscription?.status !== 'active') throw new MockError('Active subscription required to accept orders. Please subscribe first.', 403, 'SUBSCRIPTION_REQUIRED');
    const i = d.available.findIndex((x) => x._id === r![1]);
    if (i < 0) throw new MockError('This request was taken by another partner.', 409);
    const o = d.available.splice(i, 1)[0];
    Object.assign(o, { status: 'confirmed', assignmentStatus: 'accepted', acceptedAt: new Date().toISOString(), scrapper: { _id: me._id, name: me.name } });
    d.jobs.unshift(o);
    me.subscription.usedPickups = (me.subscription.usedPickups ?? 0) + 1;
    save();
    return ok('Order accepted successfully', { order: o });
  }
  if (p === '/orders/my-assigned') {
    const status = q.status as string | undefined;
    return ok('Assigned orders fetched', { orders: status ? d.jobs.filter((o) => status.split(',').includes(o.status)) : d.jobs });
  }
  if ((r = m(/^\/orders\/([^/]+)\/status$/)) && method === 'PUT') {
    const o = d.jobs.find((x) => x._id === r![1]);
    if (!o) throw new MockError('Order not found', 404);
    if (o.status === 'completed' || o.status === 'cancelled') throw new MockError('This pickup is already closed.');
    if (b.scrapItems) {
      // PROPOSED: final weights from the digital scale.
      o.scrapItems = o.scrapItems.map((it: any) => {
        const f = b.scrapItems.find((x: any) => x.category === it.category);
        if (!f) return it;
        const weight = Number(f.weight);
        return { ...it, estimatedWeight: it.estimatedWeight ?? it.weight, weight, total: round2(weight * it.rate) };
      });
      o.totalWeight = o.scrapItems.reduce((n: number, i: any) => n + (isPc(i.category) ? 0 : i.weight), 0);
      o.totalAmount = round2(o.scrapItems.reduce((n: number, i: any) => n + i.total, 0));
      o.weighedAt = new Date().toISOString();
    }
    if (b.status === 'in_progress' && o.status === 'confirmed') o.arrivedAt = new Date().toISOString();
    if (b.paymentStatus === 'completed') {
      o.paymentStatus = 'completed';
      o.paidAmount = Number(b.paidAmount ?? o.totalAmount);
      o.paidAt = new Date().toISOString();
    }
    if (b.status) o.status = b.status;
    if (b.status === 'completed') {
      if (o.paymentStatus !== 'completed') throw new MockError('Pay the customer before completing the pickup.');
      o.completedDate = new Date().toISOString();
      notify(d, 'order_update', 'Pickup completed', `#${o.orderNo} · ${o.user.name}. The customer has been asked to rate you.`, o._id);
    }
    save();
    return ok('Order status updated', { order: o });
  }
  if ((r = m(/^\/orders\/([^/]+)$/))) {
    const o = d.jobs.find((x) => x._id === r![1]) ?? d.available.find((x) => x._id === r![1]);
    if (!o) throw new MockError('Order not found', 404);
    return ok('Order fetched', { order: o });
  }

  /* ---------- earnings */
  if (p === '/scrapper/earnings/summary') return ok('Earnings summary retrieved successfully', { summary: earningsSummary(d, me) });
  if (p === '/scrapper/earnings/history') {
    const history = d.jobs.filter((o) => o.status === 'completed').map((o) => ({
      _id: o._id, orderNo: o.orderNo, orderType: o.orderType, customer: o.user.name, items: o.scrapItems.map((i: any) => i.category), totalWeight: o.totalWeight,
      amount: o.orderType === 'cleaning_service' ? Math.abs(o.totalAmount) : -Math.abs(o.paidAmount ?? o.totalAmount), completedDate: o.completedDate,
    }));
    return ok('Earnings history fetched', { history });
  }

  /* ---------- wallet */
  if (p === '/wallet/profile') return ok('Wallet profile fetched successfully', { balance: d.wallet.balance, upiId: d.wallet.upiId ?? `${me.phone}@ybl`, minWithdrawal: 100 });
  if (p === '/wallet/transactions') return ok('Transactions fetched', { transactions: d.wallet.transactions });
  if (p === '/wallet/recharge/create' && method === 'POST') return ok('Recharge order created', { orderId: id('rzp'), amount: b.amount, demo: true });
  if (p === '/wallet/recharge/verify' && method === 'POST') {
    credit(d, Number(b.amount), 'Added to wallet', 'Demo top-up · no real payment', 'recharge');
    save();
    return ok('Wallet recharged successfully', { balance: d.wallet.balance });
  }
  if (p === '/wallet/pay-order' && method === 'POST') {
    const o = d.jobs.find((x) => x._id === b.orderId);
    const amt = Number(b.amount);
    if (!o) throw new MockError('Order not found', 404);
    if (!(amt > 0)) throw new MockError('Please enter a valid amount');
    if (amt > d.wallet.balance) throw new MockError('Not enough balance in your wallet. Top up and try again.', 400, 'INSUFFICIENT_BALANCE');
    debit(d, amt, `Paid for pickup #${o.orderNo}`, o.user.name, 'order_payment');
    save();
    return ok('Payment successful', { balance: d.wallet.balance });
  }
  if (p === '/wallet/withdraw' && method === 'POST') {
    const amt = Number(b.amount);
    if (!(amt >= 100)) throw new MockError('Minimum withdrawal is ₹100.');
    if (amt > d.wallet.balance) throw new MockError('Amount is more than your balance.');
    if (b.upiId) d.wallet.upiId = b.upiId;
    debit(d, amt, b.method === 'bank' ? 'Withdrawn to bank' : 'Withdrawn to UPI', b.method === 'bank' ? `A/c ••${String(b.accountNumber ?? '').slice(-4)}` : b.upiId, 'withdrawal');
    save();
    return ok('Withdrawal request submitted successfully', { balance: d.wallet.balance });
  }

  /* ---------- marketplace (bulk lots) */
  const lotView = (x: any) => {
    const sorted = [...x.bids].sort((a: any, c: any) => c.amount - a.amount);
    const mine = x.bids.find((bd: any) => bd.scrapper._id === me._id) ?? null;
    return { ...x, bidCount: x.bids.length, highestBid: sorted[0]?.amount ?? null, myBid: mine, isLeading: !!mine && sorted[0]?._id === mine._id, won: x.status === 'awarded' && x.awardedTo === me._id };
  };
  if (p === '/marketplace/requests' && method === 'GET') {
    const tab = q.tab ?? 'open';
    const list = d.market.filter((x) => (tab === 'open' ? x.status === 'open' : tab === 'mine' ? x.status === 'open' && x.bids.some((bd: any) => bd.scrapper._id === me._id) : x.status === 'awarded' && x.awardedTo === me._id));
    return ok('Requests fetched', { requests: list.map(lotView) });
  }
  if ((r = m(/^\/marketplace\/requests\/([^/]+)\/bids$/)) && method === 'POST') {
    const x = d.market.find((y) => y._id === r![1]);
    if (!x) throw new MockError('Lot not found', 404);
    if (x.status !== 'open') throw new MockError('Bidding on this lot has closed.');
    if (!['plan_gold', 'plan_platinum'].includes(me.subscription?.planId) || me.subscription?.status !== 'active') throw new MockError('Bulk-lot bidding is part of the Gold and Platinum plans.', 403, 'PLAN_REQUIRED');
    const amt = Number(b.amount);
    const mine = x.bids.find((bd: any) => bd.scrapper._id === me._id);
    if (!(amt > 0)) throw new MockError('Please enter a valid amount');
    if (mine && amt <= mine.amount) throw new MockError(`Your new bid must be more than your current bid of ₹${mine.amount.toLocaleString('en-IN')}.`);
    if (mine) Object.assign(mine, { amount: amt, message: b.message ?? mine.message, createdAt: new Date().toISOString() });
    else x.bids.push({ _id: id('bid'), scrapper: { _id: me._id, name: me.name }, amount: amt, message: b.message ?? '', createdAt: new Date().toISOString() });
    save();
    return ok(mine ? 'Bid updated' : 'Bid placed', { request: lotView(x) });
  }
  if ((r = m(/^\/marketplace\/requests\/([^/]+)\/report$/)) && method === 'POST') {
    d.tickets.unshift({ _id: id('tkt'), ticketNo: `T-${d.seq++}`, category: 'Marketplace report', subject: b.reason, message: b.details ?? '', status: 'open', createdAt: new Date().toISOString() });
    save();
    return ok('Report submitted. Our team will review this lot.');
  }
  if ((r = m(/^\/marketplace\/requests\/([^/]+)$/))) {
    const x = d.market.find((y) => y._id === r![1]);
    if (!x) throw new MockError('Lot not found', 404);
    return ok('Request fetched', { request: lotView(x) });
  }

  /* ---------- chat */
  const openChat = (key: string, participant: any, title: string, first: string) => {
    let c = d.chats.find((x) => x.key === key);
    if (!c) {
      c = { _id: id('chat'), key, title, participant, messages: [{ _id: id('msg'), from: 'them', text: first, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString(), unread: 1 };
      d.chats.unshift(c);
      save();
    }
    return c;
  };
  if ((r = m(/^\/chats\/order\/([^/]+)$/))) {
    const o = d.jobs.find((x) => x._id === r![1]);
    if (!o) throw new MockError('Chat opens once you accept the pickup.');
    return ok('Chat fetched', { chat: openChat(o._id, o.user, `Pickup #${o.orderNo}`, `Hello! I'm ${o.user.name.split(' ')[0]}. The items are ready, please call when you reach.`) });
  }
  if ((r = m(/^\/chats\/marketplace\/([^/]+)$/))) {
    const x = d.market.find((y) => y._id === r![1]);
    if (!x) throw new MockError('Lot not found', 404);
    return ok('Chat fetched', { chat: openChat(x._id, { name: x.seller.name, phone: '9810012345' }, x.title, `Hi, this is ${x.seller.name} about "${x.title}". When can you pick it up?`) });
  }
  if (p === '/chats' || p === '/chats/my-chats') return ok('Chats fetched', { chats: d.chats });
  if ((r = m(/^\/chats\/([^/]+)\/messages$/))) {
    const c = d.chats.find((x) => x._id === r![1]);
    if (!c) throw new MockError('Chat not found', 404);
    if (method === 'POST') {
      const msg = { _id: id('msg'), from: 'me', text: String(b.message ?? '').slice(0, 1000), createdAt: new Date().toISOString() };
      c.messages.push(msg);
      c.updatedAt = msg.createdAt;
      c.replyAt = Date.now() + 2500;
      save();
      return ok('Message sent', { message: msg });
    }
    if (c.replyAt && Date.now() >= c.replyAt) {
      c.messages.push({ _id: id('msg'), from: 'them', text: 'Theek hai ji, thank you. See you soon.', createdAt: new Date(c.replyAt).toISOString() });
      c.replyAt = null;
      c.updatedAt = new Date().toISOString();
      save();
    }
    return ok('Messages fetched', { messages: c.messages });
  }
  if ((r = m(/^\/chats\/([^/]+)\/read$/))) {
    const c = d.chats.find((x) => x._id === r![1]);
    if (c) c.unread = 0;
    save();
    return ok('Marked read');
  }

  /* ---------- support */
  if (p === '/support' && method === 'POST') {
    const t = { _id: id('tkt'), ticketNo: `T-${d.seq++}`, category: b.category, subject: b.subject, message: b.message, status: 'open', createdAt: new Date().toISOString() };
    d.tickets.unshift(t);
    save();
    return ok('Ticket created', { ticket: t });
  }
  if (p === '/support/my-tickets') return ok('Tickets fetched', { tickets: d.tickets });

  /* ---------- PROPOSED: notifications */
  if (p === '/notifications') {
    refreshAvailable(d, me);
    save();
    return ok('Notifications fetched', { notifications: d.notifications });
  }
  if (p === '/notifications/read' && method === 'PUT') {
    d.notifications.forEach((n) => (n.read = true));
    save();
    return ok('Marked read');
  }

  /* ---------- PROPOSED: referrals (partner programme: milestones per referred partner) */
  if (p === '/referrals/me') {
    return ok('Referral stats', {
      code: me.referralCode, rewardPerReferral: 400, friendReward: 100,
      milestones: [
        { pickups: 1, reward: 50, label: 'First pickup' },
        { pickups: 10, reward: 100, label: '10 pickups' },
        { pickups: 25, reward: 250, label: '25 pickups' },
      ],
      totals: { invited: 5, joined: 2, earned: 450 },
      referrals: [
        { name: 'Sanjay Kumar', status: 'active', pickups: 27, reward: 400, createdAt: new Date(Date.now() - 40 * DAY).toISOString() },
        { name: 'Imran Qureshi', status: 'active', pickups: 3, reward: 50, createdAt: new Date(Date.now() - 12 * DAY).toISOString() },
        { name: 'Vijay Pal', status: 'kyc_pending', pickups: 0, reward: 0, createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
      ],
    });
  }
  if (p === '/referrals/leaderboard') {
    const s = earningsSummary(d, me);
    return ok('Leaderboard', { month: new Date().toLocaleString('en-IN', { month: 'long' }), me: { rank: 9, name: me.name, pickups: s.completedOrders, kg: 640 }, leaders: [
      { rank: 1, name: 'Sanjay Kumar', city: 'Gurugram', pickups: 212, kg: 9840 },
      { rank: 2, name: 'Mukesh Saini', city: 'Delhi', pickups: 188, kg: 8120 },
      { rank: 3, name: 'Arif Khan', city: 'Noida', pickups: 171, kg: 7790 },
      { rank: 4, name: 'Dinesh Rawat', city: 'Faridabad', pickups: 140, kg: 6010 },
      { rank: 5, name: 'Pappu Yadav', city: 'Gurugram', pickups: 126, kg: 5480 },
      { rank: 6, name: 'Gurmeet Singh', city: 'Delhi', pickups: 119, kg: 5105 },
    ] });
  }

  throw new MockError(`Demo server: ${method} ${p} is not available yet.`, 404);
}
