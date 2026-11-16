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

export const USE_MOCK = true;

/** Live API (Render). For local testing set it from the hidden server dialog. */
export const DEFAULT_API_URL = 'https://scrapto-1.onrender.com';

const URL_KEY = 'scraptox.apiUrl.v1';
const TOKEN_KEY = 'scraptox.userToken';

let baseUrl = DEFAULT_API_URL;
let token: string | null = null;
let onUnauthorized: () => void = () => {};

export async function loadConnection() {
  const [u, t] = await Promise.all([AsyncStorage.getItem(URL_KEY), AsyncStorage.getItem(TOKEN_KEY)]);
  if (u) baseUrl = u;
  token = t;
  return { url: baseUrl, token };
}

export const getApiUrl = () => baseUrl;

export async function setApiUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '') || DEFAULT_API_URL;
  await AsyncStorage.setItem(URL_KEY, baseUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

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

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
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
    if (res.status === 401) onUnauthorized();
    const fallback = res.status >= 502 && res.status <= 504
      ? 'The server is busy or updating. Please try again in a minute.'
      : res.status === 413
        ? 'That file is too large. Please choose a smaller photo.'
        : `Something went wrong (${res.status}).`;
    throw new ApiError(data.message || fallback, res.status, code || (res.status >= 502 && res.status <= 504 ? 'SERVER_BUSY' : undefined));
  }
  return data as T;
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
