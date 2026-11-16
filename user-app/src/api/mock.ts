/**
 * Mock backend for the first build (USE_MOCK in client.ts).
 *
 * Answers the same paths with the same `{ success, message, data }` shapes as
 * the Express backend (backend/routes + controllers), so switching to the
 * real server changes nothing in the screens. State is kept on the phone
 * (AsyncStorage), so it survives restarts. Clearly demo:
 *  - any 6-digit OTP works
 *  - no real payment is taken (wallet top-ups and withdrawals are simulated)
 *  - an order moves by itself: pending → accepted (8 s) → on the way (20 s)
 *    → weighing at the door (~110 s) → completed and paid (~140 s)
 *
 * Endpoints marked PROPOSED do not exist on the backend yet (the web app kept
 * this data in localStorage); they are the contract for the backend phase:
 *   GET/POST/PUT/DELETE /addresses, GET /notifications, PUT /notifications/read,
 *   GET /referrals/me, GET /referrals/leaderboard, POST /orders (orderType cleaning_service).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Opts } from './client';

const KEY = 'scraptox.mockdb.v1';
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

const rateOf = (category: string) => PRICES.find((p) => p.category === category)?.pricePerKg ?? 0;

/* ---------------------------------------------------------------- people */

/** The sample collector who takes demo orders. */
const COLLECTOR = {
  _id: 'scr_ramesh',
  name: 'Ramesh Kumar',
  phone: '9812345678',
  rating: 4.8,
  totalRatings: 312,
  vehicleInfo: { type: 'Tata Ace', number: 'HR 26 DK 4417' },
  avatar: 'partner',
  kycVerified: true,
};

/* ------------------------------------------------------------------- db */

type Db = {
  users: Record<string, any>;
  me: string | null;
  pendingOtp: Record<string, { purpose: string; draft?: any }>;
  orders: any[];
  chats: any[];
  reviews: any[];
  tickets: any[];
  addresses: any[];
  notifications: any[];
  wallet: { balance: number; pending: number; upiId: string | null; transactions: any[]; usedCoupons: string[] };
  market: any[];
  seq: number;
};

