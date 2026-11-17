/**
 * Scraptox API client (same shape as Driver Finder's).
 *
 * USE_MOCK = true: every call is answered on the phone by ./mock.ts, which
 * returns the same `{ success, message, data }` shapes as the Express backend
 * (backend/controllers/*). Switching to the real server later means setting
 * USE_MOCK to false; screens and services do not change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockApi } from './mock';
import { USE_MOCK, DEFAULT_API_URL } from '../config/env';

export { USE_MOCK, DEFAULT_API_URL } from '../config/env';

const URL_KEY = 'scraptox.apiUrl.v1';
const TOKEN_KEY = 'scraptox.userToken';
const REFRESH_KEY = 'scraptox.userRefreshToken';

let baseUrl = DEFAULT_API_URL;
let token: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: () => void = () => {};

export async function loadConnection() {
  const [u, t, r] = await Promise.all([
    AsyncStorage.getItem(URL_KEY),
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_KEY),
  ]);
  if (u) baseUrl = u;
  token = t;
  refreshToken = r;
  return { url: baseUrl, token };
}

export const getApiUrl = () => baseUrl;

export async function setApiUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '') || DEFAULT_API_URL;
  await AsyncStorage.setItem(URL_KEY, baseUrl);
}

export async function setToken(t: string | null, r?: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);

  // Passing an explicit refresh token stores it; signing out (t === null)
  // clears it so no stale credential survives logout.
  if (r !== undefined || t === null) {
    refreshToken = t === null ? null : r ?? refreshToken;
    if (refreshToken) await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
    else await AsyncStorage.removeItem(REFRESH_KEY);
  }
}

export const getRefreshToken = () => refreshToken;

export const hasToken = () => !!token;
export const getToken = () => token;

export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | undefined | null>; timeout?: number };

async function rawApi<T = any>(path: string, opts: Opts = {}): Promise<T> {
  if (USE_MOCK) {
    try {
      return (await mockApi(path, opts)) as T;
    } catch (e: any) {
      throw new ApiError(e?.message || 'Something went wrong.', e?.status || 400, e?.code);
    }
  }
  const { method = 'GET', body, query, timeout = 60000 } = opts;
  let url = `${baseUrl}/api${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined, signal: ctrl.signal });
  } catch {
    throw new ApiError('No internet or the server is not reachable. Please try again.', 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // empty body
  }
  if (!res.ok || data.success === false) {
    const code = data.code as string | undefined;
    const fallback = res.status >= 502 && res.status <= 504
      ? 'The server is busy or updating. Please try again in a minute.'
      : res.status === 413
        ? 'That file is too large. Please choose a smaller photo.'
        : `Something went wrong (${res.status}).`;
    // Controllers send `message`; middleware (middleware/auth.js) sends
    // `error`. Accept both so the user sees the real reason.
    throw new ApiError(data.message || data.error || fallback, res.status, code || (res.status >= 502 && res.status <= 504 ? 'SERVER_BUSY' : undefined));
  }
  return data as T;
}

/* ------------------------------------------------------------------ refresh */

/**
 * In-flight refresh, shared by every caller.
 *
 * Without this, N concurrent 401s would fire N refresh calls; because the
 * backend ROTATES the refresh token on each use (controllers/authController.js
 * -> refreshToken), the later calls would present an already-consumed token,
 * be rejected, and sign a perfectly good session out. Sharing one promise
 * means exactly one rotation per expiry.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const current = getRefreshToken();
  if (!current) return false;

  try {
    const res = await fetch(`${baseUrl}/api/auth/refresh-token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false || !data?.data?.token) return false;

    await setToken(data.data.token, data.data.refreshToken ?? null);
    return true;
  } catch {
    // Offline: keep the session and let the caller surface a network error.
    return false;
  }
}

/** Coalesces concurrent refresh attempts into one network call. */
function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = refreshSession().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Public API wrapper: on a 401 it refreshes the session once and replays the
 * request. A second 401 (or no refresh token) signs the user out.
 */
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  try {
    return await rawApi<T>(path, opts);
  } catch (e) {
    const err = e as ApiError;

    // 403 + an account-state code means the session is finished: no refresh can
    // rescue it. Ordinary authorization 403s must NOT sign the user out.
    if (err?.status === 403 && (err.code === 'ACCOUNT_DEACTIVATED' || err.code === 'SCRAPPER_BLOCKED')) {
      if (!USE_MOCK) onUnauthorized();
      throw err;
    }

    if (err?.status !== 401 || USE_MOCK) throw err;

    // Never try to refresh the refresh call itself.
    if (path.startsWith('/auth/refresh-token')) {
      onUnauthorized();
      throw err;
    }

    const ok = await refreshOnce();
    if (!ok) {
      onUnauthorized();
      throw err;
    }

    try {
      return await rawApi<T>(path, opts);
    } catch (again) {
      if ((again as ApiError)?.status === 401) onUnauthorized();
      throw again;
    }
  }
}

/**
 * Uploads local photos (camera/gallery URIs) as multipart field "images",
 * matching POST /api/uploads/order-images. Retries once on a network error.
 */
export async function uploadImages<T = any>(path: string, files: { uri: string; type?: string; name?: string }[]): Promise<T> {
  if (USE_MOCK) return api<T>(path, { method: 'POST', body: { files } });
  const send = () => {
    const fd = new FormData();
    files.forEach((f, i) => fd.append('images', { uri: f.uri, type: f.type || 'image/jpeg', name: f.name || `photo-${i}.jpg` } as any));
    return api<T>(path, { method: 'POST', body: fd, timeout: 90000 });
  };
  try {
    return await send();
  } catch (e) {
    if ((e as ApiError).code !== 'NETWORK') throw e;
    await new Promise<void>((r) => setTimeout(r, 800));
    return send();
  }
}
