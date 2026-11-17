# SCRAPTO — Native API Integration Matrix

> **Partly superseded.** `GET /referrals/me` and `/referrals/leaderboard` now exist (no longer API MISSING), and several defects below gained follow-up fixes. See `HANDOFF_NATIVE_INTEGRATION.md` for the current state.

**Date:** 2026-11-17
**Branch:** `remediation/backend-hardening`
**Scope:** `user-app` (ScraptoxUser) and `scrapper-app` (scraptox-partner) against `backend/`

---

## 1. Headline finding

Both React Native apps shipped with **`USE_MOCK = true`** in `src/api/client.ts`. Every API call
was answered on-device by `src/api/mock.ts` — a complete fake database in AsyncStorage
(29 KB user / 40 KB partner). The real `fetch` path existed but was unreachable.

The honest starting integration status of **every feature in both apps** was therefore
`MOCKED / HARDCODED`, regardless of how finished the screens looked.

This phase switched both apps to the real backend, built the missing backend modules, and fixed
the contract defects that blocked the switch.

---

## 2. Discovery inventory (measured, not estimated)

| Metric | Value |
|---|---|
| React Native version | 0.87.1 (both apps) |
| Screen components — user-app | 34 |
| Screen components — scrapper-app | 28 |
| Backend route definitions | 181 |
| Distinct API paths called — user-app | 30 (18 mutations + 12 `useQuery` reads) |
| Distinct API paths called — scrapper-app | 31 (18 mutations + 13 `useQuery` reads) |
| Backend test count before this work | 74 |
| Backend test count after this work | 116 |

Both apps share one architecture: `api/client.ts` → `api/mock.ts`, `store/AppStore.tsx` for
session/prices/addresses, `hooks/useQuery.ts` for screen-level reads, `api/socket.ts` for
real-time. No UI, navigation or styling was changed in this phase.

---

## 3. Integration matrix

Status legend: **CONNECTED AND VERIFIED** (code + API + DB proven by test) ·
**CONNECTED, NOT DEVICE-VERIFIED** (contract correct, no device run) ·
**API MISSING** · **BLOCKED**

### 3.1 Authentication & session — both apps

| App | Screen / Action | Endpoint | Backend module | DB model | Status |
|---|---|---|---|---|---|
| both | Phone entry → request OTP | `POST /auth/login-otp` | authController.sendLoginOTP | User | **CONNECTED AND VERIFIED** |
| both | New number → sign-up | `POST /auth/register` | authController.register | User | **CONNECTED AND VERIFIED** |
| both | OTP screen → verify | `POST /auth/verify-otp` | authController.verifyOTP | User | **CONNECTED AND VERIFIED** |
| both | Session restore on launch | `GET /auth/me` | authController.getMe | User | **CONNECTED AND VERIFIED** |
| both | Silent token refresh | `POST /auth/refresh-token` | authController.refreshToken | User | **CONNECTED AND VERIFIED** |
| user | Edit profile | `PUT /auth/profile` | authController.updateProfile | User | CONNECTED, NOT DEVICE-VERIFIED |
| both | Logout (this device) | `POST /auth/logout` | authController.logout **(built)** | User | **CONNECTED AND VERIFIED** |
| both | Blocked account → forced sign-out | 403 `ACCOUNT_DEACTIVATED` | middleware/auth.js | User | **CONNECTED AND VERIFIED** |

### 3.2 User app — core journey

