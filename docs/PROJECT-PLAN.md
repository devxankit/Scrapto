# Scrapto: two native apps (User + Partner), redesigned from scratch

## Context
Today the user and scrapper experiences are web modules inside one Vite/React app (`frontend/src/modules/user`, `frontend/src/modules/scrapper`), and the mobile apps wrap that site in a WebView. The goal is two separate React Native apps with the **same flows** and a fully new, professional green-and-white design. Nothing from the existing frontend UI is reused.

The method copies the Driver Finder project (`E:\Appzeto Projects\driver finder new`) and its playbook (`C:\Users\AnkitAhirwar\OneDrive\Desktop\lifeline 360\docs\NATIVE-APP-PLAYBOOK.md`): decisions, then a design canvas the user approves, then RN CLI setup, architecture, all screens on mock data, and a signed APK tested on the user's phone. The backend gets wired in a later phase.

## Decisions (answered by the user)
| # | Decision | Answer |
|---|---|---|
| 1 | Data | **Mock first** behind a service layer that mirrors the real backend API shapes; wire the real backend later |
| 2 | Tech | **React Native CLI 0.87.x + TypeScript**, the same stack as Driver Finder (no Expo) |
| 3 | Location/brand | This repo: `scrapto/user-app` and `scrapto/scrapper-app`, fully separate (no shared package). App names **"Scraptox"** and **"Scraptox Partner"** (brand confirmed by the user on 2026-11-16) |
| 4 | Package IDs | `com.scrapto.user` and `com.scrapto.partner` |
| 5 | i18n | The same setup as Driver Finder: i18next, the auto-translating `T`, `i18n-extract` and `i18n-translate` scripts using google-translate-api-x, and a Language screen. **All 13 languages**: en, hi, bn, mr, te, ta, gu, ur (RTL), kn, or, ml, pa, as |
| 6 | Maps | **Google Maps now**: `react-native-maps` with the Google provider and the existing key |
| 7 | Extras included | Scrapper KYC flow (turned on), Notifications screen (both apps), Cleaning services (user), Referral leaderboard |
| 8 | Design approval | **Claude Design canvas first**. No app code until it is approved |
| 9 | Logo | **Frontend logo** `frontend/src/assets/scraptox-removebg-preview.png` (green S-arrow mark + "Scraptox" wordmark). NOT the 3D render in `assets/` |
| 10 | App identity | One design system. The Partner app uses a deeper forest/dark accent and a denser, work-focused layout |
| 11 | Release | **Signed APK** per app, tested on **the user's connected phone (no emulator)**. AAB later, after testing |

## Phase 0: Guide docs in this repo (first output)
- Copy the playbook to `docs/NATIVE-APP-PLAYBOOK.md`.
- Write `docs/PROJECT-PLAN.md` for Scrapto: the decision log above, the full screen map for both apps, the canvas board list, phases, mock-to-real API mapping, and build steps.
- Save the decisions to project memory.

## Phase 1–2: Design direction
- Sample the logo greens and the coin gold with PIL.
- Draft tokens, to be finalised on the canvas:
  - Primary green around the logo's `#1FA855`, as a 50–900 scale.
  - Deep forest green as the Partner accent and for dark surfaces.
  - Coin gold for money, rewards and wallet only.
  - White surfaces, a faint green-tinted page background, and dark green-ink text.
  - Red only for cancel, destructive actions and errors.
  - One colour per scrap category family: metals, paper, plastic, e-waste, appliances, vehicles.
- Type: Plus Jakarta Sans as static weights 400–800. Indic scripts fall back to the system Noto fonts. Check contrast at 4.5:1 or better.
- Apply the playbook's "doesn't look AI-generated" checklist:
  - real photos from `assets/` (category, banner, status, step, reward, scrapper images)
  - a flat tab bar, 10–16px corners, hairline borders
  - dense real information: ₹/kg, kg, distance, slot, order ID
- Reference apps for feel: Scrapuncle, The Kabadiwala, Zepto/Blinkit for polish, and Uber/Rapido partner apps for the Partner side.

## Phase 3: Claude Design canvas (approval gate)
Use the Artifact quickstart with `intent: "design"` to create a Design artifact. Boards:
1. **Design system:** logo mark and wordmark, palette, category colours, type scale, buttons, inputs, chips, status pills (pending/confirmed/in-progress/completed/cancelled), list rows, cards, tab bar, and 4 design rules.
2. User app: Language → Phone → OTP and signup.
3. User app: Home (location, hero banner slider, category grid, live rates, how it works).
4. User app: Sell flow (category multi-select with ₹/kg, photos, weight, estimated payout).
5. User app: Address and schedule → Confirm.
6. User app: Request status and live tracking (map, scrapper card, progress, chat/call).
7. User app: My requests (tabs, marketplace bids) and wallet.
8. User app: Profile, refer and earn, leaderboard.
9. Partner app: Login → KYC → KYC status → subscription plans.
10. Partner app: Dashboard (online toggle, subscription, tiles, earnings).
11. Partner app: Incoming request on the map → accept, then active job execution (navigate, pick up, pay user, complete).
12. Partner app: Marketplace and bid, earnings, wallet.

