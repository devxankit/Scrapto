/**
 * Build-time configuration for the Scraptox partner (scrapper) app.
 *
 * `USE_MOCK` decides whether API calls are answered by the real Express
 * backend (`src/api/client.ts` -> fetch) or on-device by `src/api/mock.ts`.
 *
 * Production/default: FALSE â€” the app talks to the real backend.
 *
 * The mock build is kept only as an offline demo/dev aid. To use it, flip the
 * constant below (or set USE_MOCK_API=true for a local Metro run) and reload.
 * Never ship a release with mocks enabled.
 */

// Metro inlines process.env.* at build time. Declared locally so the app does
// not need @types/node just to read one flag.
declare const process: { env?: Record<string, string | undefined> } | undefined;

/** Set by `USE_MOCK_API=true npx react-native start`, when provided. */
const envFlag =
  typeof process !== 'undefined' && process?.env ? process.env.USE_MOCK_API : undefined;

/** Real backend by default; `true` only for the offline demo build. */
export const USE_MOCK: boolean = envFlag === 'true' || envFlag === '1';

/** Production API host (Render). Used by every release build. */
export const PROD_API_URL = 'https://scrapto-1.onrender.com';

/**
 * Development API host: the backend running on the developer PC, reached by a
 * phone on the same Wi-Fi. Used only by debug builds (__DEV__ === true), so a
 * release APK can never point at a LAN address. Change this when the dev PC's
 * IP changes. Backend routes are mounted at both /api and /api/v1; the client
 * appends /api.
 */
export const DEV_API_URL = 'http://192.168.1.33:7000';

/** Debug builds talk to the dev PC; release builds talk to production. */
export const DEFAULT_API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

/**
 * Android emulators cannot reach the host machine over `localhost`.
 * Use 10.0.2.2 (AVD) or your LAN IP when pointing the app at a local server.
 */
export const LOCAL_API_URL_HINT = 'http://10.0.2.2:5000';
