import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Image, Linking, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { BadgeCheck, Check, ChevronLeft, ClipboardList, CreditCard, Gavel, MessageCircle, Phone, Search, Star, Trash2, Truck } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, Avatar, BottomBar, Button, Card, DemoNote, Divider, EmptyState, ErrorBox, IconButton, InfoRow, Loading, Screen, Sheet, StatusPill, Tag } from '../components/ui';
import { IconBadge } from '../components/brand';
import { colors, radius, shadow } from '../theme';
import { api } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { categoryMeta, CLEANING_SERVICES, cleaningFee, images } from '../data/catalog';
import { CleaningTile } from './cleaning';
import { useStore } from '../store/AppStore';
import { openRazorpay, PaymentCancelled } from '../api/razorpay';
import { dateLabel, firstName, inr, qty, whenLabel, catName } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

const isActive = (s: string) => s === 'pending' || s === 'confirmed' || s === 'in_progress';
const unitFor = (cat: string) => categoryMeta(cat).unit;

/* --------------------------------------------------------------- Requests */

type Tab = 'all' | 'active' | 'completed' | 'cancelled';

export function RequestsScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  const q = useQuery<{ orders: any[] }>('/orders/my-orders', undefined, { poll: 8000 });
  const market = useQuery<{ requests: any[] }>('/marketplace/my-requests');
  const all = q.data?.orders ?? [];
  const list = all.filter((o) => tab === 'all' || (tab === 'active' ? isActive(o.status) : o.status === tab));
  const lots = (market.data?.requests ?? []).filter((r) => r.status === 'open');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <Screen>
      <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={22} w="extrabold">My requests</T>
          <Pressable onPress={() => nav.navigate('Chats')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}>
            <MessageCircle size={17} color={colors.primary} />
            <T size={13} w="bold" color={colors.primary}>Chats</T>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 22 }}>
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: on ? colors.brand : 'transparent' }}>
                <T size={14} w={on ? 'extrabold' : 'semibold'} color={on ? colors.primary : colors.muted}>{t.label}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
      {q.error && !q.data ? <ErrorBox text={q.error.message} onRetry={q.reload} /> : null}
      <FlatList
        data={list}
        keyExtractor={(o) => o._id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { q.reload(); market.reload(); }} colors={[colors.primary]} />}
        ListHeaderComponent={(tab === 'all' || tab === 'active') && lots.length ? <View style={{ gap: 12, marginBottom: 12 }}>{lots.map((l) => <BidCard key={l._id} lot={l} onDone={market.reload} />)}</View> : undefined}
        ListEmptyComponent={
          q.loading && !q.data ? <Loading /> : (
            <EmptyState
              icon={<ClipboardList size={30} color={colors.primary} />}
              title={tab === 'cancelled' ? 'No cancelled pickups' : tab === 'completed' ? 'No completed pickups yet' : 'No pickups yet'}
              text="Book your first pickup in under 2 minutes. A verified collector comes to your door."
              action={tab === 'all' || tab === 'active' ? <Button label="Sell scrap" onPress={() => nav.navigate('SellCategory')} /> : undefined}
            />
          )
        }
        renderItem={({ item }) => <OrderCard o={item} />}
      />
    </Screen>
  );
}