Key controls are clickable and sample data is marked as sample. Iterate board by board. When the canvas is approved, write the final tokens into `docs/PROJECT-PLAN.md` and memory.

## Phase 4: Native setup (for each app)
- Scaffold:
  ```
  npx @react-native-community/cli init <App> --version 0.87.1 --package-name com.scrapto.user|partner --skip-git-init --pm npm --install-pods false
  ```
- Copy the Driver Finder settings:
  - `metro.config.js` with the watchFolders fix
  - `.eslintrc.js` and `tsconfig.json`
  - `gradle.properties` memory limits
  - portrait only, light theme, `Theme.AppCompat.Light.NoActionBar`
  - fonts in `android/app/src/main/assets/fonts` and `react-native.config.js`
- Dependencies, matching Driver Finder versions:
  - Navigation: react-navigation native, native-stack, bottom-tabs, screens, safe-area-context
  - UI: react-native-svg, lucide-react-native
  - Storage: AsyncStorage **2.2.0**
  - Media and location: image-picker, `@react-native-community/geolocation`
  - Payments: react-native-webview for Razorpay
  - Real-time and push: socket.io-client, `@react-native-firebase/app` and `messaging`
  - i18n: i18next, react-i18next, google-translate-api-x (dev)
  - Maps: **react-native-maps**
- Icons: `scripts/generate-icons.py`, adapted from Driver Finder, builds the launcher icons from the 3D logo.
- Signing:
  - A release keystore per app, with `keystore.properties` git-ignored.
  - The `gradle.taskGraph.whenReady` guard that fails a release build without the keystore.
  - Remind the user to back up both keystores.
- Windows: the repo path contains a space, so use `subst S: "E:\Appzeto Projects\scrapto"` for builds.
- Run a baseline `assembleRelease` before writing screens.

## Phase 5: Architecture (identical in both apps, copied by hand)
```
App.tsx                      i18n import → SafeArea → AppStore → RootNavigator
src/theme/index.ts           tokens from the approved canvas (no raw hex in screens)
src/components/              T.tsx, Pressable.tsx, ui.tsx, brand.tsx, sheets.tsx, Skeleton.tsx, razorpay.tsx, MapView wrapper
src/api/client.ts            fetch wrapper (same shape as Driver Finder: ApiError, timeout, upload)
src/api/services/*.ts        auth, orders, wallet, chat, marketplace, subscription, kyc, reviews, banners, prices, notifications
src/api/mock/*.ts            mock adapter returning the SAME shapes as backend/controllers/*, switched by one USE_MOCK flag
src/api/socket.ts            onSocket/emitSocket; mock emitter simulates new_order_request, scrapper_location_update, new_message
src/hooks/useQuery.ts        copied from Driver Finder
src/store/AppStore.tsx       session, profile, cached lists, actions → AsyncStorage
src/navigation/              RootNavigator + routes.ts nextRoute() + flat TabBar
src/screens/                 one file per area
src/i18n/                    index.ts, auto.ts, Alert.ts, generated/*.json (13 langs)
src/data/catalog.ts          categories → assets/ images via require(), languages, sample data (labelled)
src/utils/                   format, location, media, push
```
- The mock layer follows the real endpoints listed in `frontend/src/modules/shared/utils/api.js` and the order statuses in `backend/config/constants.js`: `pending → confirmed → in_progress → completed / cancelled`.
- Wiring the backend later only switches `USE_MOCK` and adds the missing endpoints: saved addresses, notifications, cleaning orders.

## Phase 6: Screens (same flow as the current modules, new UI)
**User app** (tabs: Home · Requests · Sell (centre) · Refer · Profile):
- Splash, Language, Login/Signup with OTP
- Home, All categories, Price list
- Sell flow: Category → Photos → Weight → Address → Confirm and schedule
- Request status and tracking, My requests (with marketplace bids and accept), Track order
- Chats and Chat thread, Notifications
- Wallet: add money, withdraw, coupons, transactions
- Profile and edit, Saved addresses, Review order, My reviews
- Refer and earn, Leaderboard
- Cleaning service: details → address → schedule → confirm
- Help, Terms and legal