| Screen / Action | Endpoint | Backend module | DB model | Status |
|---|---|---|---|---|
| Home — rate list | `GET /public/prices` | publicController | Price | CONNECTED, NOT DEVICE-VERIFIED |
| Home — banners | `GET /banners/public` | bannerController | Banner | CONNECTED, NOT DEVICE-VERIFIED |
| Home/bell — notifications | `GET /notifications` | notificationController **(built)** | Notification **(new)** | **CONNECTED AND VERIFIED** |
| Notifications — mark read | `PUT /notifications/read` | notificationController **(built)** | Notification **(new)** | **CONNECTED AND VERIFIED** |
| Address book — list | `GET /addresses` | addressController **(built)** | User.addresses **(new)** | **CONNECTED AND VERIFIED** |
| Address — add / edit / delete | `POST·PUT·DELETE /addresses` | addressController **(built)** | User.addresses **(new)** | **CONNECTED AND VERIFIED** |
| Address — set default | `PATCH /addresses/:id/default` | addressController **(built)** | User.addresses **(new)** | **CONNECTED AND VERIFIED** |
| Sell — upload photos | `POST /uploads/order-images` | uploadController | — (Cloudinary) | CONNECTED, NOT DEVICE-VERIFIED |
| Sell — book pickup | `POST /orders` | orderController.createOrder | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Orders — my pickups | `GET /orders/my-orders` | orderController.getMyOrders | Order | **CONNECTED AND VERIFIED** (shape) |
| Orders — cancel | `POST /orders/:id/cancel` | orderController.cancelOrder | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Cleaning service request | `POST /orders` | orderController.createOrder | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Wallet — balance | `GET /wallet/profile` | walletController | User.wallet | **CONNECTED AND VERIFIED** (shape) |
| Wallet — transactions | `GET /wallet/transactions` | walletController | WalletTransaction | CONNECTED, NOT DEVICE-VERIFIED |
| Wallet — recharge | `POST /wallet/recharge/create` + `/verify` | walletController | Payment | **BLOCKED** (Razorpay live keys) |
| Wallet — withdraw | `POST /wallet/withdraw` | walletController | WithdrawalRequest | CONNECTED, NOT DEVICE-VERIFIED |
| Wallet — apply coupon | `POST /wallet/apply-coupon` | walletController | CouponModel | CONNECTED, NOT DEVICE-VERIFIED |
| Reviews — submit | `POST /reviews` | reviewController | Review | CONNECTED, NOT DEVICE-VERIFIED |
| Reviews — mine | `GET /reviews/my-reviews` | reviewController | Review | CONNECTED, NOT DEVICE-VERIFIED |
| Support — raise ticket | `POST /support` | supportController | HelpTicket | CONNECTED, NOT DEVICE-VERIFIED |
| Marketplace — my requests | `GET /marketplace/my-requests` | marketplaceController | MarketplaceRequest | CONNECTED, NOT DEVICE-VERIFIED |
| Marketplace — accept bid | `PATCH /marketplace/bids/:id/accept` | marketplaceController | Bid | CONNECTED, NOT DEVICE-VERIFIED |
| Chat — list / messages | `GET /chats`, `/chats/:id/messages` | chatController | Chat, Message | CONNECTED, NOT DEVICE-VERIFIED |
| Referrals — my stats | `GET /referrals/me` | — | — | **API MISSING** |
| Referrals — leaderboard | `GET /referrals/leaderboard` | — | — | **API MISSING** |

### 3.3 Scrapper app — core journey

| Screen / Action | Endpoint | Backend module | DB model | Status |
|---|---|---|---|---|
| Profile / session | `GET /scrappers/me` | scrapperController | Scrapper | CONNECTED, NOT DEVICE-VERIFIED |
| Profile edit, online toggle, live location | `PUT /scrappers/me` | scrapperController | Scrapper | CONNECTED, NOT DEVICE-VERIFIED |
| Dashboard counters | `GET /scrappers/stats` | scrapperController.getScrapperStats | Scrapper, Order | CONNECTED, NOT DEVICE-VERIFIED |
| KYC — upload documents | `POST /kyc` (multipart) | kycController | Scrapper.kyc | **BLOCKED** (device file picker) |
| KYC — status | `GET /kyc/me` | kycController | Scrapper.kyc | CONNECTED, NOT DEVICE-VERIFIED |
| Subscription — plans | `GET /subscriptions/plans` | subscriptionController | SubscriptionPlan | CONNECTED, NOT DEVICE-VERIFIED |
| Subscription — validate coupon | `POST /subscriptions/validate-coupon` | subscriptionController | CouponModel | CONNECTED, NOT DEVICE-VERIFIED |
| Subscription — subscribe / verify | `POST /subscriptions/subscribe` + `/verify-payment` | subscriptionController | SubscriptionPlan, Payment | **BLOCKED** (Razorpay live keys) |
| Jobs — available orders | `GET /orders/available` | orderController.getAvailableOrders | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Jobs — my assigned | `GET /orders/my-assigned` | orderController.getMyAssignedOrders | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Jobs — accept | `POST /orders/:id/accept` | orderController.acceptOrder | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Jobs — update status | `PUT /orders/:id/status` | orderStateMachine | Order | CONNECTED, NOT DEVICE-VERIFIED |
| Jobs — pay via wallet | `POST /wallet/pay-order` | walletController | WalletTransaction | CONNECTED, NOT DEVICE-VERIFIED |
| Market — browse requests | `GET /marketplace/requests` | marketplaceController | MarketplaceRequest | CONNECTED, NOT DEVICE-VERIFIED |
| Market — place bid | `POST /marketplace/requests/:id/bids` | marketplaceController | Bid | CONNECTED, NOT DEVICE-VERIFIED |
| Earnings — summary / history | `GET /scrapper/earnings/summary`, `/history` | earningsController | Order, WalletTransaction | CONNECTED, NOT DEVICE-VERIFIED |
| Wallet — balance / withdraw | `GET /wallet/profile`, `POST /wallet/withdraw` | walletController | WithdrawalRequest | CONNECTED, NOT DEVICE-VERIFIED |
| Notifications | `GET /notifications`, `PUT /notifications/read` | notificationController **(built)** | Notification **(new)** | **CONNECTED AND VERIFIED** |
| Support ticket | `POST /support` | supportController | HelpTicket | CONNECTED, NOT DEVICE-VERIFIED |
| Chat | `GET /chats`, `/chats/:id/messages` | chatController | Chat, Message | CONNECTED, NOT DEVICE-VERIFIED |
| Referrals — stats / leaderboard | `GET /referrals/me`, `/referrals/leaderboard` | — | — | **API MISSING** |

