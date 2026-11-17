import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, Share, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Bell, Briefcase, ChevronRight, CircleHelp, Copy, FileText, Gift, Globe, House, LifeBuoy, LocateFixed, LogOut, MapPin, MapPinned, RotateCcw, Share2, Sparkles, Star, Trophy, Users, Wallet } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, Avatar, BottomBar, Button, Card, Chip, DemoNote, EmptyState, Field, ListRow, Loading, Screen, Tag, Toggle } from '../components/ui';
import { IconBadge } from '../components/brand';
import { AddressCard } from './sell';
import { SettingsLanguagePicker } from './auth';
import { colors, radius } from '../theme';
import { Address, useStore } from '../store/AppStore';
import { api, USE_MOCK } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { HELP_TOPICS, LANGUAGES, images } from '../data/catalog';
import { dateLabel, inr, phoneLabel } from '../utils/format';
import { askLocationPermission, currentPosition, DEMO_POINT, reverseGeocode } from '../utils/location';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/* ---------------------------------------------------------------- Profile */

export function ProfileScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, lang, logout, resetDemo, addresses } = useStore();
  const orders = useQuery<{ orders: any[] }>('/orders/my-orders');
  const wallet = useQuery<any>('/wallet/profile');
  const notes = useQuery<{ notifications: any[] }>('/notifications');
  const done = (orders.data?.orders ?? []).filter((o) => o.status === 'completed');
  const kg = done.reduce((n, o) => n + (o.totalWeight ?? 0), 0);
  const unread = (notes.data?.notifications ?? []).filter((n) => !n.read).length;
  const langName = LANGUAGES.find((l) => l.id === (lang ?? 'en'))?.native ?? 'English';

  const menu: { label: string; meta?: string; Icon: typeof Bell; go: () => void }[] = [
    { label: 'Saved addresses', meta: String(addresses.length || ''), Icon: MapPin, go: () => nav.navigate('Addresses') },
    { label: 'Notifications', meta: unread ? `${unread} new` : '', Icon: Bell, go: () => nav.navigate('Notifications') },
    { label: 'Chats', Icon: Users, go: () => nav.navigate('Chats') },
    { label: 'My reviews', Icon: Star, go: () => nav.navigate('MyReviews') },
    { label: 'Cleaning services', meta: 'New', Icon: Sparkles, go: () => nav.navigate('Cleaning') },
    { label: 'Language', meta: langName, Icon: Globe, go: () => nav.navigate('SettingsLanguage') },
    { label: 'Help & support', Icon: LifeBuoy, go: () => nav.navigate('Help') },
    { label: 'Terms & privacy', Icon: FileText, go: () => nav.navigate('Legal', { kind: 'terms' }) },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar source={images.avatarUser} size={62} />
            <View style={{ flex: 1 }}>
              <T size={19} w="extrabold" numberOfLines={1}>{user?.name}</T>
              <T size={13} color={colors.muted} raw>{`+91 ${phoneLabel(user?.phone)}`}</T>
            </View>
            <Button label="Edit" variant="outline" size="sm" full={false} onPress={() => nav.navigate('EditProfile')} />
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 12 }}>
            <Stat value={String(done.length)} label="Pickups" />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Stat value={`${Math.round(kg)} kg`} label="Recycled" />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Pressable onPress={() => nav.navigate('Wallet')} style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityRole="button">
              <T size={17} w="extrabold" color={colors.deep} raw>{inr(wallet.data?.balance ?? 0)}</T>
              <T size={11} w="semibold" color={colors.muted}>Wallet ›</T>
            </Pressable>
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <Card tone="gold" onPress={() => nav.navigate('Main', { screen: 'Refer' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge tone="gold"><Gift size={18} color={colors.goldText} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold" color="#5C3B00">Invite friends, earn ₹50 each</T>
              <T size={12} color={colors.goldText} raw>{`Your code ${user?.referralCode ?? ''}`}</T>
            </View>
            <ChevronRight size={18} color={colors.goldText} />
          </Card>
          <Card style={{ paddingVertical: 0 }}>
            {menu.map((m, i) => (
              <ListRow key={m.label} title={m.label} meta={m.meta} last={i === menu.length - 1} onPress={m.go} icon={<m.Icon size={20} color={colors.primary} />} />
            ))}
          </Card>
          <Button
            label="Log out"
            variant="ghostDanger"
            icon={<LogOut size={18} color={colors.red} />}
            style={{ borderWidth: 0 }}
            onPress={() => Alert.alert('Log out?', 'You can log in again with your mobile number.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logout }])}
          />
          {USE_MOCK ? (
            <Pressable onPress={() => Alert.alert('Reset demo data?', 'This removes the demo account and all sample pickups on this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: resetDemo }])} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
              <RotateCcw size={14} color={colors.muted} />
              <T size={12} w="semibold" color={colors.muted}>Reset demo data</T>
            </Pressable>
          ) : null}
          <T size={11} color={colors.faint} center raw>Scraptox 1.0.0</T>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T size={17} w="extrabold" raw>{value}</T>
      <T size={11} w="semibold" color={colors.muted}>{label}</T>
    </View>
  );
}

export function EditProfileScreen({ navigation }: P<'EditProfile'>) {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  const emailOk = !email || /^\S+@\S+\.\S+$/.test(email);
  return (
    <Screen>
      <AppBar title="Edit profile" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Avatar source={images.avatarUser} size={88} />
        </View>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Please check the email address'} />
        <Field label="Mobile number" value={`+91 ${phoneLabel(user?.phone)}`} editable={false} hint="To change your number, contact support." />
      </ScrollView>
      <BottomBar>
        <Button
          label="Save"
          disabled={name.trim().length < 2 || !emailOk}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await updateProfile({ name: name.trim(), email: email.trim() });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not save', e.message);
              setBusy(false);
            }
          }}
        />
      </BottomBar>
    </Screen>
  );
}

/* -------------------------------------------------------------- Addresses */

export function AddressesScreen({ navigation }: P<'Addresses'>) {
  const { addresses, deleteAddress, saveAddress } = useStore();
  return (
    <Screen>
      <AppBar title="Saved addresses" />
      <FlatList
        data={addresses}
        keyExtractor={(a) => a._id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon={<MapPinned size={30} color={colors.primary} />} title="No saved addresses" text="Save your home or office to book pickups faster." />}
        renderItem={({ item }) => (
          <View style={{ gap: 0 }}>
            <AddressCard a={item} onEdit={() => navigation.navigate('AddressForm', { id: item._id })} />
            <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 6, paddingTop: 8 }}>
              {!item.isDefault ? <T size={12} w="bold" color={colors.primary} onPress={() => saveAddress({ ...item, isDefault: true })}>Make default</T> : null}
              <T size={12} w="bold" color={colors.red} onPress={() => Alert.alert('Delete this address?', item.street, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteAddress(item._id) }])}>Delete</T>
            </View>
          </View>
        )}
      />
      <BottomBar>
        <Button label="Add new address" onPress={() => navigation.navigate('AddressForm')} />
      </BottomBar>
    </Screen>
  );
}