function OrderCard({ o }: { o: any }) {
  const nav = useNavigation();
  const cats: string[] = o.scrapItems.map((i: any) => catName(i.category));
  const cleaning = o.orderType === 'cleaning_service' ? CLEANING_SERVICES.find((c) => c.id === o.serviceDetails?.serviceType) : null;
  const later = o.preferredTime === 'later' && o.pickupSlot;
  const priced = o.totalAmount > 0;
  const paidOnline = o.paymentStatus === 'completed';
  const sub = cleaning
    ? (o.status === 'pending' ? (later ? `${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : 'Finding a cleaning partner')
      : o.status === 'cancelled' ? (o.cancelReason || 'Cancelled')
        : o.status === 'completed' ? `Paid ${inr(o.totalAmount)} · ${o.scrapper?.name ?? ''}`
          : o.status === 'in_progress' ? (!priced ? `${o.scrapper?.name ?? ''} · inspecting` : paidOnline ? `${o.scrapper?.name ?? ''} · paid, job in progress` : `Price ready · pay ${inr(o.totalAmount)}`)
            : `${o.scrapper?.name ?? ''}${later ? ` · visit ${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : ''}`)
    : o.status === 'pending' ? (later ? `${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : 'Finding a collector nearby')
      : o.status === 'cancelled' ? (o.cancelReason || 'Cancelled')
        : o.status === 'completed' ? `Paid to wallet · ${o.scrapper?.name ?? ''}`
          : o.status === 'in_progress' ? `${o.scrapper?.name} · ${o.tracking?.arrived ? 'at your door' : `${o.tracking?.etaMin ?? 8} min away`}`
            : `${o.scrapper?.name ?? ''}${later ? ` · ${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : ''}`;
  const actions: { label: string; tone: 'tonal' | 'outline'; go: () => void }[] = [];
  if (isActive(o.status)) {
    actions.push({ label: o.status === 'pending' || cleaning ? 'View details' : 'Track live', tone: 'tonal', go: () => nav.navigate('Order', { id: o._id }) });
    if (o.scrapper) actions.push({ label: 'Chat', tone: 'outline', go: () => nav.navigate('ChatThread', { orderId: o._id, name: o.scrapper.name }) });
  } else if (o.status === 'completed') {
    actions.push(o.reviewed ? { label: 'View receipt', tone: 'tonal', go: () => nav.navigate('Order', { id: o._id }) } : { label: 'Rate & review', tone: 'tonal', go: () => nav.navigate('Review', { orderId: o._id }) });
    actions.push({ label: o.reviewed ? (cleaning ? 'Book again' : 'Sell again') : 'Receipt', tone: 'outline', go: () => (o.reviewed ? (cleaning ? nav.navigate('Cleaning') : nav.navigate('SellCategory')) : nav.navigate('Order', { id: o._id })) });
  } else {
    actions.push({ label: 'Book again', tone: 'tonal', go: () => (cleaning ? nav.navigate('Cleaning') : nav.navigate('SellCategory', { preselect: cats[0] })) });
    actions.push({ label: 'Details', tone: 'outline', go: () => nav.navigate('Order', { id: o._id }) });
  }
  return (
    <Card onPress={() => nav.navigate('Order', { id: o._id })} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T size={12} w="semibold" color={colors.muted} raw>{`#${o.orderNo} · ${whenLabel(o.createdAt)}`}</T>
        <StatusPill status={o.status} label={cleaning && o.status === 'in_progress' ? 'In progress' : undefined} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {cleaning ? <CleaningTile svc={cleaning} /> : null}
          {cats.slice(0, 3).map((c, i) => (
            <Image key={c} source={categoryMeta(c).image} style={{ width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: colors.white, marginLeft: i ? -12 : 0 }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <T size={14} w="bold" numberOfLines={1}>{cleaning ? cleaning.name : cats.join(', ')}</T>
          <T size={12} color={colors.muted} numberOfLines={1}>{sub}</T>
        </View>
        {cleaning && !priced
          ? <T size={12} w="bold" color={colors.muted} center style={{ width: 64 }}>Price after visit</T>
          : <T size={16} w="extrabold" color={o.status === 'cancelled' ? colors.faint : colors.deep} raw>{inr(o.totalAmount)}</T>}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {actions.map((a) => <Button key={a.label} label={a.label} size="md" variant={a.tone} onPress={a.go} style={{ flex: 1, height: 40 }} />)}
      </View>
    </Card>
  );
}

function BidCard({ lot, onDone }: { lot: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const best = [...lot.bids].sort((a: any, b: any) => b.amount - a.amount)[0];
  const hours = Math.max(0, Math.round((Date.parse(lot.endsAt) - Date.now()) / 3600000));
  const accept = (bid: any) =>
    Alert.alert('Accept this bid?', `${bid.scrapper.name} will buy "${lot.title}" for ${inr(bid.amount)}. Other bids will be closed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          try {
            await api(`/marketplace/bids/${bid._id}/accept`, { method: 'PATCH' });
            setOpen(false);
            onDone();
          } catch (e: any) {
            Alert.alert('Could not accept', e.message);
          }
        },
      },
    ]);
  return (
    <Card style={{ gap: 10, borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.gold }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tag tone="gold" label={`Bulk sale · ${lot.bids.length} bids`} />
        <T size={12} color={colors.muted}>{`Ends in ${hours}h`}</T>
      </View>
      <T size={15} w="bold">{`${lot.title} · ~${lot.estimatedWeight} kg`}</T>
      {best ? (
        <Pressable onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.bg }}>
          <Gavel size={18} color={colors.goldText} />
          <T size={13} style={{ flex: 1 }} numberOfLines={1}>
            <T size={13} w="extrabold" raw>{`Best bid ${inr(best.amount)}`}</T>
            {` · ${best.scrapper.name}`}
          </T>
          <View style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
            <T size={13} w="bold" color={colors.white}>View bids</T>
          </View>
        </Pressable>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Bids">
        <View style={{ gap: 10 }}>
          {[...lot.bids].sort((a: any, b: any) => b.amount - a.amount).map((b: any, i: number) => (
            <View key={b._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: i ? colors.line : colors.primary, backgroundColor: i ? colors.white : colors.green50 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14} w="bold">{b.scrapper.name}</T>
                <T size={12} color={colors.muted} numberOfLines={2}>{`★ ${b.scrapper.rating}${b.message ? ` · ${b.message}` : ''}`}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <T size={16} w="extrabold" raw>{inr(b.amount)}</T>
                <Button label="Accept" size="sm" full={false} onPress={() => accept(b)} />
              </View>
            </View>
          ))}
        </View>
      </Sheet>
    </Card>
  );
}

/* --------------------------------------------------------- Order / track */

const STEPS = [
  { key: 'pending', label: 'Booked' },
  { key: 'confirmed', label: 'Accepted' },
  { key: 'in_progress', label: 'On the way' },
  { key: 'completed', label: 'Paid' },
];

export function OrderScreen({ route, navigation }: P<'Order'>) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const q = useQuery<{ order: any }>(`/orders/${id}`, undefined, { poll: 3000 });
  const [cancelOpen, setCancelOpen] = useState(false);
  const o = q.data?.order;
  const mapRef = useRef<MapView>(null);

  if (!o) {
    return (
      <Screen>
        <AppBar title="Pickup" />
        {q.error ? <ErrorBox text={q.error.message} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const live = isActive(o.status);
  if (!live) return <Receipt o={o} />;

  const pickup = o.pickupAddress.coordinates;
  const collector = o.tracking?.location;
  const stepIndex = STEPS.findIndex((s) => s.key === o.status);
  const isCleaningJob = o.orderType === 'cleaning_service';
  const steps = isCleaningJob ? STEPS.map((s) => (s.key === 'in_progress' ? { ...s, label: 'Visit' } : s.key === 'completed' ? { ...s, label: 'Done' } : s)) : STEPS;
  const headline = isCleaningJob && o.status === 'in_progress'
    ? (!(o.totalAmount > 0) ? 'Partner is inspecting · price coming up' : o.paymentStatus === 'completed' ? 'Paid · cleaning in progress' : `Price ready · ${inr(o.totalAmount)}`)
    : isCleaningJob && o.status === 'confirmed' && !(o.preferredTime === 'later' && o.pickupSlot) ? 'Partner accepted · visiting soon'
    : o.status === 'pending' ? (o.preferredTime === 'later' && o.pickupSlot ? `Scheduled · ${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : o.orderType === 'cleaning_service' ? 'Finding a cleaning partner' : 'Finding a collector near you')
      : o.status === 'confirmed' ? (o.preferredTime === 'later' && o.pickupSlot ? `Accepted · ${o.pickupSlot.dayName}, ${o.pickupSlot.slot}` : 'Collector accepted · leaving soon')
        : o.tracking?.arrived ? 'At your door · weighing now' : `On the way · ${o.tracking?.etaMin ?? 8} min`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        userInterfaceStyle="light"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.56 }}
        initialRegion={{ latitude: pickup.lat + 0.008, longitude: pickup.lng - 0.004, latitudeDelta: 0.032, longitudeDelta: 0.032 }}
        toolbarEnabled={false}
        showsCompass={false}
        mapPadding={{ top: insets.top + 60, bottom: 40, left: 0, right: 0 }}>
        {o.route && o.status === 'in_progress' ? <Polyline coordinates={o.route.map((p: any) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.primary} strokeWidth={5} /> : null}
        <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup" anchor={{ x: 0.5, y: 1 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white }} />
            </View>
          </View>
        </Marker>
        {collector ? (
          <Marker coordinate={{ latitude: collector.lat, longitude: collector.lng }} title={o.scrapper?.name} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,129,58,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={12} color={colors.white} />
              </View>
            </View>
          </Marker>
        ) : null}
      </MapView>

      <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', gap: 10 }}>
        <IconButton label="Back" tone="white" onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={colors.ink} strokeWidth={2.4} />
        </IconButton>
        <View style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, ...shadow.raised }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.status === 'in_progress' ? colors.teal : o.status === 'confirmed' ? colors.blue : colors.gold }} />
          <T size={14} w="bold" numberOfLines={1} style={{ flex: 1 }}>{headline}</T>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: height * 0.5, backgroundColor: colors.white, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, ...shadow.sheet }}>
        <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 10, gap: 10, paddingBottom: insets.bottom + 20 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong }} />
          {/* Progress */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {steps.map((s, i) => {
              const done = i < stepIndex;
              const cur = i === stepIndex;
              return (
                <React.Fragment key={s.key}>
                  {i ? <View style={{ flex: 1, height: 3, marginTop: 10, backgroundColor: i <= stepIndex ? colors.primary : colors.line }} /> : null}
                  <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: done ? colors.primary : colors.white, borderWidth: done ? 0 : cur ? 6 : 0, borderColor: colors.primary, ...(done || cur ? {} : { backgroundColor: colors.line }), alignItems: 'center', justifyContent: 'center' }}>
                      {done ? <Check size={12} color={colors.white} strokeWidth={4} /> : null}
                    </View>
                    <T size={11} w={cur ? 'extrabold' : 'bold'} color={cur ? colors.primary : done ? colors.ink : colors.muted} center>{s.label}</T>
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          {o.scrapper ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg }}>
              <Avatar source={images.avatarPartner} size={52} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={15} w="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{o.scrapper.name}</T>
                  <BadgeCheck size={16} color={colors.white} fill={colors.brand} />
                </View>
                <T size={12} color={colors.muted} numberOfLines={1} raw>{`★ ${o.scrapper.rating} (${o.scrapper.totalRatings}) · ${o.scrapper.vehicleInfo?.type} · ${o.scrapper.vehicleInfo?.number}`}</T>
              </View>
              <IconButton label="Chat" onPress={() => navigation.navigate('ChatThread', { orderId: o._id, name: o.scrapper.name })}>
                <MessageCircle size={20} color={colors.primary} />
              </IconButton>
              <IconButton label="Call" tone="primary" onPress={() => Linking.openURL(`tel:${o.scrapper.phone}`)}>
                <Phone size={19} color={colors.white} />
              </IconButton>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.green50 }}>
              <IconBadge tone="green"><Search size={18} color={colors.primary} /></IconBadge>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">Matching a verified collector</T>
                <T size={12} color={colors.muted}>Collectors within 25 km get your request.</T>
              </View>
            </View>
          )}

          {o.orderType === 'cleaning_service' ? <CleaningPayCard o={o} onPaid={q.reload} /> : null}

          {o.tracking?.arrived && o.orderType !== 'cleaning_service' ? <DemoNote text="The collector is weighing your items. The final amount will show here in a moment." /> : null}

          <View style={{ backgroundColor: colors.bg, borderRadius: radius.lg, padding: 14, gap: 8 }}>
            <InfoRow label="Order" value={`#${o.orderNo} · ${whenLabel(o.createdAt)}`} />
            <InfoRow label={o.orderType === 'cleaning_service' ? 'Service' : 'Items'} value={o.orderType === 'cleaning_service' ? `${CLEANING_SERVICES.find((c) => c.id === o.serviceDetails?.serviceType)?.name ?? 'Cleaning'} · ${o.serviceDetails?.description ?? ''}` : o.scrapItems.map((i: any) => `${catName(i.category)} ${qty(i.weight, unitFor(i.category))}`).join(' · ')} />
            <InfoRow label={o.orderType === 'cleaning_service' ? 'Visit at' : 'Pickup at'} value={[o.pickupAddress.street, o.pickupAddress.city].filter(Boolean).join(', ')} />
            <InfoRow label={o.orderType === 'cleaning_service' ? 'Price' : 'Estimate'} value={o.orderType === 'cleaning_service' && !(o.totalAmount > 0) ? 'After inspection' : inr(o.totalAmount)} strong valueColor={colors.deep} />
          </View>
          {o.status !== 'in_progress' ? <Button label={o.orderType === 'cleaning_service' ? 'Cancel booking' : 'Cancel pickup'} variant="danger" size="md" onPress={() => setCancelOpen(true)} /> : null}
        </ScrollView>
      </View>
      <CancelSheet visible={cancelOpen} onClose={() => setCancelOpen(false)} orderId={o._id} onDone={() => { setCancelOpen(false); q.reload(); }} />
    </View>
  );
}