**Partner app** (tabs: Home · Market · Jobs · Wallet · Profile):
- Splash, Language, Login/Signup with OTP
- KYC upload, KYC status, Subscription plans (general and market-price add-on, coupon, Razorpay)
- Dashboard with online toggle, Active requests (map, accept)
- My active jobs, Job details (navigate, pick up, pay user via wallet or Razorpay, complete)
- Marketplace list and detail with bid and report
- Chats, Notifications, Wallet, Earnings
- Profile and edit (vehicle, city), Refer and earn with milestones, Leaderboard
- Help, Terms

Build order: theme, `T` and the UI kit → data and store → auth and routing → Home, built pixel-close to the canvas → core flows end to end → tabs → sub-pages. Run the playbook's per-screen checklist on every screen: empty states, disabled states, insets, 44px targets, confirm on destructive actions.

## Phase 7: Verify and release
- Static checks: `npx tsc --noEmit`, `npx eslint src App.tsx`, `npx jest` (formatters, `nextRoute`, price and payout calculations).
- Build: `gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a`, then `apksigner verify --print-certs` (must show the release certificate).
- Test on the **user's connected phone only**:
  - Check `adb devices` and always pass `-s <serial>`.
  - Install only with the user's go-ahead.
  - Walk every flow and capture screenshots with `adb exec-out screencap`.
- Hand off: copy to `user-app/release/Scrapto-<ver>.apk` and `scrapper-app/release/ScraptoPartner-<ver>.apk` (git-ignored), plus a README per app with a demo-mode table. AAB comes later.

## Later phase (after the APKs are approved): backend wiring
- Switch `USE_MOCK` off.
- Add the backend gaps:
  - a saved-addresses API
  - a notifications list API
  - turn the cleaning order type back on
  - referral data on the server
  - an RN platform tag for FCM tokens
- Point the base URL at the live API.

## Next step after approval
Write the Phase 0 docs, then sample the logo and build the Claude Design canvas (board 1, the design system, first) for review.

---

## Logo colour samples (PIL, `assets/scrapto_logo_3d.png`)
| Sample | Hex | Use |
|---|---|---|
| Ring, body | `#0B8A45` (cluster #088040–#189058) | Primary green 600 |
| Ring, highlight | `#3FDB9C` | Light accent / 300 |
| Arrow, shade | `#077F41` | Primary 700 |
| Leaf | `#8FD07E` | Soft leaf tint |
| Coin gold | `#C9A04A` (light `#F4DA90`) | Money, wallet, rewards only |
| Tile page | `#F8F9FB` | Near-white background reference |

Final tokens are written here after the design canvas is approved.

## Build steps (Windows)
```
subst S: "E:\Appzeto Projects\scrapto"
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot"
cd /d S:\user-app\android   (or S:\scrapper-app\android)
gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```
Test only on the user's connected phone (`adb devices`, then `adb -s <serial>`), never an emulator.

## Design canvas v0.1 (sent for approval, 2026-11-16)
Link: https://claude.ai/artifact/NxQKPNq1qhc6N1k2X91Nw5 (14 boards: design system, 8 customer screens, 5 Partner screens)

Draft tokens (palette from the frontend logo: #009A33 / #00542A / #242424):
- brand `#009A33` (icons, fills) · primary `#00813A` (buttons, links; 5:1 on white) · deep `#00542A` (Partner surfaces, CTAs)
- green scale 50 `#EAF6EE` · 100 `#D2EDDB` · 200 `#A6DBB7` · 400 `#2DB35A` · 500 `#009A33` · 600 `#00813A` · 700 `#006A32` · 800 `#00542A` · 900 `#003D1F`
- ink `#1C211E` · ink2 `#3A433E` · muted `#5B655F` · faint `#9AA59F` · page `#F3F6F4` · surface `#FFFFFF` · line `#E1E7E3` · lineStrong `#D3DCD6`
- money `#C98A0B` (soft `#FFF3DC`, text `#7A4F00`) · alert `#B42318` (soft `#FDECEA`), used only for cancel and errors
- status: pending `#FFF3DC/#8A5200` · accepted `#E7EFFC/#1D4F9C` · on the way `#DFF3F4/#0B5A62` · completed `#E3F4E8/#00642F` · cancelled `#FDECEA/#9B1C12`
- font Plus Jakarta Sans 400–800 · radius 8/12/16/24/pill · flat tab bar with a 3px active marker
- The asset photos left out of the canvas (empty_*, reward_*, scrapper_plan_*, status_*) look luxury-styled and off-tone. Replace or regenerate them before the build.
