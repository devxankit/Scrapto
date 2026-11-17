# SCRAPTO — End-to-End Test Report

**Date:** 2026-11-17
**Suite:** `backend/tests/` — 116 tests, **116 pass, 0 fail**

---

## 1. What was actually tested, and what was not

This is the most important section of this report. Your brief requires that code-level
verification be distinguished from real-device verification, and that untested device flows stay
marked unverified. They are.

| Layer | Verified | Method |
|---|---|---|
| Code compiles | **YES** | `tsc --noEmit` clean, both apps |
| App bundles for release | **YES** | Metro production bundle, both apps |
| HTTP contract (path, method, envelope, status) | **YES** | Real Express app on a real socket |
| Auth, refresh, session lifecycle | **YES** | 20 journey tests |
| MongoDB persistence | **YES** | Assertions query the DB directly |
| Authorization / IDOR | **YES** | Cross-account and cross-role attempts |
| **React Native UI interaction** | **NO** | No emulator or device available |
| **On-device journey (tap → screen update)** | **NO** | Same |
| **Push notification delivery** | **NO** | Needs a physical device + FCM |
| **Razorpay payment capture** | **NO** | Needs live keys + device webview |
| **Socket real-time sync between apps** | **NO** | Needs two live clients |

### Why there is no device verification
This machine has **no JDK, no Android SDK, no adb and no emulator**; iOS requires macOS.
`npm run android` cannot run here. Installing the toolchain is several GB and was explicitly
deferred. **Every row above marked NO remains outstanding** — no device-level claim is made
anywhere in these reports.

### Why these tests are still meaningful
They are not Postman checks. The tests re-implement `src/api/client.ts` faithfully — the `/api`
prefix, the Bearer header, the `{success, message, data}` envelope, the 401 → refresh → replay
path, and the single-flight refresh — then drive the real Express app against a real MongoDB
replica set. They caught **D2**, a blocker that would have broken sign-up for every new user on
both apps.

---

## 2. Results

### 2.1 Native client contract — `tests/native.client.integration.test.js` (20/20)

| ID | Journey | Result |
|---|---|---|
| E2E-1 | Unknown phone → 404 → app shows sign-up | **PASS** |
| E2E-2 | Full user sign-up; account persisted, phone marked verified | **PASS** |
| E2E-3 | Returning user recognised; OTP resend rate-limited (429) | **PASS** |
| E2E-3b | Known number → 200, so the app skips sign-up | **PASS** |
| E2E-4 | Session restores after app restart (`/auth/me`) | **PASS** |
| E2E-5 | Expired access token refreshed, original call replayed | **PASS** |
| E2E-6 | **6 concurrent 401s → exactly 1 refresh, no sign-out** | **PASS** |
| E2E-7 | No refresh token → one clean sign-out, no retry loop | **PASS** |
| E2E-8 | `logout-all` revokes session; refresh cannot resurrect it | **PASS** |
| E2E-9 | Address saved, listed, persisted to MongoDB | **PASS** |
| E2E-10 | Notification list → mark read → badge clears | **PASS** |
| E2E-11 | Wallet envelope exposes `data.balance` as screens expect | **PASS** |
| E2E-12 | Orders list correctly shaped (`data.orders` array) | **PASS** |
| E2E-13 | User token refused on scrapper endpoints (403) | **PASS** |
| E2E-14 | Wrong-portal login refused with an explanatory message | **PASS** |
| E2E-15 | Blocked account loses access | **PASS** |
| E2E-16 | Single-device logout leaves other devices signed in | **PASS** |
| E2E-17 | Deactivated account → app signs user out (not a dead session) | **PASS** |
| E2E-18 | Ordinary role 403 does **not** sign the user out | **PASS** |
| E2E-19 | Middleware refusals carry a human-readable reason | **PASS** |

### 2.2 New backend modules — `tests/addresses.notifications.test.js` (22/22)

