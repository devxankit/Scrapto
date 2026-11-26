/**
 * One context for the app: session, language, price list, saved addresses and
 * the sell draft. Lists that belong to one screen (orders, wallet, chats) are
 * loaded there with useQuery.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import i18n from '../i18n';
import { api, getRefreshToken, loadConnection, setToken, setUnauthorizedHandler } from '../api/client';
import { resetMock } from '../api/mock';
import { connectSocket, disconnectSocket } from '../api/socket';
import { pausePush, startPush, stopPush } from '../api/push';
import { clearQueryCache } from '../hooks/useQuery';
import type { Price } from '../components/brand';
import type { Photo } from '../utils/media';
import type { LatLng } from '../utils/location';

export type User = { _id: string; name: string; email?: string; phone: string; referralCode?: string; createdAt?: string };

export type Address = {
  _id: string;
  type: 'home' | 'office' | 'other';
  label: string;
  street: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode?: string;
  coordinates: LatLng;
  isDefault?: boolean;
};

export type Slot = { mode: 'now' } | { mode: 'later'; date: string; dayLabel: string; time: string };

export type SellDraft = {
  /** category -> estimated weight (kg) or count (pc) */
  items: Record<string, number>;
  photos: Photo[];
  address: Address | null;
  slot: Slot;
  notes: string;
};

const emptyDraft = (): SellDraft => ({ items: {}, photos: [], address: null, slot: { mode: 'now' }, notes: '' });

