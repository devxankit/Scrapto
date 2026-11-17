/**
 * One Socket.IO connection for the whole app (see backend/services/socketService.js
 * for the events: new_message, typing, scrapper_location_update, ...). In the
 * mock build (USE_MOCK) nothing connects; screens poll instead. It signs in with the same token as the REST API and
 * reconnects by itself. Screens subscribe with `onSocket`; subscriptions live
 * in this module, so they keep working across reconnects and sign-ins.
 */
import { io, Socket } from 'socket.io-client';
import { api, getApiUrl, getToken, USE_MOCK } from './client';

let socket: Socket | null = null;
let currentKey = '';
const listeners = new Map<string, Set<(data: any) => void>>();
const statusListeners = new Set<(connected: boolean) => void>();

const dispatch = (event: string, data: unknown) => listeners.get(event)?.forEach((h) => h(data));

export function connectSocket(token: string) {
  if (USE_MOCK) return;
  const key = `${getApiUrl()}|${token}`;
  if (socket && currentKey === key) return;
  disconnectSocket();
  currentKey = key;
  socket = io(getApiUrl(), {
    path: '/socket.io',
    // Read the token on every (re)connect. A fixed object would replay the
    // access token from sign-in forever, and after a refresh rotates it the
    // next reconnect would be refused.
    auth: (cb) => cb({ token: getToken() ?? token }),
    // Websocket only: React Native's long-polling fallback is slow and flaky.
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10000,
  });
  socket.onAny(dispatch);
  // A handshake refused by the server's auth middleware is NOT retried by
  // socket.io-client. Renew the session once through the REST client (which
  // refreshes on 401 and signs out on revocation/blocking), then reconnect.
  let recovering = false;
  socket.on('connect_error', (err: Error) => {
    if (recovering || !/Authentication error/i.test(err?.message || '')) return;
    if (/revoked|blocked|unavailable/i.test(err.message)) return; // REST layer signs out
    recovering = true;
    const s = socket;
    api('/auth/me')
      .then(() => {
        if (s && s === socket && !s.connected) s.connect();
      })
      .catch(() => {})
      .finally(() => {
        recovering = false;
      });
  });
  socket.on('connect', () => statusListeners.forEach((l) => l(true)));
  socket.on('disconnect', () => statusListeners.forEach((l) => l(false)));
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  currentKey = '';
  statusListeners.forEach((l) => l(false));
}

export const socketConnected = () => !!socket?.connected;

/** Subscribe to a server event; returns the unsubscribe function. */
export function onSocket<T = any>(event: string, handler: (data: T) => void) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}

export function onSocketStatus(l: (connected: boolean) => void) {
  statusListeners.add(l);
  return () => {
    statusListeners.delete(l);
  };
}

export function emitSocket(event: string, data?: unknown, ack?: (res: any) => void) {
  if (!socket?.connected) return;
  if (ack) socket.emit(event, data, ack);
  else socket.emit(event, data);
}
