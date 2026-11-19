import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Linking, RefreshControl, ScrollView, StatusBar, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Check, CircleCheck, MapPin, MessageCircle, Navigation, Phone, Scale, Wallet } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, Initials, BackButton, BottomBar, Button, Card, DemoNote, ErrorBox, IconButton, InfoRow, Loading, RadioDot, Screen, Tag } from '../components/ui';
import { colors, radius } from '../theme';
import { api } from '../api/client';
import { clearQueryCache, useQuery } from '../hooks/useQuery';
import { categoryMeta, images } from '../data/catalog';
import { inr, phoneLabel, qty, whenLabel } from '../utils/format';
import { Alert } from '../i18n/Alert';
import { itemsLine } from './home';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/** Where a job is, from the backend fields: 0 reach · 1 weigh · 2 pay · 3 complete · 4 done. */
export function jobStep(o: any): 0 | 1 | 2 | 3 | 4 {
  if (o.status === 'completed') return 4;
  if (o.status === 'confirmed') return 0;
  if (o.paymentStatus === 'completed') return 3;
  if (o.weighedAt) return 2;
  return 1;
}

const STEP_LABEL = ['Reach', 'Weigh', 'Pay', 'Done'];

function JobStatus({ o }: { o: any }) {
  const s = jobStep(o);
  if (o.status === 'cancelled') return <Tag tone="red" label="CANCELLED" />;
  if (s === 4) return <Tag label="COMPLETED" />;
  return <Tag tone={s === 0 ? 'green' : 'gold'} label={['TO PICK UP', 'WEIGHING', 'PAY CUSTOMER', 'COMPLETE IT'][s]} />;
}

/* ------------------------------------------------------------------- Jobs */

