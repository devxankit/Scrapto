# SCRAPTO — Integration Certification (Phase 3)

> **Partly superseded.** Later on 2026-11-17 the referral endpoints were built, sign-up and refresh-token defects were fixed, the category mapping was approved and implemented, and debug APKs were installed on a real phone. See `HANDOFF_NATIVE_INTEGRATION.md` for the current state; this report is kept as the Phase 3 record.

**Date:** 2026-11-17
**Branch:** `remediation/backend-hardening`

---

## 1. Certification statement

> **Both React Native apps are switched from on-device mocks to the real Scrapto backend.
> Authentication, session lifecycle, the saved address book and in-app notifications are
> implemented and verified against a real Express server and a real MongoDB, including database
> persistence and cross-account authorization.**
>
> **This is NOT a full-platform certification.** No user journey has been executed through the
> React Native UI on a device or emulator, because none is available in this environment.
> Payments, KYC upload, push delivery and socket sync remain **BLOCKED** or **UNVERIFIED**.

Integration coverage is **not** claimed at 100%. The gaps are enumerated in §5.

---

## 2. Scope delivered

Phase 3 of the 10-phase brief, plus the discovery and mapping of Phases 1–2.

| Phase | State |
|---|---|
| 1 — Repository discovery & app mapping | **COMPLETE** |
| 2 — API inventory & frontend↔backend mapping | **COMPLETE** |
| 3 — Authentication & session integration | **COMPLETE AND VERIFIED** |
| 4 — User app integration | **PARTIAL** — contracts mapped, addresses/notifications done |
| 5 — Scrapper app integration | **PARTIAL** — contracts mapped, auth done |
| 6 — Cross-app business flow | **NOT STARTED** |
| 7 — Real-time & notifications | **PARTIAL** — in-app history done; push/socket unverified |
| 8 — Error handling & network reliability | **PARTIAL** — refresh, 403, error messages done |
| 9 — End-to-end mobile testing | **BLOCKED** — no device/emulator |
| 10 — Full regression & certification | **PARTIAL** — backend regression green |

---

## 3. Acceptance criteria — honest assessment

| Criterion | Status |
|---|---|
| Every discovered screen action classified | **MET** — see integration matrix |
| All required APIs connected | **NOT MET** — 2 referral endpoints missing |
| No business-critical feature relies on mocks | **MET** — mock DB tree-shaken out of release bundles |
| Authentication works in both apps | **MET AND VERIFIED** |
| Data persisted correctly | **MET** for addresses/notifications/auth; untested elsewhere |
| Both apps show consistent server state | **NOT VERIFIED** — needs two live clients |
| Financial flows verified end-to-end | **NOT MET** — Razorpay credentials unavailable |
| Notifications work where supported | **PARTIAL** — in-app verified; push delivery unverified |
| Network failures handled correctly | **PARTIAL** — refresh/401/403 verified; offline paths not device-tested |
| No duplicate financial operations | **NOT VERIFIED** this phase (backend has idempotency tests) |
| No unauthorized action succeeds | **MET** — IDOR + role separation tested |
| Critical business journeys pass | **PARTIAL** — auth journeys pass; order/payment not device-tested |
| All discovered regressions resolved | **MET** — 116/116, no regressions |
| Existing UI and navigation preserved | **MET** — zero screen/navigation/styling changes |

---

## 4. Evidence

```
backend      npm test            116 tests · 116 pass · 0 fail
                                 (74 pre-existing + 42 new)

user-app     tsc --noEmit        clean
             release bundle      3.4 MB  (was 9.5 MB with mocks)
scrapper-app tsc --noEmit        clean
             release bundle      3.4 MB  (was 9.6 MB with mocks)
```

The 9.5 MB → 3.4 MB drop, and the absence of the `scraptox.mock` AsyncStorage key in both release
bundles, is the proof that mocks are gone from a production build.

---

## 5. Deployment blockers

| # | Blocker | Owner | Needed |
|---|---|---|---|
| B1 | **No on-device verification of any journey** | Dev environment | JDK 17 + Android SDK + emulator (or a Mac for iOS) |
| B2 | `GET /referrals/me` and `/referrals/leaderboard` missing | Backend | Build the two user-facing referral endpoints |
| B3 | Razorpay flows unverified | DevOps | Live/test gateway keys + a device webview run |
| B4 | KYC document upload unverified | Dev environment | Device camera / file picker |
| B5 | Push delivery unverified | DevOps | Physical device + FCM registration |
| B6 | Socket cross-app sync unverified | QA | Two live clients |
| B7 | `JWT_SECRET` is 6 characters in `backend/.env` | DevOps | **Rotate to a 32+ char secret before production** |
| B8 | Price list empty in the connected DB | Ops | Seed admin categories/rates, else order creation has no rates |

**B7 is a security issue found incidentally and not introduced by this work.** The `orderValidator`
also enforces a fixed `SCRAP_CATEGORIES` enum while the apps take category names from the admin
price list at runtime — if an admin adds a category outside that enum, order creation will 400.
Worth confirming against B8 when the DB is seeded.

---

## 6. Files changed

### Backend — created
```
models/Notification.js
controllers/addressController.js
controllers/notificationController.js
routes/addressRoutes.js
routes/notificationRoutes.js
tests/addresses.notifications.test.js         (22 tests)
tests/native.client.integration.test.js       (20 tests)
```

### Backend — modified
```
models/User.js                 + addresses[] (legacy `address` preserved)
controllers/authController.js  + logout()
routes/authRoutes.js           + POST /auth/logout
server.js                      + mount /addresses, /notifications
utils/pushNotificationHelper.js  persists every push as an in-app record
```

### Apps — created
```
user-app/src/config/env.ts
scrapper-app/src/config/env.ts
```

### Apps — modified
```
{user,scrapper}-app/src/api/client.ts        USE_MOCK from config; refresh-token
                                             storage; single-flight refresh on 401;
                                             403 account-state sign-out; read `error`
{user,scrapper}-app/src/store/AppStore.tsx   purpose fix (D2); isNewUser from 404;
                                             persist refreshToken; address list reuse
```

**No screen, component, navigation or styling file was touched.** The UI is unchanged.

---

## 7. Recommended next steps

1. **Install the Android toolchain** (B1) — it gates every remaining acceptance criterion.
2. **Seed the price list** (B8) and run one real order creation end to end.
3. **Rotate `JWT_SECRET`** (B7) before any deployment.
4. **Build the two referral endpoints** (B2), or hide those screens until they exist.
5. Then proceed to Phases 4–6 (full per-app integration and cross-app flow) with a device
   attached, so results can be certified at device level rather than contract level.

---

## 8. Reports in this set

| Report | Content |
|---|---|
| `SCRAPTO_NATIVE_API_INTEGRATION_MATRIX.md` | Full screen→endpoint→model matrix with per-feature status; all 9 defects |
| `SCRAPTO_E2E_TEST_REPORT.md` | All 42 new test results; what was and was not verified, and why |
| `SCRAPTO_FINAL_INTEGRATION_CERTIFICATION.md` | This document |

The three per-app/cross-app reports named in the brief
(`USER_APP_INTEGRATION_REPORT`, `SCRAPPER_APP_INTEGRATION_REPORT`,
`CROSS_APP_BUSINESS_FLOW_REPORT`) are **deliberately not written yet**: Phases 4–6 have not been
executed, and writing them now would document work that has not been done.
