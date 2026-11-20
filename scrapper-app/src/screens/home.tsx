import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Image, RefreshControl, ScrollView, StatusBar, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Bell, BellRing, ChevronRight, Gavel, MapPin, Navigation, Package, Radar, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BackButton, Button, Card, EmptyState, IconButton, Loading, Screen, Tag } from '../components/ui';
import { IconBadge, unitOf } from '../components/brand';
import { colors, radius, shadow } from '../theme';
import { api } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { useStore } from '../store/AppStore';
import { categoryMeta, images } from '../data/catalog';
import { ago, agoLabel, dateLabel, firstName, greeting, inr, qty, catName } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400000)) : 0);

/** "Newspaper 12 kg · Copper 2 kg · Split AC × 1" */
export function itemsLine(items: any[] = []) {
  return items.map((i) => `${catName(i.category)} ${categoryMeta(i.category).unit === 'pc' ? `× ${i.weight}` : qty(i.weight)}`).join(' · ');
}

/** Short summary for the request card: "≈ ₹5,808 · 14 kg + 1 AC" */
function requestSummary(o: any) {
  const kg = o.scrapItems.filter((i: any) => categoryMeta(i.category).unit === 'kg').reduce((n: number, i: any) => n + i.weight, 0);
  const pcs = o.scrapItems.filter((i: any) => categoryMeta(i.category).unit === 'pc');
  const parts = [kg ? qty(kg) : '', ...pcs.map((i: any) => `${i.weight} ${catName(i.category)}`)].filter(Boolean);
  return `≈ ${inr(o.totalAmount)} · ${parts.join(' + ')}`;
}

/* -------------------------------------------------------------- Dashboard */