/**
 * Cleaning jobs are priced by the partner after inspection. Once the quote is
 * in, the user pays online: any shortfall in the wallet is added through
 * Razorpay (the same recharge flow as the wallet screen), then the exact quote
 * is paid to the partner with /wallet/pay-order. The 1% platform fee stays in
 * the wallet and is settled when the job is completed.
 */
function CleaningPayCard({ o, onPaid }: { o: any; onPaid: () => void }) {
  const { user } = useStore();
  const [busy, setBusy] = useState(false);
  const quote = Number(o.totalAmount) || 0;
  const fee = cleaningFee(quote);
  const due = Math.round((quote + fee) * 100) / 100;

  if (o.paymentStatus === 'completed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.green50, borderWidth: 1, borderColor: colors.green100 }}>
        <BadgeCheck size={20} color={colors.white} fill={colors.brand} />
        <View style={{ flex: 1 }}>
          <T size={14} w="extrabold" color={colors.deep}>Paid online</T>
          <T size={12} color={colors.ink2} raw>{`${inr(quote, true)} paid to your cleaning partner · ${inr(fee, true)} platform fee`}</T>
        </View>
      </View>
    );
  }
  if (!(quote > 0)) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.night }}>
        <CreditCard size={20} color={colors.green200} />
        <View style={{ flex: 1 }}>
          <T size={14} w="extrabold" color={colors.white}>Price after inspection</T>
          <T size={12} color={colors.nightText} lh={16}>Your partner shares the price here after the visit. You can then pay online.</T>
        </View>
      </View>
    );
  }

  const pay = async () => {
    setBusy(true);
    try {
      const w = await api('/wallet/profile');
      const balance = Number(w.data?.balance) || 0;
      const need = Math.max(0, Math.ceil(due - balance));
      if (need > 0) {
        const c = await api('/wallet/recharge/create', { method: 'POST', body: { amount: need } });
        const paid = await openRazorpay({
          keyId: c.data.keyId,
          orderId: c.data.orderId,
          amountPaise: c.data.amount,
          description: `Cleaning #${o.orderNo}`,
          prefill: { name: user?.name, email: user?.email, contact: user?.phone },
        });
        await api('/wallet/recharge/verify', { method: 'POST', body: paid });
      }
      await api('/wallet/pay-order', { method: 'POST', body: { orderId: o._id, amount: quote } });
      Alert.alert('Payment successful', `${inr(quote)} paid for your cleaning.`);
      onPaid();
    } catch (e: any) {
      if (!(e instanceof PaymentCancelled)) Alert.alert('Payment failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ borderRadius: radius.lg, backgroundColor: colors.night, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CreditCard size={18} color={colors.green200} />
        <T size={14} w="extrabold" color={colors.white} style={{ flex: 1 }}>Price shared by your partner</T>
      </View>
      <View style={{ gap: 6 }}>
        {[['Cleaning price', inr(quote, true)], ['Platform fee (1%)', inr(fee, true)]].map(([l, v]) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} color={colors.nightText}>{l}</T>
            <T size={13} w="semibold" color={colors.white} raw>{v}</T>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: colors.nightLine, marginVertical: 2 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={14} w="extrabold" color={colors.white}>Total</T>
          <T size={16} w="extrabold" color={colors.green200} raw>{inr(due, true)}</T>
        </View>
      </View>
      <Button label={`Pay ${inr(due, true)} online`} loading={busy} onPress={pay} icon={<CreditCard size={18} color={colors.white} />} />
      <T size={11} color={colors.nightMuted} center>UPI, cards and net banking via Razorpay · wallet balance is used first</T>
    </View>
  );
}

const REASONS = ['Changed my plans', 'Got a better price elsewhere', 'Booked by mistake', 'Collector is taking too long', 'Other'];

function CancelSheet({ visible, onClose, orderId, onDone }: { visible: boolean; onClose: () => void; orderId: string; onDone: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet visible={visible} onClose={onClose} title="Cancel this pickup?">
      <View style={{ gap: 10 }}>
        {REASONS.map((r) => (
          <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} style={{ padding: 14, borderRadius: radius.md, borderWidth: reason === r ? 1.5 : 1, borderColor: reason === r ? colors.red : colors.line, backgroundColor: reason === r ? colors.redSoft : colors.white }}>
            <T size={14} w="semibold">{r}</T>
          </Pressable>
        ))}
        <Button
          label="Cancel pickup"
          variant="danger"
          disabled={!reason}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api(`/orders/${orderId}/cancel`, { method: 'POST', body: { reason } });
              onDone();
            } catch (e: any) {
              Alert.alert('Could not cancel', e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button label="Keep my pickup" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}

function Receipt({ o }: { o: any }) {
  const nav = useNavigation();
  const done = o.status === 'completed';
  if (o.orderType === 'cleaning_service') return <CleaningReceipt o={o} />;
  return (
    <Screen>
      <AppBar title={done ? 'Pickup receipt' : 'Cancelled pickup'} subtitle={`#${o.orderNo}`} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
          <StatusPill status={o.status} label={done ? 'Paid to wallet' : 'Cancelled'} />
          <T size={34} w="extrabold" color={done ? colors.deep : colors.faint} raw style={{ letterSpacing: -0.6 }}>{inr(o.totalAmount, true)}</T>
          <T size={12} color={colors.muted}>{done ? `Completed ${dateLabel(o.completedDate)} · ${o.scrapper?.name}` : o.cancelReason || 'Cancelled'}</T>
        </Card>
        <Card style={{ paddingVertical: 4 }}>
          {o.scrapItems.map((it: any, i: number) => {
            const u = unitFor(it.category);
            return (
              <View key={catName(it.category)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === o.scrapItems.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
                <Image source={categoryMeta(it.category).image} style={{ width: 40, height: 40, borderRadius: 10 }} />
                <View style={{ flex: 1 }}>
                  <T size={14} w="bold">{catName(it.category)}</T>
                  <T size={12} color={colors.muted} raw>
                    {`${qty(it.weight, u)} × ${inr(it.rate)}/${u}${it.estimatedWeight && it.estimatedWeight !== it.weight ? `  (you said ${qty(it.estimatedWeight, u)})` : ''}`}
                  </T>
                </View>
                <T size={14} w="extrabold" raw>{inr(it.total, true)}</T>
              </View>
            );
          })}
        </Card>
        <Card style={{ gap: 8 }}>
          <InfoRow label="Booked" value={whenLabel(o.createdAt)} />
          <InfoRow label="Pickup at" value={[o.pickupAddress.street, o.pickupAddress.city].filter(Boolean).join(', ')} />
          {done ? <InfoRow label="Payment" value="Scraptox wallet" /> : null}
          {done ? <InfoRow label="Weighing" value="Digital scale, at your door" /> : null}
        </Card>
        {done ? (
          o.reviewed ? <Button label="See my reviews" variant="outline" onPress={() => nav.navigate('MyReviews')} /> : <Button label={`Rate ${firstName(o.scrapper?.name)}`} icon={<Star size={18} color={colors.white} />} onPress={() => nav.navigate('Review', { orderId: o._id })} />
        ) : (
          <Button label="Book again" onPress={() => nav.navigate('SellCategory', { preselect: o.scrapItems[0]?.category })} />
        )}
      </ScrollView>
    </Screen>
  );
}

/** Receipt for a finished or cancelled cleaning job: what the user paid, not what they earned. */
function CleaningReceipt({ o }: { o: any }) {
  const nav = useNavigation();
  const done = o.status === 'completed';
  const svc = CLEANING_SERVICES.find((c) => c.id === o.serviceDetails?.serviceType);
  const price = Number(o.totalAmount) || 0;
  const paid = o.paymentStatus === 'completed';
  const fee = paid ? cleaningFee(price) : 0;
  return (
    <Screen>
      <AppBar title={done ? 'Cleaning receipt' : 'Cancelled booking'} subtitle={`#${o.orderNo}`} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
          <StatusPill status={o.status} label={done ? 'Paid' : 'Cancelled'} />
          <T size={34} w="extrabold" color={done ? colors.deep : colors.faint} raw style={{ letterSpacing: -0.6 }}>{inr(price + fee, true)}</T>
          <T size={12} color={colors.muted} raw>{done ? `Completed ${dateLabel(o.completedDate)} · ${o.scrapper?.name ?? ''}` : o.cancelReason || 'Cancelled'}</T>
        </Card>
        <Card style={{ gap: 8 }}>
          <InfoRow label="Service" value={`${svc?.name ?? 'Cleaning'}${o.serviceDetails?.description ? ` · ${o.serviceDetails.description}` : ''}`} />
          {paid ? <InfoRow label="Cleaning price" value={inr(price, true)} /> : null}
          {paid ? <InfoRow label="Platform fee (1%)" value={inr(fee, true)} /> : null}
          {paid ? <InfoRow label="Total paid" value={inr(price + fee, true)} strong /> : null}
        </Card>
        <Card style={{ gap: 8 }}>
          <InfoRow label="Booked" value={whenLabel(o.createdAt)} />
          <InfoRow label="Visit at" value={[o.pickupAddress?.street, o.pickupAddress?.city].filter(Boolean).join(', ')} />
          {paid ? <InfoRow label="Payment" value="Online · Scraptox wallet" /> : null}
        </Card>
        {done ? (
          o.reviewed ? <Button label="See my reviews" variant="outline" onPress={() => nav.navigate('MyReviews')} /> : <Button label={`Rate ${firstName(o.scrapper?.name)}`} icon={<Star size={18} color={colors.white} />} onPress={() => nav.navigate('Review', { orderId: o._id })} />
        ) : null}
        <Button label="Book again" variant={done ? 'outline' : 'primary'} onPress={() => nav.navigate('Cleaning')} />
      </ScrollView>
    </Screen>
  );
}

/* ----------------------------------------------------------------- Review */

const TAGS = ['On time', 'Fair weighing', 'Polite', 'Paid instantly', 'Clean pickup'];
const CLEANING_TAGS = ['On time', 'Thorough job', 'Polite', 'Fair price', 'Left it tidy'];

export function ReviewScreen({ route, navigation }: P<'Review'>) {
  const q = useQuery<{ order: any }>(`/orders/${route.params.orderId}`);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const o = q.data?.order;
  const words = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'];
  return (
    <Screen>
      <AppBar title={o?.orderType === 'cleaning_service' ? 'Rate your cleaning' : 'Rate your pickup'} subtitle={o ? `#${o.orderNo}` : undefined} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 22 }}>
          <Avatar source={images.avatarPartner} size={72} />
          <T size={17} w="extrabold">{o?.scrapper?.name ?? 'Your collector'}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n} stars`} hitSlop={4}>
                <Star size={38} color={n <= rating ? colors.gold : colors.lineStrong} fill={n <= rating ? colors.gold : 'none'} />
              </Pressable>
            ))}
          </View>
          <T size={14} w="bold" color={rating ? colors.goldText : colors.muted}>{rating ? words[rating] : 'Tap to rate'}</T>
        </Card>
        <View style={{ gap: 10 }}>
          <T size={14} w="bold">What went well?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(o?.orderType === 'cleaning_service' ? CLEANING_TAGS : TAGS).map((t) => {
              const on = tags.includes(t);
              return (
                <Pressable key={t} onPress={() => setTags((x) => (on ? x.filter((y) => y !== t) : [...x, t]))} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? colors.green50 : colors.white, borderWidth: 1, borderColor: on ? colors.primary : colors.lineStrong }}>
                  <T size={13} w="semibold" color={on ? colors.deep : colors.ink2}>{t}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
        <TextInput value={comment} onChangeText={setComment} multiline placeholder={o?.orderType === 'cleaning_service' ? 'Tell others about the cleaning (optional)' : 'Tell others about your pickup (optional)'} placeholderTextColor={colors.faint} style={{ minHeight: 100, textAlignVertical: 'top', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, padding: 12, fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, color: colors.ink }} />
      </ScrollView>
      <BottomBar>
        <Button
          label="Submit review"
          disabled={!rating}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api('/reviews', { method: 'POST', body: { orderId: route.params.orderId, scrapperId: o?.scrapper?._id, rating, tags, comment: comment.trim(), title: words[rating] } });
              Alert.alert('Thank you!', 'Your review helps other customers and rewards good collectors.');
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not submit', e.message);
              setBusy(false);
            }
          }}
        />
      </BottomBar>
    </Screen>
  );
}

export function MyReviewsScreen() {
  const q = useQuery<{ reviews: any[] }>('/reviews/my-reviews');
  const list = q.data?.reviews ?? [];
  const remove = (id: string) =>
    Alert.alert('Delete this review?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api(`/reviews/${id}`, { method: 'DELETE' }).catch(() => {}); q.reload(); } },
    ]);
  return (
    <Screen>
      <AppBar title="My reviews" />
      <FlatList
        data={list}
        keyExtractor={(r) => r._id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={q.loading ? <Loading /> : <EmptyState icon={<Star size={30} color={colors.primary} />} title="No reviews yet" text="After a pickup, rate your collector to help others." />}
        renderItem={({ item }) => (
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} color={colors.gold} fill={n <= item.rating ? colors.gold : 'none'} />)}
              </View>
              <T size={12} color={colors.muted} style={{ flex: 1 }} raw>{`#${item.orderNo} · ${dateLabel(item.createdAt)}`}</T>
              <Pressable onPress={() => remove(item._id)} accessibilityLabel="Delete review" hitSlop={10}>
                <Trash2 size={16} color={colors.muted} />
              </Pressable>
            </View>
            <T size={14} w="bold">{`${item.title || 'Review'} · ${item.scrapper?.name ?? ''}`}</T>
            {item.comment ? <T size={13} color={colors.ink2} lh={19}>{item.comment}</T> : null}
            {item.tags?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{item.tags.map((t: string) => <Tag key={t} label={t} />)}</View> : null}
          </Card>
        )}
      />
    </Screen>
  );
}