export function AddressFormScreen({ navigation, route }: P<'AddressForm'>) {
  const { addresses, saveAddress, setDraft } = useStore();
  const editing = addresses.find((a) => a._id === route.params?.id);
  const [type, setType] = useState<Address['type']>(editing?.type ?? 'home');
  const [label, setLabel] = useState(editing?.label ?? 'Home');
  const [street, setStreet] = useState(editing?.street ?? '');
  const [landmark, setLandmark] = useState(editing?.landmark ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [state, setState] = useState(editing?.state ?? '');
  const [pincode, setPincode] = useState(editing?.pincode ?? '');
  const [coords, setCoords] = useState(editing?.coordinates ?? DEMO_POINT);
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? addresses.length === 0);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const fill = async (pos: { lat: number; lng: number }) => {
    setCoords(pos);
    const place = await reverseGeocode(pos);
    if (place) {
      if (!street) setStreet(place.street);
      setCity(place.city);
      setState(place.state);
      setPincode(place.pincode);
    }
  };
  const locate = async () => {
    setLocating(true);
    try {
      if (!(await askLocationPermission())) throw new Error('Location permission is off. Turn it on in Settings, or drag the pin.');
      await fill(await currentPosition());
    } catch (e: any) {
      Alert.alert('Could not get your location', e.message);
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => {
    if (!editing) locate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = street.trim().length > 5 && city.trim().length > 1 && (!pincode || /^\d{6}$/.test(pincode));
  return (
    <Screen>
      <AppBar title={editing ? 'Edit address' : 'New address'} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 180, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
          <MapView
            provider={PROVIDER_GOOGLE}
        userInterfaceStyle="light"
            style={{ flex: 1 }}
            region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
            toolbarEnabled={false}>
            <Marker draggable coordinate={{ latitude: coords.lat, longitude: coords.lng }} onDragEnd={(e) => fill({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} pinColor={colors.primary} />
          </MapView>
          <Pressable onPress={locate} accessibilityRole="button" style={{ position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, elevation: 4 }}>
            <LocateFixed size={16} color={colors.primary} />
            <T size={12} w="bold" color={colors.primary}>{locating ? 'Locating…' : 'Use current location'}</T>
          </Pressable>
        </View>
        <T size={12} color={colors.muted}>Drag the pin to your exact gate so the collector finds you.</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['home', 'Home', House], ['office', 'Office', Briefcase], ['other', 'Other', MapPin]] as const).map(([t, l, Icon]) => (
            <Chip key={t} label={l} active={type === t} icon={<Icon size={14} color={type === t ? colors.white : colors.muted} />} onPress={() => { setType(t); setLabel(l); }} />
          ))}
        </View>
        {type === 'other' ? <Field label="Label" value={label} onChangeText={setLabel} placeholder="E.g. Parents' house" /> : null}
        <Field label="House / flat, building, street" value={street} onChangeText={setStreet} placeholder="B-204, Palm Grove Apartments, Sector 21" />
        <Field label="Landmark (optional)" value={landmark} onChangeText={setLandmark} placeholder="Near the park gate" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="City" value={city} onChangeText={setCity} /></View>
          <View style={{ flex: 1 }}><Field label="Pincode" value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" error={pincode && !/^\d{6}$/.test(pincode) ? '6 digits' : undefined} /></View>
        </View>
        <Field label="State" value={state} onChangeText={setState} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={14} w="semibold">Set as default address</T>
          <Toggle value={isDefault} onChange={setIsDefault} label="Set as default address" />
        </View>
      </ScrollView>
      <BottomBar>
        <Button
          label="Save address"
          disabled={!valid}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const a = await saveAddress({ _id: editing?._id, type, label: label.trim() || 'Other', street: street.trim(), landmark: landmark.trim(), city: city.trim(), state: state.trim(), pincode, coordinates: coords, isDefault });
              if (route.params?.pick) setDraft((d) => ({ ...d, address: a }));
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not save', e.message);
              setBusy(false);
            }
          }}
        />
      </BottomBar>
    </Screen>
  );
}