export function JobsScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const q = useQuery<{ orders: any[] }>('/orders/my-assigned');
  const all = q.data?.orders ?? [];
  const active = all.filter((o) => o.status === 'confirmed' || o.status === 'in_progress');
  const done = all.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  const list = tab === 'active' ? active : done;
  return (
    <Screen>
      <AppBar title="My pickups" back={false}>
        <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 }}>
          {([['active', `Active · ${active.length}`], ['done', 'History']] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={{ flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? colors.white : 'transparent' }}>
              <T size={13} w={tab === k ? 'extrabold' : 'semibold'} color={tab === k ? colors.deep : colors.muted}>{l}</T>
            </Pressable>
          ))}
        </View>
      </AppBar>
      <FlatList
        data={list}
        keyExtractor={(o) => o._id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={q.reload} colors={[colors.primary]} />}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={q.loading ? <Loading /> : (
          <View style={{ alignItems: 'center', paddingTop: 30, gap: 8, paddingHorizontal: 24 }}>
            <Image source={images.emptyJobs} style={{ width: 170, height: 170, borderRadius: 24 }} />
            <T size={17} w="extrabold" center>{tab === 'active' ? 'No active pickups' : 'No completed pickups yet'}</T>
            <T size={13} color={colors.muted} center>{tab === 'active' ? 'Go online on the dashboard and accept a request near you.' : 'Pickups you complete show up here.'}</T>
          </View>
        )}
        renderItem={({ item: o }) => (
          <Card onPress={() => nav.navigate('Job', { id: o._id })} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T size={12} w="bold" color={colors.muted} raw>{`#${o.orderNo} · ${o.status === 'completed' ? whenLabel(o.completedDate) : o.pickupSlot ? `${o.pickupSlot.dayLabel || o.pickupSlot.slot || 'Today'}, ${o.pickupSlot.time || ''}` : 'Pickup now'}`}</T>
                {o.orderNo?.startsWith('ML-') ? <Tag tone="primary" label="META LEAD" /> : null}
              </View>
              <JobStatus o={o} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row' }}>
                {o.scrapItems.slice(0, 3).map((i: any, k: number) => (
                  <Image key={i.category} source={categoryMeta(i.category).image} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.white, marginLeft: k ? -12 : 0 }} />
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <T size={15} w="extrabold" numberOfLines={1}>{o.user.name}</T>
                <T size={12} color={colors.muted} numberOfLines={1}>{itemsLine(o.scrapItems)}</T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T size={15} w="extrabold" color={colors.deep} raw>{inr(o.paidAmount ?? o.totalAmount)}</T>
                <T size={11} color={colors.muted}>{o.paymentStatus === 'completed' ? 'Paid' : 'Estimate'}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <MapPin size={14} color={colors.muted} />
              <T size={12} color={colors.ink2} numberOfLines={1} style={{ flex: 1 }}>{`${o.pickupAddress.street}, ${o.pickupAddress.city}`}</T>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------- Job */

export function JobScreen({ route, navigation }: P<'Job'>) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const q = useQuery<{ order: any }>(`/orders/${route.params.id}`);
  const wallet = useQuery<any>('/wallet/profile');
  const [o, setO] = useState<any>(null);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'wallet' | 'razorpay'>('wallet');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data?.order) setO(q.data.order);
  }, [q.data]);
  useEffect(() => {
    if (!o) return;
    setWeights((w) => (Object.keys(w).length ? w : Object.fromEntries(o.scrapItems.map((i: any) => [i.category, String(i.weight)]))));
  }, [o]);

  const step = o ? jobStep(o) : 0;
  const balance = wallet.data?.balance ?? 0;

  const weighed = useMemo(() => {
    if (!o) return { items: [], total: 0, valid: false };
    const items = o.scrapItems.map((i: any) => {
      const w = Number(weights[i.category]);
      return { ...i, actual: w, line: Number.isFinite(w) ? Math.round(w * i.rate * 100) / 100 : 0 };
    });
    return { items, total: Math.round(items.reduce((n: number, i: any) => n + i.line, 0) * 100) / 100, valid: items.every((i: any) => Number.isFinite(i.actual) && i.actual > 0) };
  }, [o, weights]);

  useEffect(() => {
    if (step === 2) setMethod(balance >= (o?.totalAmount ?? 0) ? 'wallet' : 'razorpay');
  }, [step, balance, o?.totalAmount]);

  if (!o) {
    return (
      <Screen>
        <AppBar title="Pickup" />
        {q.error ? <ErrorBox text={q.error.message} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const update = async (body: any) => {
    const r = await api(`/orders/${o._id}/status`, { method: 'PUT', body });
    setO(r.data.order);
    clearQueryCache();
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message);
    } finally {
      setBusy(false);
    }
  };

  const amount = o.totalAmount;
  const pay = () =>
    Alert.alert(`Pay ${inr(amount, true)} to ${o.user.name.split(' ')[0]}?`, method === 'wallet' ? 'It is paid from your partner wallet to the customer\'s Scraptox wallet.' : 'You top up with Razorpay, and the amount goes to the customer\'s Scraptox wallet.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pay now',
        onPress: () =>
          run(async () => {
            if (method === 'razorpay') {
              const need = Math.max(0, Math.ceil(amount - balance));
              const c = await api('/wallet/recharge/create', { method: 'POST', body: { amount: need } });
              // Real build: Razorpay Checkout with c.data.orderId, then verify with its signature.
              await api('/wallet/recharge/verify', { method: 'POST', body: { amount: need, razorpay_order_id: c.data.orderId } });
            }
            await api('/wallet/pay-order', { method: 'POST', body: { orderId: o._id, amount } });
            await update({ status: 'in_progress', paymentStatus: 'completed', paidAmount: amount });
            wallet.reload();
          }),
      },
    ]);

  const cta = [
    { label: 'I have arrived', hint: 'Tap when you reach the customer’s door', go: () => run(() => update({ status: 'in_progress' })) },
    { label: `Confirm weights · ${inr(weighed.total, true)}`, hint: 'The customer sees these weights on their phone', go: () => run(() => update({ scrapItems: weighed.items.map((i: any) => ({ category: i.category, weight: i.actual })) })), disabled: !weighed.valid },
    { label: `Pay ${inr(amount, true)} now`, hint: 'Money reaches the customer’s Scraptox wallet instantly', go: pay },
    { label: 'Complete pickup', hint: 'The customer will be asked to rate you', go: () => run(() => update({ status: 'completed' })) },
    { label: 'Back to dashboard', hint: '', go: () => navigation.navigate('Main', { screen: 'Home' }) },
  ][step];

  const lat = o.pickupAddress?.coordinates?.lat || 28.6139;
  const lng = o.pickupAddress?.coordinates?.lng || 77.2090;
  const openMaps = () => {
    const dest = (lat && lng && (lat !== 28.6139 || lng !== 77.2090))
      ? `${lat},${lng}`
      : encodeURIComponent(`${o.pickupAddress?.street || ''}, ${o.pickupAddress?.city || ''}`);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`);
  };
  const done = step === 4;

  return (
    <Screen>
      {focused ? <StatusBar barStyle="light-content" /> : null}
      <View style={{ backgroundColor: colors.deep, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton light onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={12} w="semibold" color={colors.green200} raw>{`Pickup #${o.orderNo}`}</T>
              {o.orderNo?.startsWith('ML-') ? <Tag tone="primary" label="META LEAD" /> : null}
            </View>
            <T size={18} w="extrabold" color={colors.white} numberOfLines={1}>{done ? 'Pickup complete' : ['Go to pickup', 'Weigh the scrap', 'Pay the customer', 'Complete the pickup'][step]}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEP_LABEL.map((l, i) => {
            const reached = i <= Math.min(step, 3) || done;
            return (
              <View key={l} style={{ flex: 1, gap: 6 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: reached ? colors.green400 : '#2E6B4B' }} />
                <T size={11} w={i === step ? 'extrabold' : 'semibold'} color={reached ? colors.white : '#7FB394'}>{l}</T>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={false} onRefresh={q.reload} colors={[colors.primary]} />}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {step === 0 ? (
            <View style={{ height: 150 }}>
              <MapView provider={PROVIDER_GOOGLE} userInterfaceStyle="light" style={{ flex: 1 }} region={{ latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }} toolbarEnabled={false} scrollEnabled={false} zoomEnabled={false}>
                <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor={colors.deep} />
              </MapView>
              <Pressable onPress={openMaps} accessibilityRole="button" style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.deep, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, elevation: 4 }}>
                <Navigation size={16} color={colors.white} />
                <T size={13} w="extrabold" color={colors.white}>Navigate</T>
              </Pressable>
            </View>
          ) : null}
          <View style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Initials name={o.user.name} size={46} />
              <View style={{ flex: 1 }}>
                <T size={15} w="extrabold">{o.user.name}</T>
                <T size={12} color={colors.muted} raw>{`+91 ${phoneLabel(o.user.phone)}`}</T>
              </View>
              {!done ? (
                <>
                  <IconButton label="Chat" onPress={() => navigation.navigate('ChatThread', { orderId: o._id, name: o.user.name })}>
                    <MessageCircle size={19} color={colors.primary} />
                  </IconButton>
                  <IconButton label="Call" tone="primary" onPress={() => Linking.openURL(`tel:${o.user.phone}`)}>
                    <Phone size={19} color={colors.white} />
                  </IconButton>
                </>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <MapPin size={15} color={colors.muted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <T size={13} color={colors.ink2} lh={18}>{`${o.pickupAddress.street}, ${o.pickupAddress.city}`}</T>
                {o.pickupAddress.landmark ? <T size={12} color={colors.muted}>{o.pickupAddress.landmark}</T> : null}
              </View>
            </View>
            {o.pickupSlot ? <T size={12} w="bold" color={colors.deep} raw>{`Slot: ${o.pickupSlot.dayLabel}, ${o.pickupSlot.time}`}</T> : null}
            {o.notes ? <T size={12} color={colors.muted}>{`“${o.notes}”`}</T> : null}
          </View>
        </Card>

        <Card style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Scale size={18} color={colors.deep} />
            <T size={15} w="extrabold" style={{ flex: 1 }}>{step >= 2 ? 'Weighed at the door' : 'Items'}</T>
            <T size={11} w="semibold" color={colors.muted}>{step === 1 ? 'Customer est. → Actual' : step >= 2 ? 'Est. → Actual' : 'Customer estimate'}</T>
          </View>
          {(step === 1 ? weighed.items : o.scrapItems).map((i: any) => {
            const unit = categoryMeta(i.category).unit;
            return (
              <View key={i.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
                <Image source={categoryMeta(i.category).image} style={{ width: 36, height: 36, borderRadius: 10 }} />
                <View style={{ flex: 1 }}>
                  <T size={14} w="bold">{i.category}</T>
                  <T size={12} color={colors.muted} raw>{`${inr(i.rate)}/${unit}`}</T>
                </View>
                {step === 1 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={12} color={colors.muted} raw>{`${i.estimatedWeight ?? i.weight} →`}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, borderWidth: 1.5, borderColor: Number(weights[i.category]) > 0 ? colors.deep : colors.red, borderRadius: 10, paddingHorizontal: 8, minWidth: 82 }}>
                      <TextInput
                        value={weights[i.category] ?? ''}
                        onChangeText={(v) => setWeights((w) => ({ ...w, [i.category]: v.replace(unit === 'pc' ? /\D/g : /[^\d.]/g, '').slice(0, 6) }))}
                        keyboardType={unit === 'pc' ? 'number-pad' : 'decimal-pad'}
                        accessibilityLabel={`Actual ${unit === 'pc' ? 'count' : 'weight'} of ${i.category}`}
                        style={{ flex: 1, fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 15, color: colors.ink, paddingVertical: 0, textAlign: 'right' }}
                      />
                      <T size={12} w="bold" color={colors.muted} style={{ marginLeft: 4 }} raw>{unit === 'pc' ? 'pc' : 'kg'}</T>
                    </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'flex-end' }}>
                    <T size={14} w="extrabold" raw>{unit === 'pc' ? `${i.weight} pc` : qty(i.weight)}</T>
                    {i.estimatedWeight != null && i.estimatedWeight !== i.weight ? <T size={11} color={colors.muted} raw>{`est. ${unit === 'pc' ? i.estimatedWeight : qty(i.estimatedWeight)}`}</T> : null}
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <T size={14} w="bold">{step >= 3 ? 'Paid to customer' : step === 2 ? 'Pay customer' : step === 1 ? 'New total' : 'Estimated value'}</T>
            <T size={20} w="extrabold" color={colors.deep} raw>{inr(step === 1 ? weighed.total : o.paidAmount ?? o.totalAmount, true)}</T>
          </View>
        </Card>

        {step === 2 ? (
          <Card style={{ gap: 10 }}>
            <T size={15} w="extrabold">Pay from</T>
            <Pressable onPress={() => setMethod('wallet')} disabled={balance < amount} accessibilityRole="radio" accessibilityState={{ checked: method === 'wallet', disabled: balance < amount }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: method === 'wallet' ? 1.5 : 1, borderColor: method === 'wallet' ? colors.deep : colors.line, backgroundColor: method === 'wallet' ? colors.green50 : colors.white, opacity: balance < amount ? 0.6 : 1 }}>
              <RadioDot on={method === 'wallet'} color={colors.deep} />
              <Wallet size={20} color={colors.deep} />
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">Partner wallet</T>
                <T size={12} color={balance < amount ? colors.red : colors.muted} raw>{balance < amount ? `${inr(balance, true)} · not enough` : `${inr(balance, true)} available`}</T>
              </View>
            </Pressable>
            <Pressable onPress={() => setMethod('razorpay')} accessibilityRole="radio" accessibilityState={{ checked: method === 'razorpay' }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: method === 'razorpay' ? 1.5 : 1, borderColor: method === 'razorpay' ? colors.deep : colors.line, backgroundColor: method === 'razorpay' ? colors.green50 : colors.white }}>
              <RadioDot on={method === 'razorpay'} color={colors.deep} />
              <View style={{ width: 20, alignItems: 'center' }}><T size={13} w="extrabold" color={colors.blueText} raw>₹</T></View>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">Top up with Razorpay & pay</T>
                <T size={12} color={colors.muted}>UPI, cards or net banking</T>
              </View>
            </Pressable>
            {method === 'razorpay' ? <DemoNote text="Demo build: no real payment is taken." /> : null}
          </Card>
        ) : null}

        {done ? (
          <Card tone="green" style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CircleCheck size={20} color={colors.deep} />
              <T size={15} w="extrabold" color={colors.deep}>Completed</T>
            </View>
            <InfoRow label="Completed" value={whenLabel(o.completedDate)} />
            <InfoRow label="Paid" value={inr(o.paidAmount ?? o.totalAmount, true)} />
            <InfoRow label="Weight" value={qty(o.totalWeight)} />
          </Card>
        ) : null}
      </ScrollView>

      <BottomBar>
        {cta.hint ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, justifyContent: 'center' }}>
            <Check size={13} color={colors.muted} />
            <T size={12} color={colors.muted}>{cta.hint}</T>
          </View>
        ) : null}
        <Button variant={step === 2 ? 'primary' : 'deep'} label={cta.label} loading={busy} disabled={cta.disabled} onPress={cta.go} />
      </BottomBar>
    </Screen>
  );
}