type Store = {
  ready: boolean;
  user: User | null;
  lang: string | null;
  setLang: (l: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ isNewUser: boolean }>;
  registerUser: (phone: string, profile: { name: string; email?: string; referralCode?: string; heardFrom?: string }) => Promise<void>;
  verifyOtp: (phone: string, otp: string, profile?: { name: string; email?: string; referralCode?: string; heardFrom?: string }) => Promise<void>;
  updateProfile: (p: { name: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  prices: Price[];
  loadPrices: () => Promise<void>;
  addresses: Address[];
  loadAddresses: () => Promise<void>;
  saveAddress: (a: Omit<Address, '_id'> & { _id?: string }) => Promise<Address>;
  deleteAddress: (id: string) => Promise<void>;
  draft: SellDraft;
  setDraft: (fn: (d: SellDraft) => SellDraft) => void;
  resetDraft: (preselect?: string) => void;
};

const Ctx = createContext<Store | null>(null);

const LANG_KEY = 'scraptox.lang';
const USER_KEY = 'scraptox.user';
const PRICES_KEY = 'scraptox.prices';

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<string | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [draft, setDraftState] = useState<SellDraft>(emptyDraft);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const loadPrices = useCallback(async () => {
    try {
      const r = await api('/public/prices');
      // Per-piece items (AC, fridge, …) carry their rate in `price`, with pricePerKg 0.
      const list: Price[] = (r.data?.prices ?? []).map((p: any) => ({ ...p, pricePerKg: Number(p.pricePerKg) > 0 ? p.pricePerKg : Number(p.price) || 0 }));
      setPrices(list);
      AsyncStorage.setItem(PRICES_KEY, JSON.stringify(list)).catch(() => {});
    } catch {
      // keep the cached list
    }
  }, []);

  const loadAddresses = useCallback(async () => {
    try {
      const r = await api('/addresses');
      setAddresses(r.data?.addresses ?? []);
    } catch {
      // keep what we have
    }
  }, []);

  const signedOut = useCallback(async () => {
    pausePush();
    await setToken(null);
    disconnectSocket();
    clearQueryCache();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    setAddresses([]);
    setDraftState(emptyDraft());
  }, []);

  // Start-up: language, cached user, then confirm the session with /auth/me.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      signedOut();
    });
    (async () => {
      const [l, u, p] = await Promise.all([AsyncStorage.getItem(LANG_KEY), AsyncStorage.getItem(USER_KEY), AsyncStorage.getItem(PRICES_KEY)]);
      if (l) {
        setLangState(l);
        await i18n.changeLanguage(l);
      }
      if (p) setPrices(JSON.parse(p));
      const { token } = await loadConnection();
      if (token && u) {
        setUser(JSON.parse(u));
        connectSocket(token);
      }
      setReady(true);
      loadPrices();
      if (token) {
        // Saved addresses are needed to book anything; load them even if the
        // profile refresh below fails (slow network, rate limit, server hiccup).
        loadAddresses();
        try {
          const me = await api('/auth/me');
          setUser(me.data.user);
          AsyncStorage.setItem(USER_KEY, JSON.stringify(me.data.user)).catch(() => {});
          startPush();
        } catch (e: any) {
          if (e?.status === 401) signedOut();
        }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback(async (l: string) => {
    setLangState(l);
    await AsyncStorage.setItem(LANG_KEY, l);
    await i18n.changeLanguage(l);
    // Urdu reads right to left; React Native applies it after a restart.
    I18nManager.allowRTL(l === 'ur');
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    // The backend has no "isNewUser" flag: POST /auth/login-otp answers 404
    // for a phone number it does not know. Treat that as "needs sign-up" and
    // send the OTP through /auth/register instead (done by verifyOtp).
    try {
      await api('/auth/login-otp', { method: 'POST', body: { phone, role: 'user' } });
      return { isNewUser: false };
    } catch (e: any) {
      if (e?.status === 404) return { isNewUser: true };
      throw e;
    }
  }, []);

  // A new number gets its first code from POST /auth/register (login-otp
  // answers 404 and sends nothing), so sign-up registers BEFORE the code step.
  const registerUser = useCallback(async (phone: string, profile: { name: string; email?: string; referralCode?: string; heardFrom?: string }) => {
    await api('/auth/register', { method: 'POST', body: { ...profile, phone, role: 'user' } });
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string, profile?: { name: string; email?: string; referralCode?: string; heardFrom?: string }) => {
    // New accounts were created (and texted their code) by registerUser().
    // NOTE: the backend verifyOTPValidator accepts only "login" or
    // "verification" for the purpose field - sending "register" fails with
    // HTTP 400. A new account verifies its phone, so use "verification".
    const r = await api('/auth/verify-otp', { method: 'POST', body: { phone, otp, purpose: profile ? 'verification' : 'login', role: 'user', profile } });
    const { token, refreshToken, user: u } = r.data;
    await setToken(token, refreshToken ?? null);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    connectSocket(token);
    setUser(u);
    loadAddresses();
    startPush({ isNewLogin: true });
  }, [loadAddresses]);

  const updateProfile = useCallback(async (p: { name: string; email?: string }) => {
    const r = await api('/auth/profile', { method: 'PUT', body: p });
    setUser(r.data.user);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(r.data.user)).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await stopPush();
    try {
      await api('/auth/logout', { method: 'POST', body: { refreshToken: getRefreshToken() } });
    } catch {
      // signing out locally is enough
    }
    await signedOut();
  }, [signedOut]);

  const resetDemo = useCallback(async () => {
    await resetMock();
    await signedOut();
  }, [signedOut]);

  const saveAddress = useCallback(async (a: Omit<Address, '_id'> & { _id?: string }) => {
    const r = a._id ? await api(`/addresses/${a._id}`, { method: 'PUT', body: a }) : await api('/addresses', { method: 'POST', body: a });
    // The write returns the full list, so no follow-up GET is needed.
    if (r.data?.addresses) setAddresses(r.data.addresses);
    else await loadAddresses();
    return r.data.address as Address;
  }, [loadAddresses]);

  const deleteAddress = useCallback(async (id: string) => {
    const r = await api(`/addresses/${id}`, { method: 'DELETE' });
    if (r.data?.addresses) setAddresses(r.data.addresses);
    else await loadAddresses();
  }, [loadAddresses]);

  const setDraft = useCallback((fn: (d: SellDraft) => SellDraft) => setDraftState(fn), []);

  const resetDraft = useCallback((preselect?: string) => {
    const d = emptyDraft();
    if (preselect) d.items[preselect] = 0;
    setDraftState(d);
  }, []);

  const value = useMemo<Store>(
    () => ({ ready, user, lang, setLang, requestOtp, registerUser, verifyOtp, updateProfile, logout, resetDemo, prices, loadPrices, addresses, loadAddresses, saveAddress, deleteAddress, draft, setDraft, resetDraft }),
    [ready, user, lang, setLang, requestOtp, registerUser, verifyOtp, updateProfile, logout, resetDemo, prices, loadPrices, addresses, loadAddresses, saveAddress, deleteAddress, draft, setDraft, resetDraft],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppStoreProvider');
  return s;
}
