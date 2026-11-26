/**
 * Cleaning services: pick a service -> details, address and visit time ->
 * book. A partner inspects and shares the price in the app; the user then pays
 * online (Razorpay through the wallet) from the order screen.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { ArrowRight, Building, Car, Check, CreditCard, Droplets, House, ShieldCheck, Sofa, Sparkles, Sun, Truck, Warehouse } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, Field, Screen } from '../components/ui';
import { AddressCard } from './sell';
import { colors, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { api } from '../api/client';
import { CLEANING_SERVICES, SLOT_TIMES, type CleaningIcon, type CleaningService } from '../data/catalog';
import { nextDays } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

const ICONS: Record<CleaningIcon, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  house: House,
  car: Car,
  droplets: Droplets,
  sofa: Sofa,
  sun: Sun,
  building: Building,
  warehouse: Warehouse,
  truck: Truck,
};

/** Square icon tile for a cleaning service (lists, order cards). */
export function CleaningTile({ svc, size = 44 }: { svc?: CleaningService; size?: number }) {
  const Icon = svc ? ICONS[svc.icon] : Sparkles;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: svc?.tint ?? colors.green50, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color={svc?.accent ?? colors.deep} strokeWidth={2} />
    </View>
  );
}

const STEPS = ['Book a visit', 'Partner shares the price', 'Pay online in the app'];

export function CleaningScreen({ navigation }: P<'Cleaning'>) {
  const featured = CLEANING_SERVICES.slice(0, 5);
  const more = CLEANING_SERVICES.slice(5);
  const row = (s: CleaningService) => (
    <Pressable
      key={s.id}
      onPress={() => navigation.navigate('CleaningBook', { serviceId: s.id })}
      accessibilityRole="button"
      accessibilityLabel={s.name}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }}
    >
      <CleaningTile svc={s} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14} w="extrabold">{s.name}</T>
        <T size={12} color={colors.muted} numberOfLines={1}>{s.hint}</T>
      </View>
      <ArrowRight size={18} color={colors.primary} />
    </Pressable>
  );

  return (
    <Screen>
      <AppBar title="Cleaning services" subtitle="By Scraptox verified teams" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        {/* Dark hero: how pricing and payment work */}
        <View style={{ backgroundColor: colors.night, borderRadius: radius.xl, padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.night2, alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} color={colors.green200} />
            </View>
            <View style={{ flex: 1 }}>
              <T size={15} w="extrabold" color={colors.white}>Professional cleaning at your door</T>
              <T size={12} color={colors.nightText}>Fair price after inspection · pay online securely</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {STEPS.map((step, i) => (
              <View key={step} style={{ flex: 1, backgroundColor: colors.night2, borderRadius: radius.md, padding: 8, gap: 4, borderWidth: 1, borderColor: colors.nightLine }}>
                <T size={11} w="extrabold" color={colors.green200} raw>{`0${i + 1}`}</T>
                <T size={11} w="semibold" color={colors.white} lh={14}>{step}</T>
              </View>
            ))}
          </View>
        </View>

        <T size={15} w="extrabold" style={{ marginTop: 4 }}>Popular services</T>
        {featured.map(row)}
        <T size={15} w="extrabold" style={{ marginTop: 4 }}>More services</T>
        {more.map(row)}

        <Card tone="green" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <ShieldCheck size={20} color={colors.primary} />
          <T size={13} color={colors.deep} style={{ flex: 1 }} lh={18}>We also buy any scrap we find while cleaning, so the job often pays for itself.</T>
        </Card>
      </ScrollView>
    </Screen>
  );
}

