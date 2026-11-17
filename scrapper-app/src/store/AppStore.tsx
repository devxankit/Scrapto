/**
 * One context for the Partner app: session (the scrapper profile, with KYC and
 * subscription), language, online status and the price list. Lists that belong
 * to one screen (requests, jobs, lots, wallet) are loaded there with useQuery.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import i18n from '../i18n';
import { api, getRefreshToken, loadConnection, setToken, setUnauthorizedHandler } from '../api/client';
import { resetMock } from '../api/mock';
import { connectSocket, disconnectSocket } from '../api/socket';
import { clearQueryCache } from '../hooks/useQuery';
import type { Price } from '../components/brand';
import { askLocationPermission, currentPosition, DEMO_POINT, LatLng } from '../utils/location';

export type KycStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected';

export type Plan = {
  _id: string;
  name: string;
  description?: string;
  price: number;
  duration: number;
  durationType: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  features: string[];
  maxPickups: number | null;
  maxMarketplaceRequests: number | null;
  isPopular?: boolean;
  type: 'general' | 'market_price';
  image?: string;
};

export type Subscription = {
  status: 'active' | 'expired' | 'cancelled' | 'none';
  planId?: string;
  plan?: Plan | null;
  startDate?: string;
  expiryDate?: string;
  usedPickups?: number;
};

export type Partner = {
  _id: string;
  name: string;
  email?: string;
  phone: string;
  city?: string;
  services: ('scrap_pickup' | 'home_cleaning')[];
  vehicleInfo: { type: 'bike' | 'auto' | 'truck'; number: string; capacity: number };
  referralCode?: string;
  isOnline: boolean;
  rating?: number;
  kyc: { status: KycStatus; aadhaarLast4?: string; submittedAt?: string; verifiedAt?: string; rejectionReason?: string; licenseUrl?: string | null };
  subscription: Subscription;
  marketSubscription?: Subscription;
  liveLocation?: LatLng;
  createdAt?: string;
};

export type SignupProfile = {
  name: string;
  email?: string;
  vehicleInfo: Partner['vehicleInfo'];
  services: Partner['services'];
  city: string;
  heardFrom?: string;
  referralCode?: string;
};

type Store = {
  ready: boolean;
  user: Partner | null;
  lang: string | null;
  setLang: (l: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<{ isNewUser: boolean }>;
  registerUser: (phone: string, profile: SignupProfile) => Promise<void>;
  verifyOtp: (phone: string, otp: string, profile?: SignupProfile) => Promise<void>;
  refreshMe: () => Promise<Partner | null>;
  updateProfile: (p: Partial<Pick<Partner, 'name' | 'email' | 'city' | 'services' | 'vehicleInfo'>>) => Promise<void>;
  setOnline: (on: boolean) => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  prices: Price[];
  /** Where the partner is (GPS, or the demo point when GPS is off). */
  here: LatLng;
  locate: () => Promise<LatLng>;
};

const Ctx = createContext<Store | null>(null);

const LANG_KEY = 'scraptox.partner.lang';
const USER_KEY = 'scraptox.partner.user';
const PRICES_KEY = 'scraptox.partner.prices';

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Partner | null>(null);
  const [lang, setLangState] = useState<string | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [here, setHere] = useState<LatLng>(DEMO_POINT);

  const keep = useCallback((u: Partner) => {
    setUser(u);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(u)).catch(() => {});
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const r = await api('/public/prices');
      const list: Price[] = r.data?.prices ?? [];
      setPrices(list);
      AsyncStorage.setItem(PRICES_KEY, JSON.stringify(list)).catch(() => {});
    } catch {
      // keep the cached list
    }
  }, []);

  const signedOut = useCallback(async () => {
    await setToken(null);
    disconnectSocket();
    clearQueryCache();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const r = await api('/scrappers/me');
      keep(r.data.scrapper);
      return r.data.scrapper as Partner;
    } catch (e: any) {
      if (e?.status === 401) signedOut();
      return null;
    }
  }, [keep, signedOut]);

  // Start-up: language, cached profile, then confirm the session.
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
      if (token) refreshMe();
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
    // for a phone number it does not know. Treat that as "needs sign-up".
    try {
      await api('/auth/login-otp', { method: 'POST', body: { phone, role: 'scrapper' } });
      return { isNewUser: false };
    } catch (e: any) {
      if (e?.status === 404) return { isNewUser: true };
      throw e;
    }
  }, []);

  // A new number gets its first code from POST /auth/register (login-otp
  // answers 404 and sends nothing), so sign-up registers BEFORE the code step.
  const registerUser = useCallback(async (phone: string, profile: SignupProfile) => {
    await api('/auth/register', { method: 'POST', body: { ...profile, phone, role: 'scrapper' } });
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string, profile?: SignupProfile) => {
    // New accounts were created (and texted their code) by registerUser().
    // NOTE: the backend verifyOTPValidator accepts only "login" or
    // "verification" for the purpose field - sending "register" fails with
    // HTTP 400. A new account verifies its phone, so use "verification".
    const r = await api('/auth/verify-otp', { method: 'POST', body: { phone, otp, purpose: profile ? 'verification' : 'login', role: 'scrapper', profile } });
    await setToken(r.data.token, r.data.refreshToken ?? null);
    connectSocket(r.data.token);
    keep(r.data.user);
  }, [keep]);

  const updateProfile = useCallback(async (p: Partial<Pick<Partner, 'name' | 'email' | 'city' | 'services' | 'vehicleInfo'>>) => {
    const r = await api('/scrappers/me', { method: 'PUT', body: p });
    keep(r.data.scrapper);
  }, [keep]);

  const locate = useCallback(async () => {
    try {
      if (!(await askLocationPermission())) return here;
      const pos = await currentPosition();
      setHere(pos);
      return pos;
    } catch {
      return here;
    }
  }, [here]);

  const setOnline = useCallback(async (on: boolean) => {
    // Going online shares the partner's position, as the web dashboard does.
    const pos = on ? await locate() : undefined;
    const r = await api('/scrappers/me', { method: 'PUT', body: on ? { isOnline: true, liveLocation: pos } : { isOnline: false } });
    keep(r.data.scrapper);
  }, [keep, locate]);

  const logout = useCallback(async () => {
    try {
      if (user?.isOnline) await api('/scrappers/me', { method: 'PUT', body: { isOnline: false } });
      await api('/auth/logout', { method: 'POST', body: { refreshToken: getRefreshToken() } });
    } catch {
      // signing out locally is enough
    }
    await signedOut();
  }, [signedOut, user?.isOnline]);

  const resetDemo = useCallback(async () => {
    await resetMock();
    await signedOut();
  }, [signedOut]);

  const value = useMemo<Store>(
    () => ({ ready, user, lang, setLang, requestOtp, registerUser, verifyOtp, refreshMe, updateProfile, setOnline, logout, resetDemo, prices, here, locate }),
    [ready, user, lang, setLang, requestOtp, registerUser, verifyOtp, refreshMe, updateProfile, setOnline, logout, resetDemo, prices, here, locate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside AppStoreProvider');
  return s;
}
