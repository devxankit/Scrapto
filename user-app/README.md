# Scraptox: customer app (React Native)

The customer app for selling scrap: book a doorstep pickup, track the collector live, and get paid to the wallet. It is a rebuild of `frontend/src/modules/user` as a native Android app, with the same flow and a new design. The design canvas is at https://claude.ai/artifact/NxQKPNq1qhc6N1k2X91Nw5, and the full plan is in `../docs/PROJECT-PLAN.md`.

| | |
|---|---|
| Package | `com.scrapto.app` · app name **Scraptox** |
| Stack | React Native CLI 0.87.1 (New Architecture, Hermes), TypeScript, React Navigation 7 |
| Look | Plus Jakarta Sans, tokens in `src/theme/index.ts` (copied from the canvas) |
| Languages | 13 (en, hi, bn, mr, te, ta, gu, ur, kn, or, ml, pa, as) via i18next plus the auto-translating `T` (Driver Finder setup) |
| Maps | `react-native-maps` with Google. The key is in `android/secrets.properties` |

## Demo mode (mock first)

`src/api/client.ts` has `USE_MOCK = true`. Every API call is then answered on the phone by `src/api/mock.ts`, using the same paths and `{ success, message, data }` shapes as the Express backend.

| Simulated now | Replaced by |
|---|---|
| OTP: any 6-digit code works | `/auth/login-otp` and `/auth/verify-otp` (SMS India Hub) |
| An order moves by itself: accepted after 8 s, on the way after 20 s, weighing at about 110 s, paid at about 140 s | Partner app plus socket `scrapper_location_update` |
| Wallet top-up and withdrawal: no real money moves | Razorpay Checkout plus `/wallet/*` |
| Collector chat replies once | Socket `new_message` |
| Photos stay on the phone | `/uploads/order-images` (Cloudinary) |

Mock endpoints marked **PROPOSED** in `mock.ts` don't exist on the backend yet: `/addresses`, `/notifications`, `/referrals/me`, `/referrals/leaderboard`, and the `cleaning_service` order type. They are the to-do list for the backend phase.

Profile → **Reset demo data** clears the demo account on the phone.

## Layout

```
App.tsx                   i18n → SafeArea → AppStore → RootNavigator
src/theme                 design tokens
src/components            T (text), Pressable, ui (kit), brand, Fade
src/api                   client (USE_MOCK switch), mock, socket
src/hooks/useQuery.ts     stale-while-revalidate, poll for live tracking
src/store/AppStore.tsx    session, language, prices, addresses, sell draft
src/navigation            native stack + flat tab bar (Sell key in the middle)
src/screens               auth, home, sell, orders, chat, wallet, profile, cleaning
src/i18n                  index (keys + Hindi), auto (T translation), generated/*.json
src/data/catalog.ts       category photos and families, languages, slots
scripts/                  i18n-extract, i18n-translate, generate-icons.py
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
cd /d S:\user-app\android
gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. Copy it to `release/Scraptox-<version>.apk`. When releasing, bump `versionCode` and `versionName` in `android/app/build.gradle` and the version text on the Profile screen.

### Signing: back these up

- `android/app/scraptox-user-upload.keystore` and `android/keystore.properties` (passwords). Both are git-ignored.
- Every Play Store update must be signed with this same key. **Copy both somewhere safe outside this PC.**
- A release build stops with an error if `keystore.properties` is missing, so it can never fall back to the debug key.
- `android/secrets.properties` holds `MAPS_API_KEY` (git-ignored). The key must allow the Android Maps SDK for `com.scrapto.app`.

## Icons

Run `python scripts/generate-icons.py`. It builds all launcher icons from the frontend logo, but that logo is only 500 px. Put in a 1024 px+ logo before the Play Store release.