/* ------------------------------------------------------------------ Refer */

export function ReferScreen() {
  const nav = useNavigation();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const q = useQuery<any>('/referrals/me');
  const r = q.data;
  const share = () =>
    Share.share({ message: `I sell my scrap on Scraptox: free doorstep pickup, digital weighing and instant UPI payment. Use my code ${r?.code} to get ₹${r?.friendReward ?? 25} on your first pickup.` });
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: colors.deep, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}>
          {focused ? <StatusBar barStyle="light-content" /> : null}
          <T size={13} w="semibold" color={colors.green200}>Refer &amp; earn</T>
          <T size={26} w="extrabold" color={colors.white} lh={31} style={{ letterSpacing: -0.4 }}>{`Get ${inr(r?.rewardPerReferral ?? 50)} for every friend who sells`}</T>
          <T size={13} color={colors.green100} lh={19}>{`They get ${inr(r?.friendReward ?? 25)} on their first pickup. You get paid when it's completed.`}</T>
        </View>
        {!r ? <Loading /> : (
          <View style={{ padding: 16, gap: 14, marginTop: -16 }}>
            <Card style={{ gap: 12 }}>
              <T size={12} w="semibold" color={colors.muted}>Your code</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, height: 50, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, backgroundColor: colors.green50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
                  <T size={18} w="extrabold" color={colors.deep} raw style={{ letterSpacing: 1.2 }}>{r.code}</T>
                  <Pressable onPress={share} accessibilityLabel="Copy code" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Copy size={14} color={colors.primary} />
                    <T size={12} w="bold" color={colors.primary}>Copy</T>
                  </Pressable>
                </View>
              </View>
              <Button label="Share with friends" icon={<Share2 size={18} color={colors.white} />} onPress={share} />
            </Card>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['Invited', String(r.totals.invited)], ['Joined', String(r.totals.joined)], ['Earned', inr(r.totals.earned)]].map(([l, v]) => (
                <Card key={l} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12 }}>
                  <T size={18} w="extrabold" raw color={l === 'Earned' ? colors.deep : colors.ink}>{v}</T>
                  <T size={11} w="semibold" color={colors.muted}>{l}</T>
                </Card>
              ))}
            </View>

            {r.tier?.next ? <Card tone="gold" style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <IconBadge tone="gold"><Trophy size={18} color={colors.goldText} /></IconBadge>
                <View style={{ flex: 1 }}>
                  <T size={14} w="extrabold" color="#5C3B00">{`${r.tier.name} tier this month`}</T>
                  <T size={12} color={colors.goldText}>{`${r.tier.needed} more friends to reach ${r.tier.next} · ${inr(r.tier.bonus)} bonus`}</T>
                </View>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.goldLine }}>
                <View style={{ width: `${(r.totals.joined / (r.totals.joined + r.tier.needed)) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />
              </View>
              <T size={13} w="bold" color={colors.goldText} onPress={() => nav.navigate('Leaderboard')}>See this month's leaderboard ›</T>
            </Card> : null}

            <T size={17} w="bold" style={{ marginTop: 4 }}>How it works</T>
            <Card style={{ gap: 14 }}>
              {['Share your code with friends and neighbours', 'They sign up and book their first pickup', `You both get paid once the pickup is completed`].map((s, i) => (
                <View key={s} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center' }}>
                    <T size={13} w="extrabold" color={colors.primary} raw>{String(i + 1)}</T>
                  </View>
                  <T size={13} color={colors.ink2} style={{ flex: 1 }}>{s}</T>
                </View>
              ))}
            </Card>

            <T size={17} w="bold" style={{ marginTop: 4 }}>Your referrals</T>
            <Card style={{ paddingVertical: 0 }}>
              {r.referrals.map((f: any, i: number) => (
                <ListRow key={f.name} title={f.name} subtitle={`Joined ${dateLabel(f.createdAt)}`} last={i === r.referrals.length - 1} right={f.status === 'completed' ? <Tag label={`+${inr(f.reward)}`} /> : <Tag tone="grey" label="First pickup pending" />} />
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

export function LeaderboardScreen() {
  const q = useQuery<any>('/referrals/leaderboard');
  const d = q.data;
  const medal = (n: number) => (n === 1 ? colors.gold : n === 2 ? '#8E9AA3' : '#B07A4A');
  return (
    <Screen>
      <AppBar title="Leaderboard" subtitle={d ? `${d.month} · Delhi NCR` : undefined} />
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            {[d.leaders[1], d.leaders[0], d.leaders[2]].filter(Boolean).map((l: any) => (
              <Card key={l.rank} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: l.rank === 1 ? 22 : 14 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: medal(l.rank), alignItems: 'center', justifyContent: 'center' }}>
                  <T size={14} w="extrabold" color={colors.white} raw>{String(l.rank)}</T>
                </View>
                <T size={13} w="bold" center numberOfLines={1}>{l.name.split(' ')[0]}</T>
                <T size={11} color={colors.muted} raw>{`${l.referrals} friends`}</T>
                <T size={11} w="bold" color={colors.primary} raw>{`${l.kg} kg`}</T>
              </Card>
            ))}
          </View>
          <Card style={{ paddingVertical: 0 }}>
            {d.leaders.slice(3).map((l: any, i: number) => (
              <ListRow key={l.rank} title={`${l.rank}. ${l.name}`} subtitle={l.city} last={i === d.leaders.length - 4} right={<T size={13} w="bold" raw>{`${l.referrals} · ${l.kg} kg`}</T>} />
            ))}
          </Card>
          <Card tone="green" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <T size={13} w="extrabold" color={colors.white} raw>{String(d.me.rank)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold">{`You · ${d.me.name}`}</T>
              <T size={12} color={colors.muted} raw>{`${d.me.referrals} friends · ${d.me.kg} kg recycled`}</T>
            </View>
          </Card>
          <T size={12} color={colors.muted} center>Top 3 each month win bonus wallet cash. Ranks update daily.</T>
        </ScrollView>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------- Help */

export function HelpScreen({ navigation }: P<'Help'>) {
  const tickets = useQuery<{ tickets: any[] }>('/support/my-tickets');
  const [topic, setTopic] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const FAQ = [
    ['How is the price decided?', 'Rates on the app are fixed for the day. The collector weighs your items on a digital scale at your door, and you are paid for the exact weight.'],
    ['When do I get paid?', 'As soon as the pickup is completed, the amount lands in your Scraptox wallet. Withdraw to UPI any time.'],
    ['Is pickup free?', 'Yes. There is no pickup charge for scrap.'],
  ];
  return (
    <Screen>
      <AppBar title="Help & support" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ paddingVertical: 4 }}>
          {FAQ.map(([q, a], i) => (
            <View key={q} style={{ paddingVertical: 12, gap: 4, borderBottomWidth: i === FAQ.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <CircleHelp size={16} color={colors.primary} />
                <T size={14} w="bold" style={{ flex: 1 }}>{q}</T>
              </View>
              <T size={13} color={colors.ink2} lh={19}>{a}</T>
            </View>
          ))}
        </Card>
        <T size={17} w="bold">Raise a ticket</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HELP_TOPICS.map((t) => <Chip key={t} label={t} active={topic === t} onPress={() => setTopic(t)} />)}
        </View>
        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="Short summary" />
        <Field label="Describe the problem" value={message} onChangeText={setMessage} multiline placeholder="Order number, what happened, when" />
        <Button
          label="Submit ticket"
          disabled={!topic || subject.trim().length < 3 || message.trim().length < 10}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api('/support', { method: 'POST', body: { category: topic, subject: subject.trim(), message: message.trim() } });
              Alert.alert('Ticket raised', 'Our team replies within 24 hours.');
              setTopic(null);
              setSubject('');
              setMessage('');
              tickets.reload();
            } catch (e: any) {
              Alert.alert('Could not submit', e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        {(tickets.data?.tickets ?? []).length ? <T size={17} w="bold" style={{ marginTop: 6 }}>Your tickets</T> : null}
        {(tickets.data?.tickets ?? []).map((t) => (
          <Card key={t._id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={12} color={colors.muted} raw>{`${t.ticketNo} · ${dateLabel(t.createdAt)}`}</T>
              <Tag tone={t.status === 'open' ? 'gold' : 'green'} label={t.status === 'open' ? 'Open' : 'Resolved'} />
            </View>
            <T size={14} w="bold">{t.subject}</T>
            <T size={12} color={colors.muted}>{t.category}</T>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ Legal */

const TERMS = `Scraptox connects you with verified scrap collectors. Rates shown in the app apply on the day of pickup. The final amount is based on the weight measured on the collector's digital scale at your door.

Pickups are free. You can cancel a pickup until the collector is on the way.

Payments for pickups are credited to your Scraptox wallet. Withdrawals to UPI or bank are processed as per our payout timelines.

Do not hand over hazardous waste. Collectors may refuse items that are unsafe to transport.

[FULL TERMS TO BE PROVIDED BY SCRAPTOX]`;

const PRIVACY = `We collect your name, mobile number, addresses and pickup photos to arrange pickups and payments. Your location is used to match nearby collectors and to show live tracking.

We share your name, address and phone number only with the collector assigned to your pickup.

You can ask us to delete your account and data at any time from Help & support.

[FULL PRIVACY POLICY TO BE PROVIDED BY SCRAPTOX]`;

export function LegalScreen({ route }: P<'Legal'>) {
  const terms = route.params.kind === 'terms';
  return (
    <Screen>
      <AppBar title={terms ? 'Terms & conditions' : 'Privacy policy'} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <T size={14} color={colors.ink2} lh={22}>{terms ? TERMS : PRIVACY}</T>
      </ScrollView>
    </Screen>
  );
}

export function SettingsLanguageScreen({ navigation }: P<'SettingsLanguage'>) {
  return (
    <Screen>
      <AppBar title="Language" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <SettingsLanguagePicker onDone={() => navigation.goBack()} />
      </ScrollView>
    </Screen>
  );
}
