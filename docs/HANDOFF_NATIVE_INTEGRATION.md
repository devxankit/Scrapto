# Scrapto native apps ↔ backend: handoff

**As of:** 2026-11-17 · **Apps:** `user-app` (com.scrapto.user), `scrapper-app` (com.scrapto.partner) · **Backend:** `backend/`

This note is for whoever continues the integration. It says what is done, what is proven, what is left, and how to run everything locally.

---

## 1. Where things stand

| Area | State |
|---|---|
| Mock data | **Removed from the request path.** Both apps call the real backend; `mock.ts` is only used when `USE_MOCK_API=true` (see `src/config/env.ts`). Release bundles contain no mock database. |
| Backend endpoints the apps call | **All exist.** Added this cycle: `/addresses`, `/notifications`, `/auth/logout`, `/referrals/me`, `/referrals/leaderboard`. |
| Backend tests | `npm test`: 137 tests (74 pre-existing + 63 new). Run with `--test-concurrency=1`, which `npm test` already does. |
| Live API audit | 42/42 pass against the real backend on the dev PC and the real Atlas `scrapto` database (`api_audit` journey: auth, refresh, addresses, notifications, referrals, wallet reads, orders reads, support, chat, marketplace, logout). |
| Debug APKs | Built and installed on a physical phone (OPPO CPH2617, Android 15). |
| On-device testing | **Only U-01 done** (user app launches without crashing). Every other on-device journey is still to do; see §3. |
| Release APKs | Build started 2026-11-17 with new upload keys (see §4). Release builds talk to **Render**, which does not have this cycle's backend changes until it is redeployed. |

---

## 2. Defects fixed this cycle (all with regression tests)

| # | Defect | Fix |
|---|---|---|
| 1 | Sign-up impossible on the real backend: `/auth/login-otp` returns 404 for a new number and sends no SMS; the app asked for a code that was never sent and called `/auth/register` only after. | User app: OTP screen collects name + email first, button "Send code" calls `/auth/register` (which texts the code), then "Verify". Partner app: Login → Signup (register) → OTP. |
| 2 | Apps sent `purpose: 'register'` to `/auth/verify-otp`; the validator only allows `login`/`verification` → HTTP 400 for every new user. | Apps send `verification`. |
| 3 | Refresh tokens were reusable for their full 30-day life (rotation was cosmetic; found by the live audit). | Single-use refresh tokens with a per-device id (`User.refreshSessions`, max 10). Replaying a consumed token revokes every session. `logout` revokes that device's refresh token. |
| 4 | Saving an address regenerated the user's referral code (partial `select()` + `save()` triggered the code generator). Found by checking Atlas after the live audit. | `models/User.js` pre-save hook skips documents loaded without `referralCode`. |
| 5 | Order categories: backend allowed only 6 scrap categories (plus leftover toy categories), case-sensitively; the apps use 26. Admin price "Copper" never matched order "copper", so the client's rate was used. | 26 app categories added; matching is case-insensitive in validator, schema and price lookup (approved by the product owner 2026-11-17). |
| 6 | Blocked accounts (403 `ACCOUNT_DEACTIVATED`/`SCRAPPER_BLOCKED`) kept a dead session on screen; middleware error text (`error`) never shown. | Client signs out on those codes; reads `message` or `error`. |
| 7 | Socket kept the sign-in token forever; after a refresh, a reconnect was refused and real-time updates silently stopped. | Socket reads the current token on each reconnect and recovers once through the REST refresh path. |
| 8 | Leaderboard screens crashed with fewer than 3 leaders; referral tier card crashed with no tiers configured. | Minimal guards in `profile.tsx` (both apps). |
| 9 | Partner app rejected every real referral code (`SCRAP-` + 4 chars expected; backend issues 8). | Accepts `SCRAP-`/`USER-` + 4–12 chars. |
| 10 | Partner's chosen vehicle was discarded at registration. | `register` stores the validated `vehicleInfo`. |
| 11 | "Demo build: …" notes shown against the real backend. | Hidden whenever `USE_MOCK` is false. |

---

## 3. What is left (in priority order)

