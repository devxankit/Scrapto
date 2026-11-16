import React, { useState } from 'react';
import { Image, ScrollView, Share, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Bell, ChevronDown, ChevronRight, CircleHelp, Copy, FileText, Gift, Globe, IndianRupee, LifeBuoy, LogOut, MapPin, MessageCircle, RotateCcw, Share2, ShieldCheck, Tags, Trophy, Truck } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, Avatar, BottomBar, Button, Card, CheckBox, Chip, Field, ListRow, Loading, Screen, Tag } from '../components/ui';
import { IconBadge } from '../components/brand';
import { CitySheet, SettingsLanguagePicker, VEHICLE_NO, VehiclePicker } from './auth';
import { colors, radius } from '../theme';
import { Partner, useStore } from '../store/AppStore';
import { api, USE_MOCK } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { HELP_TOPICS, LANGUAGES, SERVICES, VEHICLES, images } from '../data/catalog';
import { dateLabel, inr, phoneLabel } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/* ---------------------------------------------------------------- Profile */

export function ProfileScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, lang, logout, resetDemo } = useStore();
  const stats = useQuery<{ stats: any }>('/scrappers/stats');
  const notes = useQuery<{ notifications: any[] }>('/notifications');
  const unread = (notes.data?.notifications ?? []).filter((n) => !n.read).length;
  const langName = LANGUAGES.find((l) => l.id === (lang ?? 'en'))?.native ?? 'English';
  const vehicle = VEHICLES.find((v) => v.id === user?.vehicleInfo?.type);
  const sub = user?.subscription;
  const s = stats.data?.stats;

  const menu: { label: string; meta?: string; Icon: typeof Bell; go: () => void }[] = [
    { label: 'KYC status', meta: user?.kyc?.status === 'verified' ? 'Verified' : 'Pending', Icon: ShieldCheck, go: () => nav.navigate('KycStatus') },
    { label: 'Plans & billing', meta: sub?.status === 'active' ? sub.plan?.name : 'None', Icon: Tags, go: () => nav.navigate('Plans') },
    { label: 'Earnings', Icon: IndianRupee, go: () => nav.navigate('Earnings') },
    { label: "Today's rates", Icon: Tags, go: () => nav.navigate('Prices') },
    { label: 'Chats', Icon: MessageCircle, go: () => nav.navigate('Chats') },
    { label: 'Notifications', meta: unread ? `${unread} new` : '', Icon: Bell, go: () => nav.navigate('Notifications') },
    { label: 'Leaderboard', Icon: Trophy, go: () => nav.navigate('Leaderboard') },
    { label: 'Language', meta: langName, Icon: Globe, go: () => nav.navigate('SettingsLanguage') },
    { label: 'Help & support', Icon: LifeBuoy, go: () => nav.navigate('Help') },
    { label: 'Terms & privacy', Icon: FileText, go: () => nav.navigate('Legal', { kind: 'terms' }) },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 16, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar source={images.avatarPartner} size={62} ring={user?.kyc?.status === 'verified' ? colors.brand : undefined} />
            <View style={{ flex: 1, gap: 2 }}>
              <T size={19} w="extrabold" numberOfLines={1}>{user?.name}</T>
              <T size={13} color={colors.muted} raw>{`+91 ${phoneLabel(user?.phone)}`}</T>
              {user?.kyc?.status === 'verified' ? <Tag label="✓ KYC VERIFIED" /> : <Tag tone="gold" label="KYC PENDING" />}
            </View>
            <Button label="Edit" variant="outline" size="sm" full={false} onPress={() => nav.navigate('EditProfile')} />
          </View>
          <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, paddingVertical: 12 }}>
            <Stat value={String(s?.completedOrders ?? '—')} label="Pickups" />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Stat value={s ? `★ ${s.rating}` : '—'} label="Rating" />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Stat value={sub?.status === 'active' ? `${Math.max(0, Math.ceil((Date.parse(sub.expiryDate ?? '') - Date.now()) / 86400000))}d` : '—'} label="Plan left" />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Truck size={15} color={colors.muted} />
              <T size={12} w="semibold" color={colors.ink2} raw>{`${vehicle?.name ?? 'Vehicle'} · ${user?.vehicleInfo?.number || 'No number'}`}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={15} color={colors.muted} />
              <T size={12} w="semibold" color={colors.ink2}>{user?.city ?? '—'}</T>
            </View>
          </View>
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          <Card tone="gold" onPress={() => nav.navigate('Refer')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge tone="gold"><Gift size={18} color={colors.goldText} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold" color="#5C3B00">Bring partners, earn up to ₹400 each</T>
              <T size={12} color={colors.goldText} raw>{`Your code ${user?.referralCode ?? ''}`}</T>
            </View>
            <ChevronRight size={18} color={colors.goldText} />
          </Card>
          <Card style={{ paddingVertical: 0 }}>
            {menu.map((m, i) => (
              <ListRow key={m.label} title={m.label} meta={m.meta} last={i === menu.length - 1} onPress={m.go} icon={<m.Icon size={20} color={colors.deep} />} />
            ))}
          </Card>
          <Button
            label="Log out"
            variant="ghostDanger"
            icon={<LogOut size={18} color={colors.red} />}
            style={{ borderWidth: 0 }}
            onPress={() => Alert.alert('Log out?', 'You will go offline and stop getting requests.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logout }])}
          />
          {USE_MOCK ? (
            <Pressable onPress={() => Alert.alert('Reset demo data?', 'This removes the demo partner account and all sample data on this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: resetDemo }])} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
              <RotateCcw size={14} color={colors.muted} />
              <T size={12} w="semibold" color={colors.muted}>Reset demo data</T>
            </Pressable>
          ) : null}
          <T size={11} color={colors.faint} center raw>Scraptox Partner 1.0.0</T>
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

/* ----------------------------------------------------------- Edit profile */

export function EditProfileScreen({ navigation }: P<'EditProfile'>) {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [vehicle, setVehicle] = useState<Partner['vehicleInfo']['type']>(user?.vehicleInfo?.type ?? 'auto');
  const [number, setNumber] = useState(user?.vehicleInfo?.number ?? '');
  const [services, setServices] = useState<Partner['services']>(user?.services ?? ['scrap_pickup']);
  const [cityOpen, setCityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailOk = !email || /^\S+@\S+\.\S+$/.test(email);
  const numberOk = VEHICLE_NO.test(number.trim().toUpperCase());
  const ok = name.trim().length >= 2 && emailOk && numberOk && !!city && services.length > 0;
  return (
    <Screen>
      <AppBar title="Edit profile" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Avatar source={images.avatarPartner} size={84} />
        </View>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Please check the email address'} />
        <Field label="Mobile number" value={`+91 ${phoneLabel(user?.phone)}`} editable={false} hint="To change your number, contact support." />
        <View style={{ gap: 6 }}>
          <T size={13} w="semibold" color={colors.ink2}>City</T>
          <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: colors.white }}>
            <MapPin size={18} color={colors.deep} />
            <T size={15} w="semibold" style={{ flex: 1 }}>{city || 'Choose city'}</T>
            <ChevronDown size={18} color={colors.muted} />
          </Pressable>
        </View>
        <T size={15} w="extrabold">Vehicle</T>
        <VehiclePicker value={vehicle} onChange={setVehicle} />
        <Field label="Vehicle number" value={number} onChangeText={(v) => setNumber(v.toUpperCase().slice(0, 13))} autoCapitalize="characters" error={number && !numberOk ? 'Enter it as on the RC, e.g. HR 26 DK 4417' : undefined} />
        <T size={15} w="extrabold">Services</T>
        {SERVICES.map((sv) => {
          const on = services.includes(sv.id);
          return (
            <Pressable key={sv.id} onPress={() => setServices((x) => (on ? x.filter((y) => y !== sv.id) : [...x, sv.id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: on ? colors.green200 : colors.line, backgroundColor: colors.white }}>
              <CheckBox on={on} />
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">{sv.name}</T>
                <T size={12} color={colors.muted}>{sv.hint}</T>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <BottomBar>
        <Button
          label="Save"
          variant="deep"
          disabled={!ok}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const v = VEHICLES.find((x) => x.id === vehicle)!;
              await updateProfile({ name: name.trim(), email: email.trim(), city, services, vehicleInfo: { type: vehicle, number: number.trim().toUpperCase(), capacity: v.capacity } });
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not save', e.message);
              setBusy(false);
            }
          }}
        />
      </BottomBar>
      <CitySheet visible={cityOpen} onClose={() => setCityOpen(false)} onPick={(c) => { setCity(c); setCityOpen(false); }} />
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
    Share.share({ message: `I get scrap pickups near me on Scraptox Partner. Join with my code ${r?.code} and get ₹${r?.friendReward ?? 100} after your first pickup.` });
  return (
    <Screen>
      {focused ? <StatusBar barStyle="light-content" /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: colors.deep, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 28, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => nav.goBack()} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.deep2, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={22} color={colors.white} style={{ transform: [{ rotate: '180deg' }] }} />
            </Pressable>
            <T size={13} w="semibold" color={colors.green200}>Refer partners</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <T size={24} w="extrabold" color={colors.white} lh={29} style={{ letterSpacing: -0.4 }}>{`Earn up to ${inr(r?.rewardPerReferral ?? 400)} per partner you bring`}</T>
              <T size={13} color={colors.green100} lh={19}>{`They get ${inr(r?.friendReward ?? 100)} after their first pickup. You earn at each milestone.`}</T>
            </View>
            <Image source={images.refer} style={{ width: 92, height: 92, borderRadius: 18 }} />
          </View>
        </View>
        {!r ? <Loading /> : (
          <View style={{ padding: 16, gap: 14, marginTop: -16 }}>
            <Card style={{ gap: 12 }}>
              <T size={12} w="semibold" color={colors.muted}>Your code</T>
              <View style={{ height: 50, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.deep, borderRadius: radius.md, backgroundColor: colors.green50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
                <T size={18} w="extrabold" color={colors.deep} raw style={{ letterSpacing: 1.2 }}>{r.code}</T>
                <Pressable onPress={share} accessibilityLabel="Copy code" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Copy size={14} color={colors.primary} />
                  <T size={12} w="bold" color={colors.primary}>Copy</T>
                </Pressable>
              </View>
              <Button label="Share with other collectors" variant="deep" icon={<Share2 size={18} color={colors.white} />} onPress={share} />
            </Card>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['Invited', String(r.totals.invited)], ['Joined', String(r.totals.joined)], ['Earned', inr(r.totals.earned)]].map(([l, v]) => (
                <Card key={l} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12 }}>
                  <T size={18} w="extrabold" raw color={l === 'Earned' ? colors.deep : colors.ink}>{v}</T>
                  <T size={11} w="semibold" color={colors.muted}>{l}</T>
                </Card>
              ))}
            </View>

            <T size={17} w="bold" style={{ marginTop: 4 }}>Milestones per partner</T>
            <Card style={{ gap: 12 }}>
              {r.milestones.map((m: any, i: number) => (
                <View key={m.label} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <T size={13} w="extrabold" color={colors.goldText} raw>{String(i + 1)}</T>
                  </View>
                  <T size={14} w="semibold" style={{ flex: 1 }}>{`Their ${m.label.toLowerCase()}`}</T>
                  <T size={14} w="extrabold" color={colors.deep} raw>{`+${inr(m.reward)}`}</T>
                </View>
              ))}
            </Card>

            <T size={17} w="bold" style={{ marginTop: 4 }}>Your referrals</T>
            <Card style={{ paddingVertical: 0 }}>
              {r.referrals.map((f: any, i: number) => (
                <ListRow key={f.name} title={f.name} subtitle={f.status === 'kyc_pending' ? `Joined ${dateLabel(f.createdAt)} · KYC pending` : `${f.pickups} pickups done`} last={i === r.referrals.length - 1} right={f.reward ? <Tag label={`+${inr(f.reward)}`} /> : <Tag tone="grey" label="Pending" />} />
              ))}
            </Card>
            <T size={13} w="bold" color={colors.primary} center onPress={() => nav.navigate('Leaderboard')}>See this month's top partners ›</T>
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
      <AppBar title="Top partners" subtitle={d ? `${d.month} · Delhi NCR` : undefined} />
      {!d ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Image source={images.podium} style={{ width: '100%', height: 150, borderRadius: radius.lg }} resizeMode="cover" />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            {[d.leaders[1], d.leaders[0], d.leaders[2]].map((l: any) => (
              <Card key={l.rank} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: l.rank === 1 ? 22 : 14 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: medal(l.rank), alignItems: 'center', justifyContent: 'center' }}>
                  <T size={14} w="extrabold" color={colors.white} raw>{String(l.rank)}</T>
                </View>
                <T size={13} w="bold" center numberOfLines={1}>{l.name.split(' ')[0]}</T>
                <T size={11} color={colors.muted} raw>{`${l.pickups} pickups`}</T>
                <T size={11} w="bold" color={colors.primary} raw>{`${(l.kg / 1000).toFixed(1)} t`}</T>
              </Card>
            ))}
          </View>
          <Card style={{ paddingVertical: 0 }}>
            {d.leaders.slice(3).map((l: any, i: number) => (
              <ListRow key={l.rank} title={`${l.rank}. ${l.name}`} subtitle={l.city} last={i === d.leaders.length - 4} right={<T size={13} w="bold" raw>{`${l.pickups} · ${(l.kg / 1000).toFixed(1)} t`}</T>} />
            ))}
          </Card>
          <Card tone="green" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.deep, alignItems: 'center', justifyContent: 'center' }}>
              <T size={13} w="extrabold" color={colors.white} raw>{String(d.me.rank)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold">{`You · ${d.me.name}`}</T>
              <T size={12} color={colors.muted} raw>{`${d.me.pickups} pickups · ${d.me.kg} kg this month`}</T>
            </View>
          </Card>
          <T size={12} color={colors.muted} center>Top 3 partners each month win a wallet bonus. Ranks update daily.</T>
        </ScrollView>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------- Help */

export function HelpScreen() {
  const tickets = useQuery<{ tickets: any[] }>('/support/my-tickets');
  const [topic, setTopic] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const FAQ = [
    ['How do I get more pickups?', 'Stay online during the day, keep a good rating, and choose a plan with a bigger radius. Requests go to nearby online partners first.'],
    ['How do I pay the customer?', 'After weighing, pay from your partner wallet. If the balance is low, top up with Razorpay on the same screen.'],
    ['How do I withdraw money?', 'Wallet → Withdraw. UPI is instant; bank transfers reach within 24 hours.'],
    ['Why can\'t I go online?', 'You need verified KYC and an active plan. Check Profile → KYC status and Plans & billing.'],
  ];
  return (
    <Screen>
      <AppBar title="Help & support" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ paddingVertical: 4 }}>
          {FAQ.map(([q, a], i) => (
            <View key={q} style={{ paddingVertical: 12, gap: 4, borderBottomWidth: i === FAQ.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <CircleHelp size={16} color={colors.deep} />
                <T size={14} w="bold" style={{ flex: 1 }}>{q}</T>
              </View>
              <T size={13} color={colors.ink2} lh={19}>{a}</T>
            </View>
          ))}
        </Card>
        <T size={17} w="bold">Raise a ticket</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HELP_TOPICS.map((t) => <Chip key={t} label={t} active={topic === t} dark onPress={() => setTopic(t)} />)}
        </View>
        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="Short summary" />
        <Field label="Describe the problem" value={message} onChangeText={setMessage} multiline placeholder="Pickup number, what happened, when" />
        <Button
          label="Submit ticket"
          variant="deep"
          disabled={!topic || subject.trim().length < 3 || message.trim().length < 10}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api('/support', { method: 'POST', body: { category: topic, subject: subject.trim(), message: message.trim() } });
              Alert.alert('Ticket raised', 'Our partner team replies within 24 hours.');
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

const TERMS = `Scraptox Partner connects verified scrap collectors with customers who want to sell scrap.

You must complete KYC and keep an active plan to accept pickups. Your plan's limits (pickups, radius, bulk-lot bids) apply.

Pay customers at least the rates shown in the app, for the weight measured on your digital scale at their door. Payments to customers go through the Scraptox wallet.

Behave politely, carry your ID, and do not ask customers for payment outside the app. Partners who break these rules can be suspended.

[FULL PARTNER TERMS TO BE PROVIDED BY SCRAPTOX]`;

const PRIVACY = `We collect your name, mobile number, Aadhaar details, selfie, vehicle details and location to verify you and send you pickups near you.

Your Aadhaar number is stored encrypted. Customers see only your name, photo, rating and vehicle number.

Your live location is shared with the customer only while you are on the way to their pickup.

You can ask us to delete your account and data at any time from Help & support.

[FULL PRIVACY POLICY TO BE PROVIDED BY SCRAPTOX]`;

export function LegalScreen({ route }: P<'Legal'>) {
  const terms = route.params.kind === 'terms';
  return (
    <Screen>
      <AppBar title={terms ? 'Partner terms' : 'Privacy policy'} />
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
