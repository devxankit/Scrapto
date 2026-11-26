/**
 * Sell flow, same steps as the web app (AddScrapFlow):
 * 1 categories → 2 photos → 3 weight → 4 address → 5 confirm & schedule.
 * The draft lives in the store, so backing out keeps what was entered; only
 * Confirm creates the order (POST /orders).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { Camera, Check, CircleCheck, Clock, ImagePlus, LocateFixed, MapPin, Pencil, Plus, Trash2, Zap } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, DemoNote, Divider, InfoRow, RadioDot, Screen, Steps, Stepper } from '../components/ui';
import { CategoryPick, IconBadge, Price, unitOf } from '../components/brand';
import { colors, family, FamilyKey, radius } from '../theme';
import { Address, useStore } from '../store/AppStore';
import { api, uploadImages } from '../api/client';
import { categoryMeta, images, SLOT_TIMES } from '../data/catalog';
import { inr, nextDays, qty } from '../utils/format';
import { pickPhotos, takePhoto } from '../utils/media';
import { askLocationPermission, currentPosition, reverseGeocode, DEMO_POINT } from '../utils/location';
import { Alert } from '../i18n/Alert';
import { clearQueryCache } from '../hooks/useQuery';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

const MAX_PHOTOS = 6;

function useEstimate() {
  const { draft, prices } = useStore();
  return useMemo(() => {
    const lines = Object.entries(draft.items)
      .map(([cat, w]) => {
        const p = prices.find((x) => x.category === cat);
        return p ? { cat, w, p, unit: unitOf(p), total: w * p.pricePerKg } : null;
      })
      .filter(Boolean) as { cat: string; w: number; p: Price; unit: 'kg' | 'pc'; total: number }[];
    return { lines, total: lines.reduce((n, l) => n + l.total, 0) };
  }, [draft.items, prices]);
}

function Header({ step, title }: { step: number; title: string }) {
  return (
    <AppBar title={title} subtitle={`Step ${step} of 5`}>
      <Steps total={5} current={step} />
    </AppBar>
  );
}

/* ------------------------------------------------------------ 1 Category */

const FAMS: (FamilyKey | 'all')[] = ['all', 'metals', 'paper', 'plastic', 'ewaste', 'appliances', 'vehicles', 'other'];