1. **Prices.** Atlas has **0** `prices` documents, so no order can be priced. Note: when a category has no active price, `orderController.buildScrapItems` accepts the **client's** rate (capped at ₹1,00,000/kg). Recommend refusing orders for categories without an active price once the list is seeded. Order pricing also ignores `regionCode`.
2. **On-device journeys** (nothing beyond app launch is device-verified): sign-up, OTP, session restore, addresses, sell flow, order tracking, notifications, referrals, wallet; partner sign-up, KYC upload, accept → progress → complete, settlement, earnings; cross-app sync over sockets; network-loss and app-kill tests.
3. **Push notifications.** The backend logs "Firebase service account file not found" on this PC, so FCM is off locally. In-app notifications (persisted) work.
4. **Payments.** Razorpay recharge/subscription flows untested; use test keys only.
5. **Deploy the backend to Render** before testing release APKs (they point to `https://scrapto-1.onrender.com`).
6. **Google Maps key.** `android/secrets.properties` (`MAPS_API_KEY`) is missing in both apps, so maps render blank.
7. **Secrets.** `JWT_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `backend/.env` are 6 characters (dev only; production refuses to boot with short JWT secrets). Rotate in the hosting environment before launch.

### Product decisions still open
- **Email at sign-up.** The backend requires it (schema `required` + unique index), so the apps now require it. Making it optional needs a schema change and a partial unique index migration.
- **Referral rewards.** Admins can configure amounts/tiers, but nothing creates `Referral` documents or pays rewards; "Earned" correctly shows ₹0. The leaderboard copy promises "bonus wallet cash" that nothing pays.
- `user-app/src/screens/cleaning.tsx` still shows the placeholder "[PRICE LIST TO BE PROVIDED]".

---

## 4. Release signing

**Final Play Store keys: Ankit's (the project owner's).** Every release and every Play Store upload of both apps must be signed with them. The keys generated on 2026-11-17 on the integration dev PC (SHA-256 `CA:5E:54:2A:…` user, `80:71:A3:CE:…` partner) are **not** the release keys. Do not use them for any build that is distributed, and do not upload anything signed with them to Play.

| App | Package | Keystore (git-ignored) | Release SHA-256 |
|---|---|---|---|
| user-app | `com.scrapto.user` | `android/app/scraptox-user-upload.keystore` + `android/keystore.properties` | `A1:99:09:A7:D5:5D:6B:83:A3:66:2B:3D:9A:6C:6E:77:45:88:46:A9:55:C1:EE:73:AA:9F:3F:0C:BD:C7:A6:74` |
| scrapper-app | `com.scrapto.partner` | `android/app/scraptox-partner-upload.keystore` + `android/keystore.properties` | `46:24:5E:DC:1E:8D:36:15:5F:B0:2D:95:AC:4A:E8:1C:BB:7A:78:4F:50:E2:1F:7A:40:51:00:AF:E6:69:F6:CE` |

- Release APKs/AABs are built and signed by Ankit. Check with `apksigner verify --print-certs`; the SHA-256 must match the table.
- The keystores and passwords are never committed or sent through git or chat. Ask Ankit if you need a signed build.
- Debug builds use the public RN `debug.keystore` and are fine for testing.

---|---|---|
| user-app | `android/app/scraptox-user-upload.keystore` (SHA-256 `CA:5E:54:2A:…:30:BA`) | `android/keystore.properties` |
| scrapper-app | `android/app/scraptox-partner-upload.keystore` (SHA-256 `80:71:A3:CE:…:35:3B`) | `android/keystore.properties` |

**Back both files up somewhere safe now.** Losing an upload key blocks Play Store updates. If the apps already have Play Store keys, put those in place instead and rebuild.

---

## 5. Running it locally (Windows dev PC)

- **Toolchain** (installed per-user on `D:\dev`, no admin): JDK 17 `D:\dev\java\jdk-17.0.21+9`, Android SDK `D:\dev\android-sdk` (platform 37, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1), `GRADLE_USER_HOME=D:\dev\gradle-home`. Gradle 9.4.1 / AGP 9.2.1 need JDK 17–26.
- **Backend:** `cd backend && node server.js` (port 7000, Atlas). For test accounts without SMS, set `OTP_TEST_NUMBERS` in the shell (dev only; production refuses it), e.g. `6000000101:<code>,6000000201:<code>`.
- **Dev API address:** `src/config/env.ts` → `DEV_API_URL` (used only by debug builds). The PC's LAN IP is DHCP and changed during testing (`.46` → `.33`); update both apps and rebuild when it changes, or reserve the IP in the router.
- **Debug builds without Metro:** both apps' debug APKs carry their JS bundle in `android/app/src/debug/assets` (git-ignored), so the two apps can run side by side. Regenerate after any JS change:
  `npx react-native bundle --platform android --dev true --entry-file index.js --bundle-output android/app/src/debug/assets/index.android.bundle --assets-dest android/app/src/debug/res`
  then `cd android && gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a`.
- **Firewall:** inbound TCP 7000/8081 allowed from the local subnet (admin rule).
- **Phone over Wi-Fi:** the OPPO turns Wireless debugging off when the screen sleeps; keep it charging with Developer options → Stay awake. A USB cable is more reliable.

---

## 6. Test records in Atlas

All test data uses reserved numbers `6000000101`, `6000000102` (API audit user, "E2E TEST Api User"), `6000000201`, and labels starting with "E2E TEST". No existing record was modified. Two "E2E TEST ticket - ignore" support tickets exist.
