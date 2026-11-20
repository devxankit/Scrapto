import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Image, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ArrowRight, Bell, BellOff, ChevronDown, ChevronRight, Gift, Headphones, IndianRupee, MapPin, MessageCircle, PackageCheck, Recycle, Scale, Search, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Truck, Wallet as WalletIcon, X, Zap } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import Fade from '../components/Fade';
import { AppBar, Avatar, Card, Chip, EmptyState, Screen, SectionHeader, StatusPill } from '../components/ui';
import { CategoryTile, IconBadge, Logo, Price, unitOf } from '../components/brand';
import { colors, family, FamilyKey, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { useQuery } from '../hooks/useQuery';
import { api } from '../api/client';
import { categoryMeta, images } from '../data/catalog';
import { ago, firstName, greeting, inr, catName, whenLabel } from '../utils/format';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

const BANNER_IMAGES: Record<string, any> = { bannerPickup: images.bannerPickup, bannerRates: images.bannerRates, bannerUpi: images.bannerUpi };

/* ------------------------------------------------------------------- Home */

export function HomeScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, prices, addresses, loadPrices } = useStore();
  const orders = useQuery<{ orders: any[] }>('/orders/my-orders', undefined, { poll: 10000 });
  const banners = useQuery<{ banners: any[] }>('/banners/public', { audience: 'user' }, { persist: true });
  const notes = useQuery<{ notifications: any[] }>('/notifications');
  const wallet = useQuery<any>('/wallet/profile');
  const [slide, setSlide] = useState(0);
  const home = addresses.find((a) => a.isDefault) ?? addresses[0];
  const live = orders.data?.orders.find((o) => o.status === 'confirmed' || o.status === 'in_progress' || o.status === 'pending');
  const unread = notes.data?.notifications.some((n) => !n.read);
  const bannerW = width - 24;
  // 4 square tiles per row: 12dp screen edges, 8dp gaps.
  const tileW = Math.floor((width - 24 - 3 * 8) / 4);
  const recent = (orders.data?.orders ?? []).slice(0, 3);
  const appliances = prices.filter((p) => unitOf(p) === 'pc');

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (bannerW + 8)));

  const quick: { label: string; Icon: any; tint: string; bg: string; go: () => void }[] = [
    { label: 'Sell scrap', Icon: Recycle, tint: colors.primary, bg: colors.green50, go: () => nav.navigate('SellCategory') },
    { label: 'Rates', Icon: TrendingUp, tint: colors.blueText, bg: colors.blueSoft, go: () => nav.navigate('Prices') },
    { label: 'My pickups', Icon: Truck, tint: colors.tealText, bg: colors.tealSoft, go: () => nav.navigate('Main', { screen: 'Requests' }) },
    { label: 'Wallet', Icon: WalletIcon, tint: colors.goldText, bg: colors.goldSoft, go: () => nav.navigate('Wallet') },
    { label: 'Cleaning', Icon: Sparkles, tint: '#4A33A8', bg: '#EEEAFE', go: () => nav.navigate('Cleaning') },
    { label: 'Refer & earn', Icon: Gift, tint: colors.goldText, bg: colors.goldSoft, go: () => nav.navigate('Main', { screen: 'Refer' }) },
    { label: 'Chats', Icon: MessageCircle, tint: colors.primary, bg: colors.green50, go: () => nav.navigate('Chats') },
    { label: 'Help', Icon: Headphones, tint: colors.ink2, bg: colors.lineSoft, go: () => nav.navigate('Help') },
  ];

  return (
    <Screen>
      {/* Header (sticky: it sits outside the scroll view) */}
      <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 4, paddingHorizontal: 12, paddingBottom: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => nav.navigate('Addresses')} accessibilityRole="button" accessibilityLabel="Change pickup address" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconBadge size={32}>
              <MapPin size={16} color={colors.brand} fill={colors.green100} />
            </IconBadge>
            <View style={{ flex: 1 }}>
              <T size={11} w="semibold" color={colors.muted} lh={14}>{home ? `Pickup at · ${home.label}` : `${greeting()}, ${firstName(user?.name)}`}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <T size={14} w="bold" lh={18} numberOfLines={1} style={{ flexShrink: 1 }}>{home ? `${home.street.split(',').slice(-1)[0].trim()}, ${home.city}` : 'Add your pickup address'}</T>
                <ChevronDown size={14} color={colors.ink} strokeWidth={2.6} />
              </View>
            </View>
          </Pressable>
          <Pressable onPress={() => nav.navigate('Notifications')} accessibilityRole="button" accessibilityLabel="Notifications" style={{ width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={18} color={colors.ink} />
            {unread ? <View style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white }} /> : null}
          </Pressable>
        </View>
        <Pressable onPress={() => nav.navigate('Categories')} accessibilityRole="search" style={{ height: 38, borderRadius: radius.md, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Search size={16} color={colors.muted} />
          <T size={13} color={colors.muted}>Search copper, newspaper, AC…</T>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { orders.reload(); loadPrices(); notes.reload(); }} colors={[colors.primary]} />}>
        {/* Live order */}
        {live ? (
          <Pressable onPress={() => nav.navigate('Order', { id: live._id })} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: colors.deep, borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.92 : 1 })}>
            {live.scrapper ? (
              <Avatar source={images.avatarPartner} size={36} ring={colors.green400} />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.deep2, alignItems: 'center', justifyContent: 'center' }}>
                <Search size={16} color={colors.green200} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T size={11} w="semibold" color={colors.green200} numberOfLines={1}>{`${live.status === 'in_progress' ? 'Pickup on the way' : live.status === 'confirmed' ? 'Pickup accepted' : 'Finding a collector'} · #${live.orderNo}`}</T>
              <T size={14} w="bold" color={colors.white} numberOfLines={1}>
                {live.status === 'in_progress'
                  ? live.tracking?.arrived ? `${firstName(live.scrapper?.name)} is at your door` : `${firstName(live.scrapper?.name)} arrives in ${live.tracking?.etaMin ?? 8} min`
                  : live.status === 'confirmed' ? `${live.scrapper?.name} will pick up` : 'Usually takes under a minute'}
              </T>
            </View>
            <View style={{ backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
              <T size={12} w="bold" color={colors.white}>Track</T>
            </View>
          </Pressable>
        ) : null}

        {/* Quick actions (PhonePe-style icon grid) */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
          {quick.map((q) => (
            <Pressable key={q.label} onPress={q.go} accessibilityRole="button" accessibilityLabel={q.label} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: q.bg, alignItems: 'center', justifyContent: 'center' }}>
                <q.Icon size={20} color={q.tint} strokeWidth={2.2} />
              </View>
              <T size={11} w="semibold" color={colors.ink2} lh={13} numberOfLines={1}>{q.label}</T>
            </Pressable>
          ))}
        </View>

        {/* Banners */}
        <View>
          <ScrollView horizontal pagingEnabled={false} snapToInterval={bannerW + 8} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} contentContainerStyle={{ gap: 8 }}>
            {(banners.data?.banners ?? [{ _id: 'x', title: 'Free doorstep pickup', subtitle: 'Weighed at your door, paid on UPI', image: 'bannerPickup', link: 'sell' }]).map((b) => (
              <Pressable
                key={b._id}
                onPress={() => (b.link === 'prices' ? nav.navigate('Prices') : b.link === 'wallet' ? nav.navigate('Wallet') : nav.navigate('SellCategory'))}
                accessibilityRole="button"
                accessibilityLabel={b.title}
                style={{ width: bannerW, height: 116, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.green50 }}>
                <Image source={BANNER_IMAGES[b.image] ?? images.bannerPickup} style={{ position: 'absolute', right: 0, top: 0, width: '46%', height: '100%' }} resizeMode="cover" />
                <View style={{ position: 'absolute', left: '54%', top: 0, bottom: 0, width: '16%' }}>
                  <SideFade />
                </View>
                <View style={{ position: 'absolute', left: 12, top: 10, bottom: 10, width: '56%', gap: 2 }}>
                  <T size={10} w="extrabold" color={colors.primary}>{b.title.toUpperCase()}</T>
                  <T size={15} w="extrabold" lh={19} numberOfLines={2}>{b.link === 'prices' ? 'Rates checked every morning' : b.link === 'wallet' ? 'Paid before the truck leaves' : 'Sell scrap in 2 minutes'}</T>
                  <T size={11} color={colors.ink2} numberOfLines={1}>{b.subtitle}</T>
                  <View style={{ flex: 1 }} />
                  <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
                    <T size={11} w="bold" color={colors.white}>{b.link === 'prices' ? 'See rates' : b.link === 'wallet' ? 'Open wallet' : 'Sell scrap'}</T>
                    <ArrowRight size={12} color={colors.white} strokeWidth={2.6} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          {(banners.data?.banners?.length ?? 1) > 1 ? (
            <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 6 }}>
              {(banners.data?.banners ?? [0]).map((_: any, i: number) => (
                <View key={i} style={{ width: i === slide ? 14 : 4, height: 4, borderRadius: 2, backgroundColor: i === slide ? colors.primary : colors.lineStrong }} />
              ))}
            </View>
          ) : null}
        </View>

        {/* Rates: 2 rows of 4 square tiles */}
        <View style={{ gap: 8 }}>
          <SectionHeader title="Today's rates" action={`See all ${prices.length || ''}`.trim()} onAction={() => nav.navigate('Prices')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {homePicks(prices).map((p) => (
              <CategoryTile key={p._id} price={p} width={tileW} onPress={() => nav.navigate('SellCategory', { preselect: p.category })} />
            ))}
          </View>
        </View>

        {/* How it works (one compact strip) */}
        <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' }}>
          {[
            { n: 'Book', t: 'Items & slot', Icon: PackageCheck },
            { n: 'Weigh', t: 'At your door', Icon: Scale },
            { n: 'Get paid', t: 'UPI / wallet', Icon: IndianRupee },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i ? <ChevronRight size={14} color={colors.faint} /> : null}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                <s.Icon size={16} color={colors.brand} />
                <View style={{ flexShrink: 1 }}>
                  <T size={11} w="extrabold" lh={14}>{s.n}</T>
                  <T size={10} color={colors.muted} lh={13} numberOfLines={1}>{s.t}</T>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Wallet + refer */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => nav.navigate('Wallet')} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, opacity: pressed ? 0.85 : 1 })}>
            <IconBadge size={32} tone="green"><WalletIcon size={16} color={colors.primary} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={10} w="semibold" color={colors.muted} lh={13}>Scraptox wallet</T>
              <T size={15} w="extrabold" color={colors.deep} raw lh={19}>{inr(wallet.data?.balance ?? 0)}</T>
            </View>
            <ChevronRight size={14} color={colors.faint} />
          </Pressable>
          <Pressable onPress={() => nav.navigate('Main', { screen: 'Refer' })} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#FFF8E8', opacity: pressed ? 0.85 : 1 })}>
            <IconBadge size={32} tone="gold"><Gift size={16} color={colors.goldText} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={10} w="semibold" color={colors.goldText} lh={13}>Refer &amp; earn</T>
              <T size={13} w="extrabold" color="#5C3B00" raw lh={17} numberOfLines={1}>{user?.referralCode ?? 'Invite friends'}</T>
            </View>
            <ChevronRight size={14} color={colors.goldText} />
          </Pressable>
        </View>

        {/* Big items, sold per piece */}
        {appliances.length ? (
          <View style={{ gap: 8 }}>
            <SectionHeader title="Sell old appliances" action="See all" onAction={() => nav.navigate('Prices')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {appliances.map((p) => (
                <Pressable key={p._id} onPress={() => nav.navigate('SellCategory', { preselect: p.category })} accessibilityRole="button" accessibilityLabel={`${catName(p.category)}, ${inr(p.pricePerKg)} per piece`} style={({ pressed }) => ({ width: 96, padding: 8, gap: 2, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, opacity: pressed ? 0.85 : 1 })}>
                  <Image source={categoryMeta(p.category).image} style={{ width: 44, height: 44 }} resizeMode="contain" />
                  <T size={11} w="bold" lh={14} numberOfLines={1}>{catName(p.category)}</T>
                  <T size={12} w="extrabold" color={colors.primary} raw lh={15}>{`${inr(p.pricePerKg)}/pc`}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Recent pickups */}
        <View style={{ gap: 8 }}>
          <SectionHeader title="Your recent pickups" action={recent.length ? 'See all' : undefined} onAction={() => nav.navigate('Main', { screen: 'Requests' })} />
          {recent.length ? (
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }}>
              {recent.map((o, i) => (
                <Pressable key={o._id} onPress={() => nav.navigate('Order', { id: o._id })} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.lineSoft, opacity: pressed ? 0.8 : 1 })}>
                  <Image source={categoryMeta(o.scrapItems?.[0]?.category ?? '').image} style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.bg }} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <T size={13} w="bold" lh={17} numberOfLines={1}>{o.orderType === 'cleaning_service' ? 'Cleaning service' : (o.scrapItems ?? []).map((it: any) => catName(it.category)).join(', ')}</T>
                    <T size={11} color={colors.muted} lh={14} raw>{`#${o.orderNo} · ${whenLabel(o.createdAt)}`}</T>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <T size={13} w="extrabold" color={o.status === 'cancelled' ? colors.faint : colors.deep} raw>{inr(o.totalAmount)}</T>
                    <StatusPill status={o.status} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable onPress={() => nav.navigate('SellCategory')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', backgroundColor: colors.white }}>
              <IconBadge size={32}><Truck size={16} color={colors.primary} /></IconBadge>
              <View style={{ flex: 1 }}>
                <T size={13} w="bold">No pickups yet</T>
                <T size={11} color={colors.muted}>Book your first pickup in 2 minutes</T>
              </View>
              <T size={12} w="bold" color={colors.primary}>Book</T>
            </Pressable>
          )}
        </View>

        {/* Why Scraptox */}
        <View style={{ gap: 8 }}>
          <SectionHeader title="Why Scraptox" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { t: 'Free pickup', d: 'At your doorstep', Icon: Truck, bg: colors.tealSoft, fg: colors.tealText },
              { t: 'Digital weighing', d: 'Weighed in front of you', Icon: Scale, bg: colors.green50, fg: colors.primary },
              { t: 'Verified partners', d: 'KYC-checked collectors', Icon: ShieldCheck, bg: colors.blueSoft, fg: colors.blueText },
              { t: 'Instant payment', d: 'UPI or Scraptox wallet', Icon: Zap, bg: colors.goldSoft, fg: colors.goldText },
            ].map((f) => (
              <View key={f.t} style={{ width: Math.floor((width - 24 - 8) / 2), flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <f.Icon size={16} color={f.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <T size={12} w="extrabold" lh={15} numberOfLines={1}>{f.t}</T>
                  <T size={10} color={colors.muted} lh={13} numberOfLines={1}>{f.d}</T>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Cleaning services */}
        <Pressable onPress={() => nav.navigate('Cleaning')} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: '#EEEAFE', opacity: pressed ? 0.9 : 1 })}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} color="#4A33A8" />
          </View>
          <View style={{ flex: 1 }}>
            <T size={10} w="extrabold" color="#4A33A8">NEW ON SCRAPTOX</T>
            <T size={14} w="extrabold" color="#2B1D6B" lh={18}>Home &amp; office cleaning</T>
            <T size={11} color="#4A33A8" numberOfLines={1}>Deep cleaning, debris and store-room clearing</T>
          </View>
          <ArrowRight size={16} color="#4A33A8" />
        </Pressable>

        <T size={10} color={colors.faint} center lh={14}>Rates are updated daily. The final amount is set by digital weighing at your door.</T>
      </ScrollView>
    </Screen>
  );
}