---

## 4. Defects found and fixed

| # | Defect | Severity | Where fixed |
|---|---|---|---|
| D1 | `USE_MOCK = true` — all data fake in both apps | **Blocker** | `src/config/env.ts` (new), both `client.ts` |
| D2 | `purpose: 'register'` rejected with HTTP 400 by `verifyOTPValidator`, which allows only `login`/`verification`. **Sign-up would have failed for every new user in both apps.** | **Blocker** | both `store/AppStore.tsx` |
| D3 | `/addresses` CRUD did not exist; `User.address` was a single embedded object, not an array | **Blocker** (order creation depends on it) | `models/User.js`, `controllers/addressController.js`, `routes/addressRoutes.js` |
| D4 | `/notifications` did not exist; FCM push was fire-and-forget with no history | **High** | `models/Notification.js`, `controllers/notificationController.js`, `routes/notificationRoutes.js`, `utils/pushNotificationHelper.js` |
| D5 | `/auth/logout` did not exist (only `/auth/logout-all`) | **Medium** | `controllers/authController.js`, `routes/authRoutes.js` |
| D6 | `isNewUser` flag never returned; apps branched on a field that is always `undefined` | **High** | both `store/AppStore.tsx` — derive from the 404 |
| D7 | No token refresh at all; apps stored only the access token and discarded `refreshToken` | **High** | both `client.ts` (single-flight refresh), both `AppStore.tsx` |
| D8 | Middleware refusals return `error`, controllers return `message`; the client read only `message`, so auth errors showed a generic fallback | **Medium** | both `client.ts` |
| D9 | A deactivated account returns **403**, not 401, so `onUnauthorized` never fired and a dead session stayed on screen | **High** | both `client.ts` (sign out on `ACCOUNT_DEACTIVATED` / `SCRAPPER_BLOCKED` only) |

### Why single-flight refresh matters
The backend **rotates** the refresh token on every use. Without coalescing, N concurrent 401s
would fire N refresh calls; all but the first would present an already-consumed token, be
rejected, and sign out a perfectly good session. Test **E2E-6** asserts exactly one refresh
across six parallel 401s.

---

## 5. Remaining gaps

| Item | Status | Why |
|---|---|---|
| `GET /referrals/me` | **API MISSING** | Both apps have referral screens; `referralRoutes.js` is mounted at `/admin/referral-system` and has no user-facing endpoints |
| `GET /referrals/leaderboard` | **API MISSING** | Same |
| Razorpay payment capture | **BLOCKED** | Needs live gateway credentials + a device webview |
| KYC document upload | **BLOCKED** | Needs a device camera/file picker |
| Push notification delivery | **BLOCKED** | Needs a physical device + FCM registration; in-app persistence is verified |
| Socket real-time sync | **NOT VERIFIED** | Needs two live clients; not attempted this phase |
| Every on-device user journey | **NOT VERIFIED** | No JDK/Android SDK/emulator in this environment — see the E2E report |

---

## 6. Verification evidence

```
backend:  npm test  →  116 tests, 116 pass, 0 fail
          (74 pre-existing + 42 new; no regressions)

user-app:      tsc --noEmit  → clean
               production bundle → 3.4 MB
scrapper-app:  tsc --noEmit  → clean
               production bundle → 3.4 MB
```

Production bundles dropped from **9.5 MB to 3.4 MB** and contain no `scraptox.mock` AsyncStorage
key, confirming the mock database is tree-shaken out of a release build.

---

## 7. What "verified" means here

| Layer | Verified? |
|---|---|
| Code implementation | **Yes** — typecheck + production bundle, both apps |
| API connectivity | **Yes** — real Express app over a real HTTP socket |
| Database persistence | **Yes** — assertions read MongoDB directly, not just the response |
| End-to-end via React Native UI | **No** — no emulator/device available |
| Real-device verification | **No** — no JDK, Android SDK, adb, or Mac |

No integration is marked complete merely because an endpoint exists.