export function SellCategoryScreen({ navigation, route }: P<'SellCategory'>) {
  const { prices, draft, setDraft, resetDraft } = useStore();
  const { width } = useWindowDimensions();
  const col = Math.floor((width - 32 - 10) / 2);
  const [fam, setFam] = useState<FamilyKey | 'all'>('all');
  const preselect = route.params?.preselect;

  useEffect(() => {
    if (preselect && !(preselect in draft.items)) {
      if (Object.keys(draft.items).length === 0) resetDraft(preselect);
      else setDraft((d) => ({ ...d, items: { ...d.items, [preselect]: 0 } }));
    }
  }, [preselect]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = prices.filter((p) => fam === 'all' || categoryMeta(p.category).family === fam);
  const n = Object.keys(draft.items).length;
  const toggle = (cat: string) =>
    setDraft((d) => {
      const items = { ...d.items };
      if (cat in items) delete items[cat];
      else items[cat] = 0;
      return { ...d, items };
    });

  return (
    <Screen>
      <Header step={1} title="What are you selling?" />
      <View style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 10 }}>
          {FAMS.map((f) => <Chip key={f} dark label={f === 'all' ? 'All' : family[f].label} active={fam === f} onPress={() => setFam(f)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((p) => (
          <View key={p._id} style={{ width: col }}>
            <CategoryPick price={p} on={p.category in draft.items} onPress={() => toggle(p.category)} />
          </View>
        ))}
      </ScrollView>
      <BottomBar style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <T size={12} w="semibold" color={colors.muted}>{n === 1 ? '1 item selected' : `${n} items selected`}</T>
          <T size={15} w="extrabold">Rates locked for today</T>
        </View>
        <Button label="Continue" full={false} disabled={!n} onPress={() => navigation.navigate('SellPhotos')} style={{ paddingHorizontal: 26 }} />
      </BottomBar>
    </Screen>
  );
}

/* -------------------------------------------------------------- 2 Photos */

export function SellPhotosScreen({ navigation }: P<'SellPhotos'>) {
  const { draft, setDraft } = useStore();
  const { width } = useWindowDimensions();
  const size = (width - 32 - 20) / 3;
  const add = async (from: 'camera' | 'gallery') => {
    try {
      const got = from === 'camera' ? [await takePhoto()].filter(Boolean) : await pickPhotos(MAX_PHOTOS - draft.photos.length);
      if (got.length) setDraft((d) => ({ ...d, photos: [...d.photos, ...(got as any[])].slice(0, MAX_PHOTOS) }));
    } catch (e: any) {
      Alert.alert('Could not add the photo', e.message);
    }
  };
  const full = draft.photos.length >= MAX_PHOTOS;
  return (
    <Screen>
      <Header step={2} title="Add photos" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Image source={images.stepPhotos} style={{ width: 64, height: 64, borderRadius: 12 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <T size={14} w="extrabold">Clear photos get faster pickups</T>
            <T size={12} color={colors.muted} lh={17}>Show all items in daylight. Collectors use them to bring the right vehicle.</T>
          </View>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {draft.photos.map((ph, i) => (
            <View key={ph.uri + i} style={{ width: size, height: size }}>
              <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%', borderRadius: 12, backgroundColor: colors.line }} />
              <Pressable onPress={() => setDraft((d) => ({ ...d, photos: d.photos.filter((_, j) => j !== i) }))} accessibilityLabel="Remove photo" hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(28,33,30,0.75)', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {!full ? (
            <Pressable onPress={() => add('gallery')} accessibilityRole="button" accessibilityLabel="Add from gallery" style={{ width: size, height: size, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green200, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <ImagePlus size={24} color={colors.primary} />
              <T size={11} w="bold" color={colors.primary}>{`${draft.photos.length}/${MAX_PHOTOS}`}</T>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Take photo" variant="outline" size="md" disabled={full} icon={<Camera size={18} color={full ? colors.disabledText : colors.primary} />} onPress={() => add('camera')} style={{ flex: 1 }} />
          <Button label="Gallery" variant="outline" size="md" disabled={full} icon={<ImagePlus size={18} color={full ? colors.disabledText : colors.primary} />} onPress={() => add('gallery')} style={{ flex: 1 }} />
        </View>
      </ScrollView>
      <BottomBar style={{ gap: 8 }}>
        <Button label={draft.photos.length ? 'Continue' : 'Skip photos'} variant={draft.photos.length ? 'primary' : 'outline'} onPress={() => navigation.navigate('SellWeight')} />
      </BottomBar>
    </Screen>
  );
}

/* -------------------------------------------------------------- 3 Weight */

export function SellWeightScreen({ navigation }: P<'SellWeight'>) {
  const { draft, setDraft, prices } = useStore();
  const est = useEstimate();

  // Fill a sensible starting weight the first time.
  useEffect(() => {
    setDraft((d) => {
      const items = { ...d.items };
      let changed = false;
      for (const [cat, w] of Object.entries(items)) {
        if (!w) {
          const p = prices.find((x) => x.category === cat);
          items[cat] = p && unitOf(p) === 'pc' ? 1 : 5;
          changed = true;
        }
      }
      return changed ? { ...d, items } : d;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (cat: string, v: number) => setDraft((d) => ({ ...d, items: { ...d.items, [cat]: Math.max(0, Math.round(v * 10) / 10) } }));
  const valid = est.lines.length > 0 && est.lines.every((l) => l.w > 0);

  return (
    <Screen>
      <Header step={3} title="How much do you have?" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <T size={13} color={colors.muted} lh={18}>A rough guess is fine. The collector weighs everything on a digital scale at your door.</T>
        {est.lines.map((l) => {
          const meta = categoryMeta(l.cat);
          const step = l.unit === 'pc' ? 1 : l.w < 10 ? 1 : 5;
          return (
            <Card key={l.cat} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={meta.image} style={{ width: 48, height: 48, borderRadius: 10 }} />
                <View style={{ flex: 1 }}>
                  <T size={15} w="bold">{l.cat}</T>
                  <T size={12} color={colors.muted} raw numberOfLines={1}>{`${inr(l.p.pricePerKg)}/${l.unit} · ≈ ${inr(l.total)}`}</T>
                </View>
                <Stepper label={l.cat} value={qty(l.w, l.unit)} disabledDec={l.w <= (l.unit === 'pc' ? 1 : 1)} onDec={() => set(l.cat, l.w - step)} onInc={() => set(l.cat, l.w + step)} />
              </View>
              {l.unit === 'kg' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[5, 10, 25, 50].map((v) => <Chip key={v} label={`${v} kg`} active={l.w === v} onPress={() => set(l.cat, v)} />)}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
      <BottomBar style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <T size={12} w="semibold" color={colors.muted}>Estimated value</T>
          <T size={22} w="extrabold" color={colors.deep} raw>{inr(est.total)}</T>
        </View>
        <Button label="Continue" full={false} disabled={!valid} onPress={() => navigation.navigate('SellAddress')} style={{ paddingHorizontal: 26 }} />
      </BottomBar>
    </Screen>
  );
}

/* ------------------------------------------------------------- 4 Address */

export function SellAddressScreen({ navigation }: P<'SellAddress'>) {
  const { addresses, draft, setDraft, saveAddress, loadAddresses } = useStore();
  useEffect(() => {
    if (!addresses.length) loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [locating, setLocating] = useState(false);
  const chosen = draft.address ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  useEffect(() => {
    if (!draft.address && chosen) setDraft((d) => ({ ...d, address: chosen }));
  }, [chosen?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const useCurrent = async () => {
    setLocating(true);
    try {
      const okPerm = await askLocationPermission();
      const pos = okPerm ? await currentPosition().catch(() => DEMO_POINT) : DEMO_POINT;
      const place = await reverseGeocode(pos);
      const a = await saveAddress({ type: 'other', label: 'Current location', street: place?.street || `Pinned location (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`, city: place?.city || '', state: place?.state, pincode: place?.pincode, coordinates: pos, isDefault: false });
      setDraft((d) => ({ ...d, address: a }));
    } catch (e: any) {
      Alert.alert('Could not get your location', e.message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <Screen>
      <Header step={4} title="Pickup address" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <Button label={locating ? 'Finding you…' : 'Use my current location'} variant="tonal" size="md" loading={locating} icon={<LocateFixed size={18} color={colors.deep} />} onPress={useCurrent} />
        {addresses.map((a) => (
          <AddressCard key={a._id} a={a} on={chosen?._id === a._id} onPress={() => setDraft((d) => ({ ...d, address: a }))} onEdit={() => navigation.navigate('AddressForm', { id: a._id, pick: true })} />
        ))}
        <Pressable onPress={() => navigation.navigate('AddressForm', { pick: true })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green200 }}>
          <Plus size={18} color={colors.primary} strokeWidth={2.6} />
          <T size={14} w="bold" color={colors.primary}>Add a new address</T>
        </Pressable>
      </ScrollView>
      <BottomBar>
        <Button label="Continue" disabled={!chosen} onPress={() => navigation.navigate('SellConfirm')} />
      </BottomBar>
    </Screen>
  );
}

export function AddressCard({ a, on, onPress, onEdit }: { a: Address; on?: boolean; onPress?: () => void; onEdit?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!on }} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: on ? colors.green50 : colors.white, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }}>
      {onPress ? <View style={{ paddingTop: 2 }}><RadioDot on={!!on} /></View> : null}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={14} w="extrabold">{a.label}</T>
          {a.isDefault ? <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.bg }}><T size={10} w="extrabold" color={colors.muted}>DEFAULT</T></View> : null}
        </View>
        <T size={13} color={colors.ink2} lh={18}>{[a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')}</T>
      </View>
      {onEdit ? (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel={`Edit ${a.label}`} style={{ padding: 4 }}>
          <Pencil size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- 5 Confirm */

export function SellConfirmScreen({ navigation }: P<'SellConfirm'>) {
  const { draft, setDraft, resetDraft } = useStore();
  const est = useEstimate();
  const days = useMemo(() => nextDays(7), []);
  const [busy, setBusy] = useState(false);
  const slot = draft.slot;
  const a = draft.address;
  const hour = new Date().getHours();
  const todaySlots = SLOT_TIMES.filter((s) => {
    const from = s.split('–')[0];
    const start = parseInt(from, 10) + (from.includes('PM') && !from.trim().startsWith('12') ? 12 : 0);
    return start > hour + 1;
  });

  const later = slot.mode === 'later' ? slot : null;
  const timesFor = later?.date === days[0].key ? todaySlots : SLOT_TIMES;

  const confirm = async () => {
    if (!a) return;
    setBusy(true);
    try {
      let imgs: { url: string; publicId: string }[] = [];
      if (draft.photos.length) imgs = (await uploadImages('/uploads/order-images', draft.photos)).data.files;
      const body = {
        scrapItems: est.lines.map((l) => ({ category: l.cat, weight: l.w, rate: l.p.pricePerKg })),
        pickupAddress: { street: [a.street, a.landmark].filter(Boolean).join(', '), city: a.city, state: a.state, pincode: a.pincode, coordinates: a.coordinates },
        preferredTime: slot.mode === 'now' ? 'now' : 'later',
        pickupSlot: later ? { dayName: later.dayLabel, date: later.date, slot: later.time, timestamp: Date.parse(later.date) } : null,
        images: imgs,
        notes: draft.notes.trim(),
      };
      const r = await api('/orders', { method: 'POST', body });
      const order = r.data.order;
      clearQueryCache();
      resetDraft();
      navigation.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'SellSuccess', params: { orderId: order._id, orderNo: order.orderNo, later: slot.mode === 'later' } }] }));
    } catch (e: any) {
      Alert.alert('Could not book the pickup', e.message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header step={5} title="Review & schedule" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
        <Card style={{ paddingVertical: 4 }}>
          {est.lines.map((l, i) => (
            <View key={l.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === est.lines.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
              <Image source={categoryMeta(l.cat).image} style={{ width: 40, height: 40, borderRadius: 10 }} />
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">{l.cat}</T>
                <T size={12} color={colors.muted} raw>{`${qty(l.w, l.unit)} × ${inr(l.p.pricePerKg)}/${l.unit}`}</T>
              </View>
              <T size={14} w="extrabold" raw>{inr(l.total)}</T>
            </View>
          ))}
          <Pressable onPress={() => navigation.navigate('SellWeight')} style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
            <Camera size={14} color={colors.muted} />
            <T size={12} color={colors.muted}>{`${draft.photos.length} photos · `}</T>
            <T size={12} w="bold" color={colors.primary}>Edit items</T>
          </Pressable>
        </Card>

        {a ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge><MapPin size={18} color={colors.brand} fill={colors.green100} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={14} w="bold">{a.label}</T>
              <T size={12} color={colors.muted} numberOfLines={1}>{[a.street, a.city].filter(Boolean).join(', ')}</T>
            </View>
            <T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('SellAddress')}>Change</T>
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <T size={15} w="extrabold">Pickup time</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SlotMode on={slot.mode === 'now'} Icon={Zap} title="Right now" sub="Within 2 hours" onPress={() => setDraft((d) => ({ ...d, slot: { mode: 'now' } }))} />
            <SlotMode on={slot.mode === 'later'} Icon={Clock} title="Schedule" sub="Pick a day & time" onPress={() => setDraft((d) => ({ ...d, slot: { mode: 'later', date: days[todaySlots.length ? 0 : 1].key, dayLabel: days[todaySlots.length ? 0 : 1].label, time: (todaySlots.length ? todaySlots : SLOT_TIMES)[0] } }))} />
          </View>
          {later ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d, i) => {
                  const on = later.date === d.key;
                  const disabled = i === 0 && !todaySlots.length;
                  return (
                    <Pressable key={d.key} disabled={disabled} onPress={() => setDraft((x) => ({ ...x, slot: { mode: 'later', date: d.key, dayLabel: d.label, time: (i === 0 ? todaySlots : SLOT_TIMES).includes(later.time) ? later.time : (i === 0 ? todaySlots : SLOT_TIMES)[0] } }))} style={{ width: 58, paddingVertical: 8, borderRadius: 12, alignItems: 'center', gap: 2, backgroundColor: on ? colors.primary : colors.white, borderWidth: on ? 0 : 1, borderColor: colors.lineStrong, opacity: disabled ? 0.4 : 1 }}>
                      <T size={11} w="semibold" color={on ? colors.green100 : colors.muted}>{d.day}</T>
                      <T size={17} w="extrabold" color={on ? colors.white : colors.ink} raw>{String(d.date)}</T>
                      <T size={10} w="semibold" color={on ? colors.green100 : colors.muted}>{d.month}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {timesFor.map((t) => <Chip key={t} label={t} active={later.time === t} onPress={() => setDraft((x) => ({ ...x, slot: { ...later, time: t } }))} />)}
              </View>
            </>
          ) : null}
        </Card>

        <Card style={{ gap: 8 }}>
          <T size={14} w="bold">Note for the collector (optional)</T>
          <TextInput
            value={draft.notes}
            onChangeText={(v) => setDraft((d) => ({ ...d, notes: v.slice(0, 300) }))}
            placeholder="E.g. Ring the bell twice. Items are on the terrace."
            placeholderTextColor={colors.faint}
            multiline
            style={{ minHeight: 70, textAlignVertical: 'top', fontFamily: 'PlusJakartaSans-Medium', fontSize: 14, color: colors.ink, backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 }}
          />
        </Card>

        <Card style={{ gap: 8 }}>
          <InfoRow label="Estimated value" value={inr(est.total)} />
          <InfoRow label="Pickup charge" value="FREE" valueColor={colors.primary} />
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={14} w="bold">You get (approx.)</T>
            <T size={22} w="extrabold" color={colors.deep} raw>{inr(est.total)}</T>
          </View>
          <T size={11} color={colors.muted}>Final amount is set after digital weighing at your door.</T>
        </Card>
        <DemoNote text="Demo build: a sample collector accepts in a few seconds." />
      </ScrollView>
      <BottomBar>
        <Button label={`Confirm pickup · ${inr(est.total)}`} loading={busy} disabled={!a || !est.lines.length} onPress={confirm} />
      </BottomBar>
    </Screen>
  );
}

function SlotMode({ on, Icon, title, sub, onPress }: { on: boolean; Icon: typeof Zap; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ flex: 1, padding: 12, borderRadius: radius.md, gap: 6, backgroundColor: on ? colors.green50 : colors.white, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Icon size={18} color={on ? colors.primary : colors.muted} />
        <RadioDot on={on} />
      </View>
      <T size={14} w="extrabold">{title}</T>
      <T size={12} color={colors.muted}>{sub}</T>
    </Pressable>
  );
}

/* --------------------------------------------------------------- Success */

export function SellSuccessScreen({ navigation, route }: P<'SellSuccess'>) {
  const { orderId, orderNo, later, cleaning } = route.params;
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, padding: 24, justifyContent: 'center', gap: 24 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={44} color={colors.white} strokeWidth={3.2} />
          </View>
        </View>
        <T size={24} w="extrabold" center>{cleaning ? 'Visit booked' : later ? 'Pickup scheduled' : 'Pickup requested'}</T>
        <T size={14} color={colors.muted} center lh={20}>{cleaning ? 'A verified cleaning partner will confirm your slot. They share the price after inspecting, and you pay securely in the app.' : later ? 'A verified collector will confirm your slot shortly. We will remind you before they arrive.' : 'We are matching you with a verified collector nearby. You can track them live.'}</T>
        <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.bg }}>
          <T size={13} w="bold" raw>{`Order #${orderNo}`}</T>
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Button label={cleaning ? 'View booking' : later ? 'View pickup' : 'Track pickup'} icon={<CircleCheck size={18} color={colors.white} />} onPress={() => navigation.replace('Order', { id: orderId })} />
        <Button label="Back to home" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}
