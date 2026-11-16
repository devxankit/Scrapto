/**
 * Cleaning services: the web app's ServiceBookingFlow (details → address →
 * schedule → confirm). On the backend the cleaning_service order type is
 * still switched off; the mock accepts it so the flow can be reviewed.
 */
import React, { useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, DemoNote, Field, Screen, Tag } from '../components/ui';
import { AddressCard } from './sell';
import { colors, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { api } from '../api/client';
import { CLEANING_SERVICES, SLOT_TIMES } from '../data/catalog';
import { nextDays } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

export function CleaningScreen({ navigation }: P<'Cleaning'>) {
  return (
    <Screen>
      <AppBar title="Cleaning services" subtitle="By Scraptox verified teams" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card tone="green" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <ShieldCheck size={20} color={colors.primary} />
          <T size={13} color={colors.deep} style={{ flex: 1 }} lh={18}>We clear the space and buy any scrap we find, so the cleaning often pays for itself.</T>
        </Card>
        {CLEANING_SERVICES.map((s) => (
          <Pressable key={s.id} onPress={() => navigation.navigate('CleaningBook', { serviceId: s.id })} accessibilityRole="button" style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
            <Image source={s.image} style={{ width: '100%', height: 120 }} resizeMode="cover" />
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T size={15} w="extrabold">{s.name}</T>
                <T size={12} color={colors.muted}>{s.hint}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Tag tone="gold" label="Quote on visit" />
                <ArrowRight size={18} color={colors.primary} />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const SIZES = ['1 BHK', '2 BHK', '3 BHK', '4 BHK+', 'Office / shop'];

export function CleaningBookScreen({ navigation, route }: P<'CleaningBook'>) {
  const svc = CLEANING_SERVICES.find((s) => s.id === route.params.serviceId)!;
  const { addresses } = useStore();
  const days = useMemo(() => nextDays(7).slice(1), []);
  const [size, setSize] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [addrId, setAddrId] = useState(addresses.find((a) => a.isDefault)?._id ?? addresses[0]?._id);
  const [day, setDay] = useState(days[0].key);
  const [time, setTime] = useState(SLOT_TIMES[0]);
  const [busy, setBusy] = useState(false);
  const addr = addresses.find((a) => a._id === addrId);

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
      navigation.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'SellSuccess', params: { orderId: r.data.order._id, orderNo: r.data.order.orderNo, later: true } }] }));
    } catch (e: any) {
      Alert.alert('Could not book', e.message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppBar title={svc.name} subtitle="Book a visit" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}>
          <T size={15} w="extrabold">Size of the space</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SIZES.map((s) => <Chip key={s} label={s} active={size === s} onPress={() => setSize(s)} />)}
          </View>
        </View>
        <Field label="Anything we should know? (optional)" value={notes} onChangeText={setNotes} multiline placeholder="E.g. two bathrooms, balcony full of old furniture" />
        <View style={{ gap: 10 }}>
          <T size={15} w="extrabold">Address</T>
          {addresses.map((a) => <AddressCard key={a._id} a={a} on={a._id === addrId} onPress={() => setAddrId(a._id)} />)}
          <T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('AddressForm')}>+ Add a new address</T>
        </View>
        <View style={{ gap: 10 }}>
          <T size={15} w="extrabold">Visit time</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {days.map((d) => {
              const on = d.key === day;
              return (
                <Pressable key={d.key} onPress={() => setDay(d.key)} style={{ width: 58, paddingVertical: 8, borderRadius: 12, alignItems: 'center', gap: 2, backgroundColor: on ? colors.primary : colors.white, borderWidth: on ? 0 : 1, borderColor: colors.lineStrong }}>
                  <T size={11} w="semibold" color={on ? colors.green100 : colors.muted}>{d.day}</T>
                  <T size={17} w="extrabold" color={on ? colors.white : colors.ink} raw>{String(d.date)}</T>
                  <T size={10} w="semibold" color={on ? colors.green100 : colors.muted}>{d.month}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SLOT_TIMES.map((t) => <Chip key={t} label={t} active={time === t} onPress={() => setTime(t)} />)}
          </View>
        </View>
        <Card style={{ gap: 8 }}>
          {['A supervisor visits and confirms the price before any work starts', 'Pay only after the job, by UPI or wallet', 'Scrap we find is bought at today’s rates'].map((s) => (
            <View key={s} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Check size={16} color={colors.primary} strokeWidth={3} style={{ marginTop: 2 }} />
              <T size={13} color={colors.ink2} style={{ flex: 1 }} lh={18}>{s}</T>
            </View>
          ))}
        </Card>
        <DemoNote text="Prices are quoted on the visit. [PRICE LIST TO BE PROVIDED]" />
      </ScrollView>
      <BottomBar>
        <Button label="Book visit" disabled={!size || !addr} loading={busy} onPress={book} />
      </BottomBar>
    </Screen>
  );
}