/** The eight most-sold categories for the home grid (admin order as fallback, no repeated photos). */
const POPULAR = ['Newspaper', 'Copper', 'E-waste', 'Plastic', 'Split AC', 'Steel', 'Iron', 'Aluminium'];
function homePicks(prices: Price[]): Price[] {
  const byName = (n: string) => prices.find((p) => p.category.toLowerCase() === n.toLowerCase());
  const picked = POPULAR.map(byName).filter(Boolean) as Price[];
  for (const p of prices) {
    if (picked.length >= 8) break;
    if (!picked.includes(p) && !picked.some((q) => categoryMeta(q.category).image === categoryMeta(p.category).image)) picked.push(p);
  }
  return picked.slice(0, 8);
}

/** Horizontal fade from the banner tint into the photo. */
function SideFade() {
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {[1, 0.85, 0.65, 0.45, 0.25, 0.1].map((o, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: colors.green50, opacity: o }} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- Categories */

const FAMILIES: (FamilyKey | 'all')[] = ['all', 'metals', 'paper', 'plastic', 'ewaste', 'appliances', 'vehicles', 'other'];

export function CategoriesScreen({ navigation }: P<'Categories'>) {
  const { prices } = useStore();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [fam, setFam] = useState<FamilyKey | 'all'>('all');
  const list = useMemo(
    () => prices.filter((p) => (fam === 'all' || categoryMeta(p.category).family === fam) && p.category.toLowerCase().includes(q.trim().toLowerCase())),
    [prices, q, fam],
  );
  return (
    <Screen>
      <AppBar title="All categories">
        <View style={{ height: 44, borderRadius: radius.md, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
          <Search size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search copper, newspaper, AC…" placeholderTextColor={colors.faint} style={{ flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, color: colors.ink, paddingVertical: 0 }} />
          {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8}><X size={18} color={colors.muted} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FAMILIES.map((f) => (
            <Chip key={f} dark label={f === 'all' ? 'All' : family[f].label} active={fam === f} onPress={() => setFam(f)} />
          ))}
        </ScrollView>
      </AppBar>
      <FlatList
        data={list}
        keyExtractor={(p) => p._id}
        numColumns={4}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item }) => <CategoryTile price={item} width={Math.floor((width - 24 - 3 * 8) / 4)} onPress={() => navigation.navigate('SellCategory', { preselect: item.category })} />}
        ListEmptyComponent={<EmptyState icon={<Search size={30} color={colors.primary} />} title="Nothing found" text="Try another word, or pick “Other” in the sell flow and describe it in the notes." />}
        ListHeaderComponent={
          <Card tone="green" onPress={() => navigation.navigate('Cleaning')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <IconBadge tone="blue"><Sparkles size={18} color={colors.blueText} /></IconBadge>
            <View style={{ flex: 1 }}>
              <T size={14} w="extrabold">Cleaning services</T>
              <T size={12} color={colors.muted}>Home, office, debris and store-room clearing</T>
            </View>
            <ArrowRight size={18} color={colors.primary} />
          </Card>
        }
      />
    </Screen>
  );
}

/* ----------------------------------------------------------------- Prices */

export function PricesScreen({ navigation }: P<'Prices'>) {
  const { prices, loadPrices } = useStore();
  const [q, setQ] = useState('');
  const list = prices.filter((p) => p.category.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Screen>
      <AppBar title="Market rates" subtitle="Updated today, 9:00 AM · Delhi NCR">
        <View style={{ height: 44, borderRadius: radius.md, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
          <Search size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search a material" placeholderTextColor={colors.faint} style={{ flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, color: colors.ink, paddingVertical: 0 }} />
        </View>
      </AppBar>
      <FlatList
        data={list}
        keyExtractor={(p) => p._id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadPrices} colors={[colors.primary]} />}
        ListHeaderComponent={<T size={12} color={colors.muted} style={{ marginBottom: 10 }}>Final amount is set by digital weighing at your door.</T>}
        renderItem={({ item, index }) => <PriceRow p={item} first={index === 0} last={index === list.length - 1} onPress={() => navigation.navigate('SellCategory', { preselect: item.category })} />}
      />
    </Screen>
  );
}

function PriceRow({ p, first, last, onPress }: { p: Price; first: boolean; last: boolean; onPress: () => void }) {
  const meta = categoryMeta(p.category);
  const ch = p.change ?? 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: first ? 1 : 0, borderBottomWidth: 1, borderColor: colors.line, borderBottomColor: last ? colors.line : colors.lineSoft, borderTopLeftRadius: first ? radius.lg : 0, borderTopRightRadius: first ? radius.lg : 0, borderBottomLeftRadius: last ? radius.lg : 0, borderBottomRightRadius: last ? radius.lg : 0 }}>
      <Image source={meta.image} style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: family[meta.family].bg }} />
      <View style={{ flex: 1 }}>
        <T size={15} w="bold">{catName(p.category)}</T>
        <T size={12} color={colors.muted} numberOfLines={1}>{meta.hint}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T size={15} w="extrabold" raw>{`${inr(p.pricePerKg)}/${unitOf(p)}`}</T>
        {ch ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            {ch > 0 ? <TrendingUp size={12} color={colors.primary} /> : <TrendingDown size={12} color={colors.red} />}
            <T size={12} w="bold" color={ch > 0 ? colors.primary : colors.red} raw>{`${Math.abs(ch).toFixed(1)}%`}</T>
          </View>
        ) : <T size={12} color={colors.faint}>No change</T>}
      </View>
    </Pressable>
  );
}