| ID | Check | Result |
|---|---|---|
| ADDR-1 | Empty address book for a new user | **PASS** |
| ADDR-2 | Create persists to MongoDB; first address becomes default | **PASS** |
| ADDR-3 | Missing street/city and bad pincode rejected; nothing persists | **PASS** |
| ADDR-4 | Out-of-range coordinates rejected | **PASS** |
| ADDR-5 | Update mutates the right subdocument, adds none | **PASS** |
| ADDR-6 | Exactly one address holds the default flag | **PASS** |
| ADDR-7 | `PATCH :id/default` switches the default | **PASS** |
| ADDR-8 | Delete removes it and promotes a new default | **PASS** |
| ADDR-9 | **IDOR: cannot read/update/delete another user's address** | **PASS** |
| ADDR-10 | Unauthenticated 401; scrapper 403 | **PASS** |
| NOTE-1 | List reflects persisted rows and unread count | **PASS** |
| NOTE-2 | Only my own notifications are listed | **PASS** |
| NOTE-3 | Mark-all-read persists `read` + `readAt` | **PASS** |
| NOTE-4 | Marking read does not touch another user's rows | **PASS** |
| NOTE-5 | Newest-first ordering with pagination | **PASS** |
| NOTE-6 | Scrappers receive in-app notifications too | **PASS** |
| NOTE-7 | **Push helper leaves an in-app record even with no FCM token** | **PASS** |
| NOTE-8 | Unauthenticated access refused | **PASS** |
| LOGOUT-1 | Single-device logout does not bump `tokenVersion` | **PASS** |
| LOGOUT-2 | Logout unregisters only this device's FCM token | **PASS** |
| LOGOUT-3 | `logout-all` still revokes every session | **PASS** |
| LOGOUT-4 | Unauthenticated logout refused | **PASS** |

### 2.3 Pre-existing suite (74/74)

`admin.operations`, `auth.security`, `e2e.complete`, `financial.wallet`, `kyc.privacy`,
`order.marketplace`, `payment.webhook`, `socket.supporting` — **all still pass. No regressions.**

---

## 3. Test infrastructure

- **Runner:** `node --test` (already the project's choice; no new dependency added)
- **Database:** `MongoMemoryReplSet` — a real MongoDB replica set, so transactions work
- **HTTP:** `supertest` and a real `app.listen()` socket
- **OTP:** `OTP_TEST_NUMBERS` fixed codes, so full auth journeys need no SMS provider

No new test tooling was introduced. Detox and Maestro were **not** added: both require a device
or emulator, which does not exist here, so adding them would produce unrunnable tests.

### Note on running the suite
Use `npm test` (which sets `--test-concurrency=1`). Running the files in parallel starts one
MongoDB per file and exceeds the 10 s startup budget — a harness limit, not a product defect.

---

## 4. Defects this testing caught

1. **D2 — `purpose: 'register'` → HTTP 400.** Both apps sent a value the validator rejects.
   Sign-up would have failed for **every new user on both apps** the moment mocks were switched
   off. Found only by driving the real endpoint; a mock-based test could never have caught it.
2. **D9 — blocked accounts return 403, not 401.** The client signed out only on 401, so a blocked
   user kept a dead session on screen. Now handled via `ACCOUNT_DEACTIVATED` / `SCRAPPER_BLOCKED`.
3. **D8 — middleware sends `error`, controllers send `message`.** The client read only `message`,
   so account-state refusals showed "Something went wrong (403)" instead of the real reason.

Two initial test failures were **my own incorrect expectations**, not product bugs, and are
documented rather than hidden: the OTP 60 s resend cooldown (correct security behaviour) and the
403-vs-401 status for blocked accounts (correct, and arguably better than 401).

---

## 5. To enable real device verification

```bash
winget install EclipseAdoptium.Temurin.17.JDK
winget install Google.AndroidStudio      # or cmdline-tools + an AVD
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
cd user-app && npm run android
```

Then the outstanding rows in §1 can be closed: UI interaction, push delivery, Razorpay webview,
KYC camera upload, and socket sync between the two apps.
