# Scraptox Partner: collector app (React Native)

The app for scrap collectors:
- go online and receive pickup requests near you
- accept a request, navigate to it, weigh the scrap at the door, pay the customer from the partner wallet, and complete the pickup
- bid on bulk marketplace lots

It is a rebuild of `frontend/src/modules/scrapper` as a native Android app, with the same flow and a new design. The design canvas is at https://claude.ai/artifact/NxQKPNq1qhc6N1k2X91Nw5 (Partner boards), and the full plan is in `../docs/PROJECT-PLAN.md`. The customer app is `../user-app`. Both apps share one design system; the Partner app uses the deep-green accent `#00542A`.

| | |
|---|---|
| Package | `com.scrapto.partner` · app name **Scraptox Partner** |
| Stack | React Native CLI 0.87.1 (New Architecture, Hermes), TypeScript, React Navigation 7 |
| Look | Plus Jakarta Sans, tokens in `src/theme/index.ts` (the same as the customer app) |
| Languages | 13 (en, hi, bn, mr, te, ta, gu, ur, kn, or, ml, pa, as) via i18next plus the auto-translating `T` (Driver Finder setup) |
| Maps | `react-native-maps` with Google. The key is in `android/secrets.properties` |

## Flow (same as the web module)

1. Login (phone and OTP, resend after 60 s).
2. New partners fill in their details: name, email, vehicle type and number, city, services, how they heard about us, and a `SCRAP-XXXX` referral code.
3. KYC upload: Aadhaar number, Aadhaar photo, selfie, and an optional driving licence.
4. KYC status.
5. Subscription plan: pickup plans, plus the market-price add-on, with a coupon.
6. Main tabs: **Home · Market · Jobs · Wallet · Profile**.
   - Home: online toggle, weekly cash-out chart, active pickups, bids, plan.
   - Incoming requests on a map, with Skip and Accept.
   - Job: Reach (Navigate opens Google Maps), then Weigh (actual weight per item), then Pay the customer (from the wallet, or a Razorpay top-up), then Complete.
   - Marketplace: open lots, my bids, won. Bid or raise a bid, report a lot, chat with the seller.
   - Wallet: add money, withdraw (UPI or bank), transactions. Earnings shows the cash-flow summary and history.
   - Profile: edit (vehicle, city, services), KYC, plans, refer partners (milestones), leaderboard, today's rates, chats, notifications, language, help, terms.

## Demo mode (mock first)

`src/api/client.ts` has `USE_MOCK = true`. Every API call is then answered on the phone by `src/api/mock.ts`, using the same paths and `{ success, message, data }` shapes as the Express backend.

| Simulated now | Replaced by |
|---|---|
| OTP: any 6-digit code works | `/auth/login-otp` and `/auth/verify-otp` (role `scrapper`) |
| KYC is approved by itself about 8 s after it is submitted | Admin review: `/kyc/:id/verify` |
| Plan payment, wallet top-up, paying the customer and withdrawals: no real money moves | Razorpay Checkout plus `/subscriptions/*`, `/wallet/*` and `/wallet/pay-order` |
| While online, a new nearby request arrives about every 40 s (at most 3 waiting) | Socket `new_order_request` plus `/orders/available` |
| Customer and seller chat reply once | Socket `new_message` |
| KYC photos stay on the phone | `POST /kyc` (multipart: aadhaar, selfie, license) |

Mock endpoints marked **PROPOSED** in `mock.ts` don't exist on the backend yet:
- `/notifications`
- `/referrals/me` and `/referrals/leaderboard`
- `POST /orders/:id/skip`
- final weights (`scrapItems`) on `PUT /orders/:id/status`

The backend's earnings summary counts a scrap pickup as money **paid out** (negative), so the app labels it "Paid to customers", not income.

Profile → **Reset demo data** clears the demo account on the phone.

## Layout

```
App.tsx                   i18n → SafeArea → AppStore → RootNavigator
src/theme                 design tokens
src/components            T (text), Pressable, ui (kit), brand (logo with PARTNER tag), Fade
src/api                   client (USE_MOCK switch, postForm for KYC), mock, socket
src/hooks/useQuery.ts     stale-while-revalidate, poll for incoming requests
src/store/AppStore.tsx    partner session (KYC, plan), online status, language, prices, location
src/navigation            stack: auth → onboarding (KYC, plan) → tabs; flat tab bar with live-job count
src/screens               auth, onboarding, home, jobs, market, chat, wallet, profile
src/i18n                  index (keys + Hindi), auto (T translation), generated/*.json
src/data/catalog.ts       category photos, languages, vehicles, services, cities
scripts/                  i18n-extract, i18n-translate, generate-icons.py (deep-green Partner icon)
```

## Run and check

```
npm install
npx react-native start
npx react-native run-android          # debug build on the connected phone
npx tsc --noEmit && npx eslint src App.tsx && npx jest
npm run i18n                          # after adding text: refresh the 12 translation files
```

## Release build (Windows)

The repo path has a space, so build from a short `subst` drive:

```
subst S: "E:\Appzeto Projects\scrapto"
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot"
cd /d S:\scrapper-app\android
gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. Copy it to `release/ScraptoxPartner-<version>.apk`. When releasing, bump `versionCode` and `versionName` in `android/app/build.gradle` and the version text on the Profile screen.

### Signing: back these up

- `android/app/scraptox-partner-upload.keystore` and `android/keystore.properties` (passwords). Both are git-ignored.
- This key is separate from the customer app's key. Every Play Store update of Scraptox Partner must be signed with it. **Copy both somewhere safe outside this PC.**
- A release build stops with an error if `keystore.properties` is missing, so it can never fall back to the debug key.
- `android/secrets.properties` holds `MAPS_API_KEY` (git-ignored). The key must allow the Android Maps SDK for `com.scrapto.partner`.

## Icons

Run `python scripts/generate-icons.py`. It builds the launcher icons from the frontend logo: the logo on a white plate over deep green, so the Partner icon looks different from the customer app's. The logo is only 500 px; put in a 1024 px+ logo before the Play Store release.