/* ---------------------------------------------------------- Notifications */

export function NotificationsScreen({ navigation }: P<'Notifications'>) {
  const q = useQuery<{ notifications: any[] }>('/notifications');
  const list = q.data?.notifications ?? [];
  const markRead = useRef(false);
  React.useEffect(() => {
    if (!markRead.current && (q.data?.notifications ?? []).some((n) => !n.read)) {
      markRead.current = true;
      api('/notifications/read', { method: 'PUT' }).catch(() => {});
    }
  }, [q.data]);
  const icon = (t: string) =>
    t === 'payment' ? <IconBadge tone="gold"><IndianRupee size={18} color={colors.goldText} /></IconBadge>
      : t === 'promotion' ? <IconBadge tone="blue"><TrendingUp size={18} color={colors.blueText} /></IconBadge>
        : <IconBadge><Truck size={18} color={colors.primary} /></IconBadge>;
  return (
    <Screen>
      <AppBar title="Notifications" />
      <FlatList
        data={list}
        keyExtractor={(n) => n._id}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={q.reload} colors={[colors.primary]} />}
        ListEmptyComponent={q.loading ? undefined : <EmptyState icon={<BellOff size={30} color={colors.primary} />} title="No notifications yet" text="Pickup updates, payments and rate alerts will show up here." />}
        renderItem={({ item }) => (
          <Card onPress={item.orderId ? () => navigation.navigate('Order', { id: item.orderId }) : undefined} style={{ flexDirection: 'row', gap: 12, backgroundColor: item.read ? colors.white : '#F6FBF8' }}>
            {icon(item.type)}
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T size={14} w="bold" style={{ flex: 1 }}>{item.title}</T>
                <T size={12} color={colors.faint}>{ago(item.createdAt)}</T>
              </View>
              <T size={13} color={colors.ink2} lh={18}>{item.message}</T>
            </View>
            {!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 4 }} /> : null}
          </Card>
        )}
      />
    </Screen>
  );
}

export { Logo };