export function DashboardScreen() {
  const nav = useNavigation();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { user, setOnline } = useStore();
  const online = !!user?.isOnline;
  const stats = useQuery<{ stats: any }>('/scrappers/stats');
  const jobs = useQuery<{ orders: any[] }>('/orders/my-assigned', { status: 'confirmed,in_progress' });
  const avail = useQuery<{ orders: any[] }>(online ? '/orders/available' : null, undefined, { poll: online ? 5000 : undefined });
  const notes = useQuery<{ notifications: any[] }>('/notifications');
  const [switching, setSwitching] = useState(false);
  const s = stats.data?.stats;
  const requests = online ? avail.data?.orders ?? [] : [];
  const active = jobs.data?.orders ?? [];
  const unread = (notes.data?.notifications ?? []).filter((n) => !n.read).length;
  const sub = user?.subscription;
  const left = daysLeft(sub?.expiryDate);

  // A short buzz when a new request arrives (the web app played a sound).
  const seen = useRef(0);
  useEffect(() => {
    if (requests.length > seen.current) Vibration.vibrate(350);
    seen.current = requests.length;
  }, [requests.length]);

  const toggle = async () => {
    setSwitching(true);
    try {
      await setOnline(!online);
      stats.reload();
    } catch (e: any) {
      Alert.alert(online ? 'Could not go offline' : 'Could not go online', e.message, e.code === 'SUBSCRIPTION_REQUIRED' ? [{ text: 'Cancel', style: 'cancel' }, { text: 'See plans', onPress: () => nav.navigate('Plans') }] : undefined);
    } finally {
      setSwitching(false);
    }
  };

  const reload = () => {
    stats.reload();
    jobs.reload();
    avail.reload();
    notes.reload();
  };

  const next = active.find((o) => o.status === 'in_progress') ?? active[0];
  const maxDay = Math.max(1, ...(s?.days ?? []).map((d: any) => d.amount));
  const weekOut = Math.abs(s?.week ?? 0);
  const prevOut = Math.abs(s?.previousWeek ?? 0);
  const change = prevOut ? Math.round(((weekOut - prevOut) / prevOut) * 100) : 0;

  return (
    <Screen>
      {focused ? <StatusBar barStyle="light-content" /> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={reload} colors={[colors.primary]} />} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: colors.deep, paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={images.avatarPartner} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.green400 }} />
            <View style={{ flex: 1 }}>
              <T size={11} w="semibold" color={colors.green200}>{greeting()}</T>
              <T size={16} w="extrabold" color={colors.white} numberOfLines={1}>{`Hi, ${firstName(user?.name)}`}</T>
            </View>
            <IconButton label="Notifications" tone="deep" badge={unread > 0} onPress={() => nav.navigate('Notifications')}>
              <Bell size={20} color={colors.white} />
            </IconButton>
          </View>
          <Pressable
            onPress={toggle}
            disabled={switching}
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel={online ? 'You are online' : 'You are offline'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.lg, backgroundColor: online ? colors.white : colors.deep2 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: online ? colors.green50 : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Radar size={18} color={online ? colors.brand : colors.green200} />
            </View>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold" color={online ? colors.deep : colors.white}>{switching ? (online ? 'Going offline…' : 'Going online…') : online ? 'You are online' : 'You are offline'}</T>
              <T size={12} color={online ? colors.ink2 : colors.green200} numberOfLines={1}>{online ? `Receiving pickups near ${user?.city ?? 'you'}` : 'Go online to get new pickup requests'}</T>
            </View>
            <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: online ? colors.brand : '#3A6B50', alignItems: online ? 'flex-end' : 'flex-start' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white }} />
            </View>
          </Pressable>
        </View>

        <View style={{ padding: 12, gap: 10 }}>
          {requests.length ? (
            <Pressable onPress={() => nav.navigate('Requests')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.lg, backgroundColor: colors.primary }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <BellRing size={17} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <T size={14} w="extrabold" color={colors.white}>{requests.length === 1 ? '1 new pickup request' : `${requests.length} new pickup requests`}</T>
                <T size={12} color={colors.green100} numberOfLines={1} raw>{`${requests[0].user.name} · ${requests[0].distanceKm} km · ${requestSummary(requests[0])}`}</T>
              </View>
              <ChevronRight size={20} color={colors.white} />
            </Pressable>
          ) : online ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge><Radar size={18} color={colors.primary} /></IconBadge>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">Looking for pickups near you…</T>
                <T size={12} color={colors.muted}>New requests show up here and on the map.</T>
              </View>
              <T size={13} w="bold" color={colors.primary} onPress={() => nav.navigate('Requests')}>Map</T>
            </Card>
          ) : null}

          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={12} w="semibold" color={colors.muted}>Paid to customers this week</T>
                <T size={20} w="extrabold" color={colors.ink} raw>{s ? inr(weekOut) : '—'}</T>
                {s ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {change >= 0 ? <TrendingUp size={14} color={colors.primary} /> : <TrendingDown size={14} color={colors.red} />}
                    <T size={12} w="bold" color={change >= 0 ? colors.primary : colors.red} raw>{`${Math.abs(change)}% vs last week · ${s.weekPickups} pickups`}</T>
                  </View>
                ) : null}
              </View>
              <T size={13} w="bold" color={colors.primary} onPress={() => nav.navigate('Earnings')} style={{ padding: 4 }}>Earnings ›</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 }}>
              {(s?.days ?? []).map((d: any, i: number) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: '100%', height: Math.max(3, Math.round((d.amount / maxDay) * 38)), borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: i === 6 ? colors.green200 : colors.brand }} />
                  <T size={11} w="semibold" color={colors.muted} raw>{d.day}</T>
                </View>
              ))}
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Card onPress={() => nav.navigate('Main', { screen: 'Jobs' })} style={{ flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconBadge size={30}><Package size={16} color={colors.primary} /></IconBadge>
                <T size={20} w="extrabold" raw>{String(active.length)}</T>
              </View>
              <T size={12} w="bold">{active.length === 1 ? 'Active pickup' : 'Active pickups'}</T>
              <T size={11} color={colors.muted} numberOfLines={1}>{next ? (next.pickupSlot ? `Next: ${next.pickupSlot.dayLabel}, ${next.pickupSlot.time}` : `Next: ${firstName(next.user.name)}, now`) : 'Accept a request to start'}</T>
            </Card>
            <Card onPress={() => nav.navigate('Main', { screen: 'Market' })} style={{ flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconBadge size={30} tone="gold"><Gavel size={16} color={colors.goldText} /></IconBadge>
                <T size={20} w="extrabold" raw>{String(s?.myOpenBids ?? 0)}</T>
              </View>
              <T size={12} w="bold">Bids running</T>
              <T size={11} color={colors.muted} numberOfLines={1}>{`${s?.openLots ?? 0} open bulk lots`}</T>
            </Card>
          </View>

          {next ? (
            <Card onPress={() => nav.navigate('Job', { id: next._id })} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T size={12} w="bold" color={colors.muted} raw>{`UP NEXT · #${next.orderNo}`}</T>
                <Tag tone={next.status === 'in_progress' ? 'gold' : 'green'} label={next.status === 'in_progress' ? 'AT PICKUP' : 'ACCEPTED'} />
              </View>
              <T size={15} w="extrabold">{next.user.name}</T>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <MapPin size={14} color={colors.muted} />
                <T size={12} color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>{next.pickupAddress.street}</T>
              </View>
              <T size={13} color={colors.ink2} numberOfLines={1}>{itemsLine(next.scrapItems)}</T>
            </Card>
          ) : null}

          <Card tone={sub?.status === 'active' && left > 5 ? 'white' : 'gold'} onPress={() => nav.navigate('Plans')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge tone="gold"><ShieldCheck size={18} color={colors.goldText} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold">{sub?.status === 'active' ? `${sub.plan?.name ?? 'Plan'} plan · ${left} ${left === 1 ? 'day' : 'days'} left` : 'No active plan'}</T>
              <T size={12} color={colors.muted}>{user?.marketSubscription?.status === 'active' ? 'Market-price alerts are on' : 'Add market-price alerts for ₹99/mo'}</T>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ---------------------------------------------- Incoming requests (map) */

export function RequestsScreen({ navigation }: P<'Requests'>) {
  const insets = useSafeAreaInsets();
  const { user, here } = useStore();
  const q = useQuery<{ orders: any[] }>(user?.isOnline ? '/orders/available' : null, undefined, { poll: 5000 });
  const list = q.data?.orders ?? [];
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<'accept' | 'skip' | null>(null);
  const mapRef = useRef<MapView>(null);
  const o = list[Math.min(index, Math.max(0, list.length - 1))];

  useEffect(() => {
    if (!o) return;
    const c = o.pickupAddress.coordinates;
    mapRef.current?.fitToCoordinates([{ latitude: c.lat, longitude: c.lng }, { latitude: here.lat, longitude: here.lng }], { edgePadding: { top: insets.top + 90, bottom: 380, left: 60, right: 60 }, animated: true });
  }, [o?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    if (!o) return;
    setBusy('accept');
    try {
      await api(`/orders/${o._id}/accept`, { method: 'POST' });
      navigation.replace('Job', { id: o._id });
    } catch (e: any) {
      Alert.alert('Could not accept', e.message);
      q.reload();
      setBusy(null);
    }
  };
  const skip = async () => {
    if (!o) return;
    setBusy('skip');
    try {
      await api(`/orders/${o._id}/skip`, { method: 'POST' });
      q.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <MapView ref={mapRef} provider={PROVIDER_GOOGLE} userInterfaceStyle="light" style={{ flex: 1 }} initialRegion={{ latitude: here.lat, longitude: here.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }} toolbarEnabled={false} showsCompass={false}>
        <Marker coordinate={{ latitude: here.lat, longitude: here.lng }} title="You" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.blue }} />
          </View>
        </Marker>
        {list.map((r, i) => (
          <Marker key={r._id} coordinate={{ latitude: r.pickupAddress.coordinates.lat, longitude: r.pickupAddress.coordinates.lng }} onPress={() => setIndex(i)} anchor={{ x: 0.5, y: 1 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 8, height: 26, borderRadius: 13, backgroundColor: r._id === o?._id ? colors.deep : colors.white, borderWidth: 1.5, borderColor: colors.deep, justifyContent: 'center' }}>
                <T size={11} w="extrabold" color={r._id === o?._id ? colors.white : colors.deep} raw>{inr(r.totalAmount)}</T>
              </View>
              <View style={{ width: 2, height: 8, backgroundColor: colors.deep }} />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ ...shadow.raised, borderRadius: radius.md }}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <View style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, ...shadow.raised }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: user?.isOnline ? colors.brand : colors.faint }} />
          <T size={13} w="bold" numberOfLines={1}>{user?.isOnline ? (list.length ? `${list.length} pickup ${list.length === 1 ? 'request' : 'requests'} near you` : 'Online · looking for pickups') : 'You are offline'}</T>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 10, ...shadow.sheet }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginBottom: 12 }} />
        {!user?.isOnline ? (
          <EmptyState icon={<Radar size={30} color={colors.primary} />} title="You are offline" text="Go online from the dashboard to receive pickup requests." action={<Button label="Back to dashboard" variant="deep" onPress={() => navigation.goBack()} />} />
        ) : !o ? (
          q.loading ? <Loading /> : <EmptyState icon={<Radar size={30} color={colors.primary} />} title="No requests right now" text="Stay online. New pickups near you appear here." />
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.goldSoft, justifyContent: 'center' }}>
                <T size={11} w="extrabold" color={colors.goldText}>NEW PICKUP REQUEST</T>
              </View>
              <T size={12} color={colors.muted} raw style={{ flex: 1 }}>{agoLabel(o.createdAt)}</T>
              {list.length > 1 ? <T size={12} w="bold" color={colors.primary} onPress={() => setIndex((index + 1) % list.length)} raw>{`${index + 1} of ${list.length} ›`}</T> : null}
            </View>
            <T size={20} w="extrabold" color={colors.deep} raw>{requestSummary(o)}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {o.scrapItems.map((i: any) => (
                <View key={catName(i.category)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 10, height: 32, borderRadius: radius.pill, backgroundColor: colors.bg }}>
                  <Image source={categoryMeta(i.category).image} style={{ width: 24, height: 24, borderRadius: 12 }} />
                  <T size={12} w="bold" raw>{`${catName(i.category)} ${categoryMeta(i.category).unit === 'pc' ? `× ${i.weight}` : qty(i.weight)}`}</T>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 10 }}>
              {[[`${o.distanceKm} km`, 'Distance'], [`${o.etaMin ?? (typeof o.distanceKm === 'number' ? Math.max(5, Math.round(o.distanceKm * 3)) : '—')} min`, 'ETA'], [o.pickupSlot ? o.pickupSlot.dayLabel : 'Now', o.pickupSlot ? o.pickupSlot.time : 'Slot']].map(([v, l], i) => (
                <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.line }}>
                  <T size={15} w="extrabold" raw numberOfLines={1}>{v}</T>
                  <T size={11} w="semibold" color={colors.muted} numberOfLines={1}>{l}</T>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <MapPin size={15} color={colors.muted} />
              <T size={13} color={colors.ink2} numberOfLines={2} style={{ flex: 1 }}>{`${o.pickupAddress.street}, ${o.pickupAddress.city} · ${o.user.name.split(' ')[0]} ${o.user.name.split(' ')[1]?.[0] ?? ''}.`}</T>
            </View>
            {o.notes ? <T size={12} color={colors.muted} numberOfLines={2}>{`“${o.notes}”`}</T> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Skip" variant="outline" full={false} loading={busy === 'skip'} disabled={!!busy} onPress={skip} style={{ width: 104 }} />
              <Button label="Accept pickup" variant="deep" loading={busy === 'accept'} disabled={!!busy} onPress={accept} style={{ flex: 1 }} iconRight={<Navigation size={16} color={colors.white} />} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------- Notifications */

const NOTE_ICON: Record<string, { Icon: typeof Bell; tone: 'green' | 'gold' | 'blue' | 'grey' }> = {
  new_order: { Icon: BellRing, tone: 'green' },
  order_update: { Icon: Package, tone: 'blue' },
  payment: { Icon: TrendingUp, tone: 'gold' },
  market: { Icon: Gavel, tone: 'gold' },
  kyc: { Icon: ShieldCheck, tone: 'green' },
  subscription: { Icon: ShieldCheck, tone: 'green' },
  promotion: { Icon: TrendingUp, tone: 'grey' },
};

export function NotificationsScreen({ navigation }: P<'Notifications'>) {
  const q = useQuery<{ notifications: any[] }>('/notifications');
  const list = q.data?.notifications ?? [];
  useEffect(() => {
    if ((q.data?.notifications ?? []).some((n) => !n.read)) api('/notifications/read', { method: 'PUT' }).catch(() => {});
  }, [q.data]);
  return (
    <Screen>
      <AppBar title="Notifications" />
      <FlatList
        data={list}
        keyExtractor={(n) => n._id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={q.reload} colors={[colors.primary]} />}
        ListEmptyComponent={q.loading ? <Loading /> : (
          <View style={{ alignItems: 'center', paddingTop: 30, gap: 8 }}>
            <Image source={images.emptyNotifications} style={{ width: 160, height: 160, borderRadius: 24 }} />
            <T size={17} w="extrabold">No notifications</T>
            <T size={13} color={colors.muted} center>New requests, payments and plan updates show up here.</T>
          </View>
        )}
        renderItem={({ item }) => {
          const n = NOTE_ICON[item.type] ?? NOTE_ICON.promotion;
          const go = item.type === 'new_order' ? () => navigation.navigate('Requests') : item.type === 'market' ? () => navigation.navigate('Main', { screen: 'Market' }) : item.orderId ? () => navigation.navigate('Job', { id: item.orderId }) : undefined;
          return (
            <Card onPress={go} style={{ flexDirection: 'row', gap: 12, backgroundColor: item.read ? colors.white : '#F6FBF8' }}>
              <IconBadge tone={n.tone}><n.Icon size={18} color={n.tone === 'gold' ? colors.goldText : n.tone === 'blue' ? colors.blueText : n.tone === 'grey' ? colors.ink2 : colors.primary} /></IconBadge>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T size={14} w="bold" style={{ flex: 1 }}>{item.title}</T>
                  <T size={11} color={colors.faint}>{ago(item.createdAt)}</T>
                </View>
                <T size={13} color={colors.ink2} lh={18}>{item.message}</T>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

/* ----------------------------------------------------------------- Prices */

export function PricesScreen() {
  const { prices } = useStore();
  return (
    <Screen>
      <AppBar title="Today's rates" subtitle={`Customer rates · ${dateLabel(new Date())}`} />
      <FlatList
        data={prices}
        keyExtractor={(p) => p._id}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        ListHeaderComponent={<T size={12} color={colors.muted} lh={17} style={{ marginBottom: 12 }}>These are the rates customers see in the Scraptox app. Pay at least these rates at the door.</T>}
        ListEmptyComponent={<Loading />}
        renderItem={({ item, index }) => {
          const ch = item.change ?? 0;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderTopWidth: index ? 0 : 1, borderTopLeftRadius: index ? 0 : radius.lg, borderTopRightRadius: index ? 0 : radius.lg, borderBottomLeftRadius: index === prices.length - 1 ? radius.lg : 0, borderBottomRightRadius: index === prices.length - 1 ? radius.lg : 0 }}>
              <Image source={categoryMeta(item.category).image} style={{ width: 40, height: 40, borderRadius: 10 }} />
              <T size={14} w="bold" style={{ flex: 1 }}>{catName(item.category)}</T>
              {ch ? <T size={11} w="bold" color={ch > 0 ? colors.primary : colors.red} raw>{`${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}%`}</T> : null}
              <T size={14} w="extrabold" color={colors.deep} raw style={{ minWidth: 76, textAlign: 'right' }}>{`${inr(item.pricePerKg)}/${unitOf(item)}`}</T>
            </View>
          );
        }}
      />
    </Screen>
  );
}

