/**
 * Push notifications (Firebase Cloud Messaging), same Firebase project as the
 * backend (scrapto-eedb1) and the original Scrapto Play Store app.
 *
 * - App closed / in background: Android shows the backend's notification itself,
 *   using the default channel and icon set in AndroidManifest.xml.
 * - App open: Firebase does not show anything, so we display it with notifee.
 * - The device token is registered with POST /fcm-tokens/save (platform "app")
 *   after login and removed again on logout.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { api, USE_MOCK } from './client';

export const CHANNEL_ID = 'scraptox_default';

let listeners: (() => void)[] = [];
let currentToken: string | null = null;

const messaging = () => getMessaging(getApp());

function stopListeners() {
  listeners.forEach((off) => off());
  listeners = [];
}

async function ensureChannel() {
  await notifee.createChannel({ id: CHANNEL_ID, name: 'Scraptox updates', importance: AndroidImportance.HIGH, sound: 'default' });
}

/** Android 13+ needs runtime permission to show notifications. */
async function askPermission() {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
}

async function saveToken(token: string, isNewLogin: boolean) {
  // "fcmToken" kept for older backends; the current one reads "token".
  await api('/fcm-tokens/save', { method: 'POST', body: { token, fcmToken: token, platform: 'app', isNewLogin } });
}

/** Call after login (isNewLogin: true) and on app start with a saved session. */
export async function startPush({ isNewLogin = false }: { isNewLogin?: boolean } = {}) {
  if (USE_MOCK) return;
  try {
    await ensureChannel();
    await askPermission();
    const token = await getToken(messaging());
    if (token) {
      currentToken = token;
      await saveToken(token, isNewLogin);
    }
    stopListeners();
    listeners.push(
      onTokenRefresh(messaging(), (t) => {
        currentToken = t;
        saveToken(t, false).catch(() => {});
      }),
    );
    listeners.push(
      onMessage(messaging(), async (m) => {
        const n = m.notification;
        if (!n?.title && !n?.body) return;
        await notifee.displayNotification({
          title: n.title,
          body: n.body,
          data: (m.data ?? {}) as Record<string, string>,
          android: { channelId: CHANNEL_ID, smallIcon: 'ic_notification', color: '#009A33', pressAction: { id: 'default' } },
        });
      }),
    );
  } catch {
    // Push is best-effort: never block login or start-up on it.
  }
}

/** Call on logout, while the session is still valid, so the backend forgets this device. */
export async function stopPush() {
  stopListeners();
  if (USE_MOCK) return;
  const token = currentToken;
  currentToken = null;
  try {
    if (token) await api('/fcm-tokens/remove', { method: 'POST', body: { token, platform: 'app' } });
  } catch {
    // ignore
  }
  try {
    await deleteToken(messaging());
  } catch {
    // ignore
  }
}

/** Session ended without a logout call (e.g. expired): just stop listening. */
export function pausePush() {
  stopListeners();
  currentToken = null;
}

/** Must run at app start (index.js), before React mounts. */
export function registerBackgroundPushHandler() {
  try {
    setBackgroundMessageHandler(messaging(), async () => {
      // Notification messages are shown by Android itself; nothing to do here.
    });
  } catch {
    // ignore
  }
}