let db: Db | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const empty = (): Db => ({
  users: {}, me: null, pendingOtp: {}, orders: [], chats: [], reviews: [], tickets: [], addresses: [], notifications: [],
  wallet: { balance: 0, pending: 0, upiId: null, transactions: [], usedCoupons: [] }, market: [], seq: 1000,
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
const nextOrderNo = (d: Db) => `SX-${++d.seq + 23000}`;
const ok = (message: string, data: any = {}) => ({ success: true, message, data });

class MockError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Sample UPI ID from the user's first name (demo only). */
const upiOf = (u: any) => `${String(u.name || 'user').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '') || 'user'}@okhdfc`;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ order life */

export type LatLng = { lat: number; lng: number };

/** Collector's start: about 2.4 km north-west of the pickup, along a road-like path. */
function routeFor(to: LatLng): LatLng[] {
  return [
    { lat: to.lat + 0.0165, lng: to.lng - 0.0108 },
    { lat: to.lat + 0.0165, lng: to.lng - 0.0035 },
    { lat: to.lat + 0.0062, lng: to.lng - 0.0031 },
    { lat: to.lat + 0.0058, lng: to.lng + 0.0004 },
    { lat: to.lat, lng: to.lng },
  ];
}

const T_ACCEPT = 8 * 1000;
const T_LEAVE = 20 * 1000;
const T_ARRIVE = 110 * 1000;
const T_DONE = 140 * 1000;

function along(route: LatLng[], f: number): LatLng {
  const k = Math.max(0, Math.min(1, f)) * (route.length - 1);
  const i = Math.min(route.length - 2, Math.floor(k));
  const t = k - i;
  return { lat: route[i].lat + (route[i + 1].lat - route[i].lat) * t, lng: route[i].lng + (route[i + 1].lng - route[i].lng) * t };
}

/** Brings an order up to date with the clock (the backend would push these changes). */
function advance(d: Db, o: any) {
  if (o.status === 'cancelled' || o.status === 'completed' || o.seeded) return o;
  const start = o.liveFrom ?? Date.parse(o.createdAt);
  const age = Date.now() - start;
  const later = o.preferredTime !== 'now';
  if (age >= T_ACCEPT && !o.scrapper) {
    o.scrapper = COLLECTOR;
    o.status = 'confirmed';
    o.assignmentStatus = 'accepted';
    o.acceptedAt = new Date(start + T_ACCEPT).toISOString();
    notify(d, 'order_update', 'Pickup accepted', `${COLLECTOR.name} accepted order #${o.orderNo}.`, o._id);
  }
  if (later) return o; // scheduled pickups wait for their slot
  if (age >= T_LEAVE && o.status === 'confirmed') {
    o.status = 'in_progress';
    notify(d, 'order_update', 'Collector on the way', `${COLLECTOR.name} is on the way for #${o.orderNo}.`, o._id);
  }
  if (o.status === 'in_progress') {
    const f = (age - T_LEAVE) / (T_ARRIVE - T_LEAVE);
    o.tracking = { location: along(o.route, f), etaMin: Math.max(0, Math.ceil(((T_ARRIVE - age) / 1000 / 90) * 8)), arrived: age >= T_ARRIVE };
  }
  if (age >= T_DONE && o.status === 'in_progress') {
    // Final weights from the digital scale (within a few % of the estimate).
    o.scrapItems = o.scrapItems.map((it: any, i: number) => {
      const unit = PRICES.find((p) => p.category === it.category)?.unit;
      const weight = unit === 'pc' ? it.weight : Math.round(it.weight * (i % 2 ? 0.95 : 1.06) * 10) / 10;
      return { ...it, estimatedWeight: it.weight, weight, total: Math.round(weight * it.rate * 100) / 100 };
    });
    o.totalWeight = o.scrapItems.reduce((n: number, it: any) => n + (PRICES.find((p) => p.category === it.category)?.unit === 'pc' ? 0 : it.weight), 0);
    o.totalAmount = Math.round(o.scrapItems.reduce((n: number, it: any) => n + it.total, 0) * 100) / 100;
    o.status = 'completed';
    o.paymentStatus = 'completed';
    o.completedDate = new Date(start + T_DONE).toISOString();
    o.tracking = { location: o.pickupAddress.coordinates, etaMin: 0, arrived: true };
    credit(d, o.totalAmount, `Pickup #${o.orderNo}`, o.scrapItems.map((i: any) => i.category).join(', '), 'order_payment', o.completedDate);
    notify(d, 'payment', 'Payment received', `₹${o.totalAmount.toLocaleString('en-IN')} for #${o.orderNo} is in your wallet.`, o._id);
  }
  return o;
}

function credit(d: Db, amount: number, title: string, sub: string, type: string, at = new Date().toISOString()) {
  d.wallet.balance = Math.round((d.wallet.balance + amount) * 100) / 100;
  d.wallet.transactions.unshift({ _id: id('txn'), type: 'credit', category: type, amount, title, description: sub, createdAt: at, status: 'completed' });
}

function debit(d: Db, amount: number, title: string, sub: string, type: string, at = new Date().toISOString()) {
  d.wallet.balance = Math.round((d.wallet.balance - amount) * 100) / 100;
  d.wallet.transactions.unshift({ _id: id('txn'), type: 'debit', category: type, amount, title, description: sub, createdAt: at, status: 'completed' });
}

function notify(d: Db, type: string, title: string, message: string, orderId?: string) {
  d.notifications.unshift({ _id: id('ntf'), type, title, message, orderId, read: false, createdAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ seed */

/** A new demo account opens with some history, so no screen starts empty. */
function seed(d: Db, user: any) {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const home = { _id: id('adr'), type: 'home', label: 'Home', street: 'B-204, Palm Grove Apartments, Sector 21', landmark: 'Near Tau Devi Lal Park', city: 'Gurugram', state: 'Haryana', pincode: '122016', coordinates: { lat: 28.5108, lng: 77.0705 }, isDefault: true };
  const office = { _id: id('adr'), type: 'office', label: 'Office', street: '4th floor, Tower B, Unitech Cyber Park, Sector 39', landmark: '', city: 'Gurugram', state: 'Haryana', pincode: '122001', coordinates: { lat: 28.4424, lng: 77.0563 }, isDefault: false };
  d.addresses = [home, office];
  const item = (category: string, weight: number) => ({ category, weight, rate: rateOf(category), total: Math.round(weight * rateOf(category) * 100) / 100 });
  const done1 = [item('Refrigerator', 1)];
  const done2 = [item('Copper', 1.4), item('Steel', 8.5), item('Newspaper', 24)];
  const cancelled = [item('Newspaper', 12)];
  const mk = (items: any[], extra: any) => ({
    _id: id('ord'), orderNo: nextOrderNo(d), user: user._id, orderType: 'scrap_sell', scrapItems: items,
    totalWeight: items.reduce((n, i) => n + (PRICES.find((p) => p.category === i.category)?.unit === 'pc' ? 0 : i.weight), 0),
    totalAmount: Math.round(items.reduce((n, i) => n + i.total, 0) * 100) / 100,
    pickupAddress: { street: home.street, city: home.city, state: home.state, pincode: home.pincode, coordinates: home.coordinates },
    images: [], notes: '', paymentStatus: 'pending', seeded: true, ...extra,
  });
  d.orders = [
    mk(done1, { status: 'completed', paymentStatus: 'completed', scrapper: { ...COLLECTOR, _id: 'scr_suresh', name: 'Suresh Pal', vehicleInfo: { type: 'Mahindra Supro', number: 'HR 55 AK 2210' }, rating: 4.7, totalRatings: 188 }, createdAt: ago(14 * DAY), completedDate: ago(14 * DAY - 3 * HOUR), preferredTime: 'now', reviewed: false }),
    mk(done2, { status: 'completed', paymentStatus: 'completed', scrapper: COLLECTOR, createdAt: ago(23 * DAY), completedDate: ago(23 * DAY - 2 * HOUR), preferredTime: 'now', reviewed: true }),
    mk(cancelled, { status: 'cancelled', cancelReason: 'Changed my plans', createdAt: ago(19 * DAY), preferredTime: 'later' }),
  ];
  d.wallet = { balance: 0, pending: 0, upiId: null, transactions: [], usedCoupons: [] };
  credit(d, d.orders[1].totalAmount, `Pickup #${d.orders[1].orderNo}`, 'Copper, Steel, Newspaper', 'order_payment', d.orders[1].completedDate);
  credit(d, 50, 'Referral bonus', 'Anil joined with your code', 'referral', ago(16 * DAY));
  credit(d, d.orders[0].totalAmount, `Pickup #${d.orders[0].orderNo}`, 'Refrigerator', 'order_payment', d.orders[0].completedDate);
  debit(d, 1000, 'Withdrawn to UPI', upiOf(user), 'withdrawal', ago(10 * DAY));
  d.wallet.transactions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  d.reviews = [{ _id: id('rev'), order: d.orders[1]._id, orderNo: d.orders[1].orderNo, scrapper: { name: COLLECTOR.name }, rating: 5, title: 'Quick and honest', comment: 'Came on time, weighed everything in front of me and paid instantly.', tags: ['On time', 'Fair weighing'], createdAt: ago(23 * DAY - HOUR) }];
  d.market = [{
    _id: id('mkt'), title: 'Office e-waste lot', description: 'Old CPUs, monitors, keyboards and cables from our office move.', estimatedWeight: 180, category: 'E-waste',
    status: 'open', endsAt: new Date(Date.now() + 5 * HOUR).toISOString(), createdAt: ago(DAY),
    bids: [
      { _id: id('bid'), scrapper: { name: 'Green Metals Co.', rating: 4.6 }, amount: 6450, message: 'Can pick up tomorrow morning.', createdAt: ago(3 * HOUR) },
      { _id: id('bid'), scrapper: { name: 'Ramesh Kumar', rating: 4.8 }, amount: 6200, message: 'Same-day pickup with loader.', createdAt: ago(5 * HOUR) },
      { _id: id('bid'), scrapper: { name: 'City E-Recyclers', rating: 4.3 }, amount: 5900, message: '', createdAt: ago(9 * HOUR) },
    ],
  }];
  d.notifications = [];
  notify(d, 'promotion', 'Copper rates are up 2.1% today', 'A good day to sell old wires and pipes.');
  notify(d, 'payment', 'Payment received', `₹${d.orders[0].totalAmount.toLocaleString('en-IN')} for #${d.orders[0].orderNo} is in your wallet.`, d.orders[0]._id);
  d.notifications.forEach((n, i) => (n.createdAt = ago((i + 1) * 5 * HOUR)));
  d.notifications[1].read = true;
}

/* ---------------------------------------------------------------- router */

function meOrThrow(d: Db) {
  const u = d.me ? d.users[d.me] : null;
  if (!u) throw new MockError('Please log in again.', 401);
  return u;
}

function orderView(d: Db, o: any) {
  return advance(d, o);
}

export async function mockApi(path: string, { method = 'GET', body = {}, query = {} }: Opts): Promise<any> {
  const d = await load();
  const b: any = body ?? {};
  await delay(path.startsWith('/translate') ? 50 : 350); // feels like a network
  const [p] = path.split('?');
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
      u = {
        _id: id('usr'), name: draft.name || 'Scraptox user', email: draft.email || '', phone: b.phone, role: 'user',
        isVerified: true, referralCode: `USER-${(draft.name || 'SX').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}${b.phone.slice(-2)}`,
        heardFrom: draft.heardFrom ?? null, referredBy: draft.referralCode || null, createdAt: new Date().toISOString(),
      };
      d.users[b.phone] = u;
      seed(d, u);
    }
    d.me = b.phone;
    delete d.pendingOtp[b.phone];
    save();
    return ok('Login successful', { token: `mock.${u._id}`, user: u });
  }
  if (p === '/auth/me') return ok('User fetched', { user: meOrThrow(d) });
  if (p === '/auth/profile' && method === 'PUT') {
    const u = meOrThrow(d);
    Object.assign(u, { name: b.name ?? u.name, email: b.email ?? u.email });
    save();
    return ok('Profile updated', { user: u });
  }
  if (p === '/auth/logout') {
    d.me = null;
    save();
    return ok('Logged out');
  }

  /* ---------- public */
  if (p === '/public/prices' || p === '/public/prices/active') return ok('Public prices retrieved successfully', { prices: PRICES });
  if (p === '/banners/public') {
    return ok('Banners fetched', {
      banners: [
        { _id: 'b1', title: 'Free doorstep pickup', subtitle: 'Weighed at your door, paid on UPI', image: 'bannerPickup', link: 'sell' },
        { _id: 'b2', title: 'Best market rates', subtitle: 'Rates updated every morning', image: 'bannerRates', link: 'prices' },
        { _id: 'b3', title: 'Instant UPI payment', subtitle: 'Money in your wallet before the truck leaves', image: 'bannerUpi', link: 'wallet' },
      ],
    });
  }

  /* ---------- translate (the real server translates; demo keeps English) */
  if (p.startsWith('/translate')) return { success: true, translations: (b.texts ?? []).map(() => null) };

  const me = meOrThrow(d);

  /* ---------- uploads */
  if (p === '/uploads/order-images' && method === 'POST') {
    return ok('Images uploaded', { files: (b.files ?? []).map((f: any) => ({ url: f.uri, publicId: id('img') })) });
  }

  /* ---------- orders */
  if (p === '/orders' && method === 'POST') {
    if (!b.scrapItems?.length && b.orderType !== 'cleaning_service') throw new MockError('Add at least one item.');
    const coords = b.pickupAddress?.coordinates ?? { lat: 28.5108, lng: 77.0705 };
    const items = (b.scrapItems ?? []).map((i: any) => ({ ...i, rate: i.rate ?? rateOf(i.category), total: Math.round(i.weight * (i.rate ?? rateOf(i.category)) * 100) / 100 }));
    const o = {
      _id: id('ord'), orderNo: nextOrderNo(d), user: me._id, orderType: b.orderType ?? 'scrap_sell', serviceDetails: b.serviceDetails ?? null,
      scrapItems: items,
      totalWeight: items.reduce((n: number, i: any) => n + (PRICES.find((x) => x.category === i.category)?.unit === 'pc' ? 0 : i.weight), 0),
      totalAmount: Math.round(items.reduce((n: number, i: any) => n + i.total, 0) * 100) / 100,
      status: 'pending', paymentStatus: 'pending', assignmentStatus: 'unassigned',
      pickupAddress: { ...b.pickupAddress, coordinates: coords, location: { type: 'Point', coordinates: [coords.lng, coords.lat] } },
      preferredTime: b.preferredTime ?? 'now', pickupSlot: b.pickupSlot ?? null, images: b.images ?? [], notes: b.notes ?? '',
      scrapper: null, createdAt: new Date().toISOString(), route: routeFor(coords),
    };
    d.orders.unshift(o);
    notify(d, 'order_update', 'Pickup requested', `We're finding a collector near you for #${o.orderNo}.`, o._id);
    save();
    return ok('Order created successfully', { order: o });
  }
  if (p === '/orders/my-orders') {
    d.orders.forEach((o) => orderView(d, o));
    save();
    return ok('Orders fetched', { orders: d.orders });
  }
  if ((r = m(/^\/orders\/([^/]+)\/cancel$/)) && method === 'POST') {
    const o = d.orders.find((x) => x._id === r![1]);
    if (!o) throw new MockError('Order not found', 404);
    orderView(d, o);
    if (o.status === 'completed') throw new MockError('This pickup is already completed.');
    if (o.status === 'in_progress') throw new MockError('The collector is already on the way. Please call them to cancel.');
    o.status = 'cancelled';
    o.cancelReason = b.reason ?? '';
    save();
    return ok('Order cancelled', { order: o });
  }
  if ((r = m(/^\/orders\/([^/]+)$/))) {
    const o = d.orders.find((x) => x._id === r![1]);
    if (!o) throw new MockError('Order not found', 404);
    orderView(d, o);
    save();
    return ok('Order fetched', { order: o });
  }

  /* ---------- marketplace (bulk lots the admin posts for the user) */
  if (p === '/marketplace/my-requests') return ok('Requests fetched', { requests: d.market });
  if ((r = m(/^\/marketplace\/bids\/([^/]+)\/accept$/)) && method === 'PATCH') {
    const req = d.market.find((x) => x.bids.some((bd: any) => bd._id === r![1]));
    if (!req) throw new MockError('Bid not found', 404);
    req.status = 'accepted';
    req.acceptedBid = r[1];
    notify(d, 'order_update', 'Bid accepted', `You accepted ₹${req.bids.find((x: any) => x._id === r![1]).amount.toLocaleString('en-IN')} for "${req.title}".`);
    save();
    return ok('Bid accepted', { request: req });
  }

  /* ---------- chat */
  if ((r = m(/^\/chats\/order\/([^/]+)$/))) {
    const o = d.orders.find((x) => x._id === r![1]);
    if (!o?.scrapper) throw new MockError('Chat opens once a collector accepts your pickup.');
    let c = d.chats.find((x) => x.order === o._id);
    if (!c) {
      c = { _id: id('chat'), order: o._id, orderNo: o.orderNo, participant: o.scrapper, messages: [
        { _id: id('msg'), from: 'them', text: `Namaste! I'm ${o.scrapper.name}, your Scraptox collector for #${o.orderNo}.`, createdAt: o.acceptedAt ?? new Date().toISOString() },
      ], updatedAt: new Date().toISOString(), unread: 1 };
      d.chats.unshift(c);
      save();
    }
    return ok('Chat fetched', { chat: c });
  }
  if (p === '/chats' || p === '/chats/my-chats') return ok('Chats fetched', { chats: d.chats });
  if ((r = m(/^\/chats\/([^/]+)\/messages$/))) {
    const c = d.chats.find((x) => x._id === r![1]);
    if (!c) throw new MockError('Chat not found', 404);
    if (method === 'POST') {
      const msg = { _id: id('msg'), from: 'me', text: String(b.message ?? '').slice(0, 1000), createdAt: new Date().toISOString() };
      c.messages.push(msg);
      c.updatedAt = msg.createdAt;
      // The collector replies a moment later.
      c.replyAt = Date.now() + 2500;
      save();
      return ok('Message sent', { message: msg });
    }
    if (c.replyAt && Date.now() >= c.replyAt) {
      c.messages.push({ _id: id('msg'), from: 'them', text: 'Theek hai ji, noted. I will call you when I reach.', createdAt: new Date(c.replyAt).toISOString() });
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

  /* ---------- wallet */
  if (p === '/wallet/profile') return ok('Wallet profile fetched successfully', { balance: d.wallet.balance, pendingClearance: d.wallet.pending, upiId: d.wallet.upiId ?? upiOf(me), minWithdrawal: 100 });
  if (p === '/wallet/transactions') return ok('Transactions fetched', { transactions: d.wallet.transactions });
  if (p === '/wallet/recharge/create' && method === 'POST') return ok('Recharge order created', { orderId: id('rzp'), amount: b.amount, demo: true });
  if (p === '/wallet/recharge/verify' && method === 'POST') {
    credit(d, Number(b.amount), 'Added to wallet', 'Demo top-up · no real payment', 'recharge');
    save();
    return ok('Wallet recharged successfully', { balance: d.wallet.balance });
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
  if (p === '/wallet/coupons') {
    return ok('Coupons fetched', { coupons: [
      { code: 'GREEN20', title: '20% extra on your next pickup', description: 'Up to ₹100 extra, credited after the pickup.', expiresAt: new Date(Date.now() + 12 * DAY).toISOString(), used: d.wallet.usedCoupons.includes('GREEN20') },
      { code: 'WELCOME50', title: '₹50 cashback', description: 'On your first pickup above ₹300.', expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), used: d.wallet.usedCoupons.includes('WELCOME50') },
    ] });
  }
  if (p === '/wallet/apply-coupon' && method === 'POST') {
    const code = String(b.code ?? '').trim().toUpperCase();
    if (!['GREEN20', 'WELCOME50'].includes(code)) throw new MockError('This coupon code is not valid.');
    if (d.wallet.usedCoupons.includes(code)) throw new MockError('You have already used this coupon.');
    d.wallet.usedCoupons.push(code);
    credit(d, code === 'GREEN20' ? 70 : 50, `Coupon ${code}`, 'Cashback', 'coupon');
    save();
    return ok('Coupon applied successfully', { balance: d.wallet.balance });
  }

  /* ---------- reviews */
  if (p === '/reviews' && method === 'POST') {
    const o = d.orders.find((x) => x._id === b.orderId);
    if (!o) throw new MockError('Order not found', 404);
    const rev = { _id: id('rev'), order: o._id, orderNo: o.orderNo, scrapper: { name: o.scrapper?.name }, rating: b.rating, title: b.title ?? '', comment: b.comment ?? '', tags: b.tags ?? [], createdAt: new Date().toISOString() };
    d.reviews.unshift(rev);
    o.reviewed = true;
    save();
    return ok('Review submitted', { review: rev });
  }
  if (p === '/reviews/my-reviews') return ok('Reviews fetched', { reviews: d.reviews });
  if ((r = m(/^\/reviews\/([^/]+)$/)) && method === 'DELETE') {
    const rev = d.reviews.find((x) => x._id === r![1]);
    d.reviews = d.reviews.filter((x) => x._id !== r![1]);
    const o = rev && d.orders.find((x) => x._id === rev.order);
    if (o) o.reviewed = false;
    save();
    return ok('Review deleted');
  }

  /* ---------- support */
  if (p === '/support' && method === 'POST') {
    const t = { _id: id('tkt'), ticketNo: `T-${d.seq++}`, category: b.category, subject: b.subject, message: b.message, status: 'open', createdAt: new Date().toISOString() };
    d.tickets.unshift(t);
    save();
    return ok('Ticket created', { ticket: t });
  }
  if (p === '/support/my-tickets') return ok('Tickets fetched', { tickets: d.tickets });

  /* ---------- PROPOSED: addresses */
  if (p === '/addresses' && method === 'GET') return ok('Addresses fetched', { addresses: d.addresses });
  if (p === '/addresses' && method === 'POST') {
    const a = { ...b, _id: id('adr') };
    if (a.isDefault || !d.addresses.length) d.addresses.forEach((x) => (x.isDefault = false));
    if (!d.addresses.length) a.isDefault = true;
    d.addresses.push(a);
    save();
    return ok('Address saved', { address: a });
  }
  if ((r = m(/^\/addresses\/([^/]+)$/))) {
    const a = d.addresses.find((x) => x._id === r![1]);
    if (!a) throw new MockError('Address not found', 404);
    if (method === 'PUT') {
      if (b.isDefault) d.addresses.forEach((x) => (x.isDefault = false));
      Object.assign(a, b, { _id: a._id });
    } else if (method === 'DELETE') {
      d.addresses = d.addresses.filter((x) => x._id !== a._id);
      if (a.isDefault && d.addresses[0]) d.addresses[0].isDefault = true;
    }
    save();
    return ok('Address updated', { address: a });
  }

  /* ---------- PROPOSED: notifications */
  if (p === '/notifications') {
    d.orders.forEach((o) => orderView(d, o));
    save();
    return ok('Notifications fetched', { notifications: d.notifications });
  }
  if (p === '/notifications/read' && method === 'PUT') {
    d.notifications.forEach((n) => (n.read = true));
    save();
    return ok('Marked read');
  }

  /* ---------- PROPOSED: referrals */
  if (p === '/referrals/me') {
    return ok('Referral stats', {
      code: me.referralCode, rewardPerReferral: 50, friendReward: 25,
      tier: { name: 'Silver', next: 'Gold', needed: 2, bonus: 200 },
      totals: { invited: 7, joined: 3, earned: 150 },
      referrals: [
        { name: 'Anil Yadav', status: 'completed', reward: 50, createdAt: new Date(Date.now() - 16 * DAY).toISOString() },
        { name: 'Simran Kaur', status: 'completed', reward: 50, createdAt: new Date(Date.now() - 9 * DAY).toISOString() },
        { name: 'Rohit Bansal', status: 'completed', reward: 50, createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
        { name: 'Neha Gupta', status: 'joined', reward: 0, createdAt: new Date(Date.now() - DAY).toISOString() },
      ],
    });
  }
  if (p === '/referrals/leaderboard') {
    return ok('Leaderboard', { month: new Date().toLocaleString('en-IN', { month: 'long' }), me: { rank: 14, name: me.name, referrals: 3, kg: 312 }, leaders: [
      { rank: 1, name: 'Vikram Malhotra', city: 'Gurugram', referrals: 24, kg: 1840 },
      { rank: 2, name: 'Pooja Arora', city: 'Noida', referrals: 19, kg: 1422 },
      { rank: 3, name: 'Aman Sethi', city: 'Delhi', referrals: 17, kg: 1310 },
      { rank: 4, name: 'Kavita Rawat', city: 'Faridabad', referrals: 12, kg: 960 },
      { rank: 5, name: 'Deepak Chauhan', city: 'Gurugram', referrals: 11, kg: 902 },
      { rank: 6, name: 'Ritu Sharma', city: 'Delhi', referrals: 9, kg: 744 },
    ] });
  }

  throw new MockError(`Demo server: ${method} ${p} is not available yet.`, 404);
}