export function CleaningBookScreen({ navigation, route }: P<'CleaningBook'>) {
  const svc = CLEANING_SERVICES.find((s) => s.id === route.params.serviceId) ?? CLEANING_SERVICES[0];
  const { addresses, loadAddresses } = useStore();
  useEffect(() => {
    if (!addresses.length) loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const days = useMemo(() => nextDays(7).slice(1), []);
  const [size, setSize] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [addrId, setAddrId] = useState(addresses.find((a) => a.isDefault)?._id ?? addresses[0]?._id);
  const [day, setDay] = useState(days[0].key);
  const [time, setTime] = useState(SLOT_TIMES[0]);
  const [busy, setBusy] = useState(false);
  // Fall back to the default (or first) address, also when the list loads after this screen opened.
  const addr = addresses.find((a) => a._id === addrId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];

  const book = async () => {
    if (!addr || !size) return;
    setBusy(true);
    try {
      const d = days.find((x) => x.key === day)!;
      const r = await api('/orders', {
        method: 'POST',
        body: {
          orderType: 'cleaning_service',
          serviceDetails: { serviceType: svc.id, description: `${size}${notes.trim() ? ` · ${notes.trim()}` : ''}` },
          pickupAddress: { street: addr.street, city: addr.city, state: addr.state, pincode: addr.pincode, coordinates: addr.coordinates },
          preferredTime: 'later',
          pickupSlot: { dayName: d.label, date: d.key, slot: time, timestamp: Date.parse(d.key) },
        },
      });
      navigation.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'SellSuccess', params: { orderId: r.data.order._id, orderNo: r.data.order.orderNo, later: true, cleaning: true } }] }));
    } catch (e: any) {
      Alert.alert('Could not book', e.message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppBar title={svc.name} subtitle="Book an inspection visit" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: svc.tint }}>
          <CleaningTile svc={svc} size={48} />
          <View style={{ flex: 1 }}>
            <T size={15} w="extrabold" color={svc.accent}>{svc.name}</T>
            <T size={12} color={colors.ink2}>{svc.hint}</T>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <T size={15} w="extrabold">{svc.sizeLabel}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {svc.sizes.map((s) => <Chip key={s} label={s} active={size === s} onPress={() => setSize(s)} />)}
          </View>
        </View>
        <Field label="Anything we should know? (optional)" value={notes} onChangeText={setNotes} multiline placeholder="E.g. two bathrooms, stains on the sofa, tank on the roof" />
        <View style={{ gap: 8 }}>
          <T size={15} w="extrabold">Address</T>
          {addresses.map((a) => <AddressCard key={a._id} a={a} on={a._id === addr?._id} onPress={() => setAddrId(a._id)} />)}
          <T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('AddressForm')}>+ Add a new address</T>
        </View>
        <View style={{ gap: 8 }}>
          <T size={15} w="extrabold">Visit time</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const on = d.key === day;
              return (
                <Pressable key={d.key} onPress={() => setDay(d.key)} style={{ width: 58, paddingVertical: 8, borderRadius: 12, alignItems: 'center', gap: 2, backgroundColor: on ? colors.night : colors.white, borderWidth: on ? 0 : 1, borderColor: colors.lineStrong }}>
                  <T size={11} w="semibold" color={on ? colors.nightText : colors.muted}>{d.day}</T>
                  <T size={17} w="extrabold" color={on ? colors.white : colors.ink} raw>{String(d.date)}</T>
                  <T size={10} w="semibold" color={on ? colors.nightText : colors.muted}>{d.month}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SLOT_TIMES.map((t) => <Chip key={t} label={t} active={time === t} onPress={() => setTime(t)} />)}
          </View>
        </View>
        <View style={{ backgroundColor: colors.night, borderRadius: radius.lg, padding: 12, gap: 8 }}>
          {[
            'A partner inspects and shares the price in the app before work starts',
            'Pay online securely: UPI, cards, net banking or wallet',
            'Any scrap we find is bought at today’s rates',
          ].map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              {i === 1 ? <CreditCard size={16} color={colors.green200} style={{ marginTop: 2 }} /> : <Check size={16} color={colors.green200} strokeWidth={3} style={{ marginTop: 2 }} />}
              <T size={13} color={colors.white} style={{ flex: 1 }} lh={18}>{s}</T>
            </View>
          ))}
        </View>
      </ScrollView>
      <BottomBar>
        <Button label="Book visit" disabled={!size || !addr} loading={busy} onPress={book} />
      </BottomBar>
    </Screen>
  );
}
