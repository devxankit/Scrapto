import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Image, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ArrowRight, Bell, BellOff, ChevronDown, Gift, IndianRupee, MapPin, PackageCheck, Scale, Search, Sparkles, TrendingDown, TrendingUp, Truck, X } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import Fade from '../components/Fade';
import { AppBar, Avatar, Card, Chip, EmptyState, Screen, SectionHeader } from '../components/ui';
import { CategoryTile, IconBadge, Logo, Price, unitOf } from '../components/brand';
import { colors, family, FamilyKey, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { useQuery } from '../hooks/useQuery';
import { api } from '../api/client';
import { categoryMeta, images } from '../data/catalog';
import { ago, firstName, greeting, inr } from '../utils/format';
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
  const [slide, setSlide] = useState(0);
  const home = addresses.find((a) => a.isDefault) ?? addresses[0];
  const live = orders.data?.orders.find((o) => o.status === 'confirmed' || o.status === 'in_progress' || o.status === 'pending');
  const unread = notes.data?.notifications.some((n) => !n.read);
  const bannerW = width - 32;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (bannerW + 10)));

  return (
    <Screen>
      {/* Header */}
      <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => nav.navigate('Addresses')} accessibilityRole="button" accessibilityLabel="Change pickup address" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconBadge size={36}>
              <MapPin size={18} color={colors.brand} fill={colors.green100} />
            </IconBadge>
            <View style={{ flex: 1 }}>
              <T size={12} w="semibold" color={colors.muted}>{home ? `Pickup at · ${home.label}` : `${greeting()}, ${firstName(user?.name)}`}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={15} w="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{home ? `${home.street.split(',').slice(-1)[0].trim()}, ${home.city}` : 'Add your pickup address'}</T>
                <ChevronDown size={16} color={colors.ink} strokeWidth={2.6} />
              </View>
            </View>
          </Pressable>
          <Pressable onPress={() => nav.navigate('Notifications')} accessibilityRole="button" accessibilityLabel="Notifications" style={{ width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={20} color={colors.ink} />
            {unread ? <View style={{ position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.white }} /> : null}
          </Pressable>
        </View>
        <Pressable onPress={() => nav.navigate('Categories')} accessibilityRole="search" style={{ height: 44, borderRadius: radius.md, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
          <Search size={18} color={colors.muted} />
          <T size={14} color={colors.muted}>Search copper, newspaper, AC…</T>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { orders.reload(); loadPrices(); notes.reload(); }} colors={[colors.primary]} />}>
        {/* Live order */}
        {live ? (
          <Pressable onPress={() => nav.navigate('Order', { id: live._id })} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: colors.deep, borderRadius: radius.lg, padding: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.92 : 1 })}>
            {live.scrapper ? (
              <Avatar source={images.avatarPartner} size={42} ring={colors.green400} />
            ) : (
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.deep2, alignItems: 'center', justifyContent: 'center' }}>
                <Search size={18} color={colors.green200} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T size={12} w="semibold" color={colors.green200} numberOfLines={1}>{`${live.status === 'in_progress' ? 'Pickup on the way' : live.status === 'confirmed' ? 'Pickup accepted' : 'Finding a collector'} · #${live.orderNo}`}</T>
              <T size={15} w="bold" color={colors.white} numberOfLines={1}>
                {live.status === 'in_progress'
                  ? live.tracking?.arrived ? `${firstName(live.scrapper?.name)} is at your door` : `${firstName(live.scrapper?.name)} arrives in ${live.tracking?.etaMin ?? 8} min`
                  : live.status === 'confirmed' ? `${live.scrapper?.name} will pick up` : 'Usually takes under a minute'}
              </T>
            </View>
            <View style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <T size={13} w="bold" color={colors.white}>Track</T>
            </View>
          </Pressable>
        ) : null}

        {/* Banners */}
        <View>
          <ScrollView horizontal pagingEnabled={false} snapToInterval={bannerW + 10} decelerationRate="fast" showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} contentContainerStyle={{ gap: 10 }}>
            {(banners.data?.banners ?? [{ _id: 'x', title: 'Free doorstep pickup', subtitle: 'Weighed at your door, paid on UPI', image: 'bannerPickup', link: 'sell' }]).map((b) => (
              <Pressable
                key={b._id}
                onPress={() => (b.link === 'prices' ? nav.navigate('Prices') : b.link === 'wallet' ? nav.navigate('Wallet') : nav.navigate('SellCategory'))}
                accessibilityRole="button"
                accessibilityLabel={b.title}
                style={{ width: bannerW, height: 168, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.green50 }}>
                <Image source={BANNER_IMAGES[b.image] ?? images.bannerPickup} style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%' }} resizeMode="cover" />
                <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '18%' }}>
                  <SideFade />
                </View>
                <View style={{ position: 'absolute', left: 16, top: 16, bottom: 16, width: '52%', gap: 5 }}>
                  <T size={11} w="extrabold" color={colors.primary}>{b.title.toUpperCase()}</T>
                  <T size={18} w="extrabold" lh={22}>{b.link === 'prices' ? 'Rates checked every morning' : b.link === 'wallet' ? 'Paid before the truck leaves' : 'Sell scrap in 2 minutes'}</T>
                  <T size={12} color={colors.ink2} numberOfLines={2}>{b.subtitle}</T>
                  <View style={{ flex: 1 }} />
                  <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}>
                    <T size={13} w="bold" color={colors.white}>{b.link === 'prices' ? 'See rates' : b.link === 'wallet' ? 'Open wallet' : 'Sell scrap'}</T>
                    <ArrowRight size={14} color={colors.white} strokeWidth={2.6} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 10 }}>
            {(banners.data?.banners ?? [0]).map((_: any, i: number) => (
              <View key={i} style={{ width: i === slide ? 16 : 5, height: 5, borderRadius: 3, backgroundColor: i === slide ? colors.primary : colors.lineStrong }} />
            ))}
          </View>
        </View>

        {/* Rates */}
        <SectionHeader title="Today's rates" action={`See all ${prices.length || ''}`.trim()} onAction={() => nav.navigate('Prices')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {homePicks(prices).map((p) => (
            <CategoryTile key={p._id} price={p} width={Math.floor((width - 32 - 20) / 3)} onPress={() => nav.navigate('SellCategory', { preselect: p.category })} />
          ))}
        </View>

        {/* How it works */}
        <Card style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { n: '1 · BOOK', t: 'Pick items & a slot', Icon: PackageCheck },
            { n: '2 · WEIGH', t: 'Digital scale at your door', Icon: Scale },
            { n: '3 · GET PAID', t: 'UPI or wallet, instantly', Icon: IndianRupee },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i ? <View style={{ width: 1, backgroundColor: colors.line }} /> : null}
              <View style={{ flex: 1, gap: 6 }}>
                <s.Icon size={18} color={colors.brand} />
                <T size={11} w="extrabold" color={colors.primary}>{s.n}</T>
                <T size={12} color={colors.ink2} lh={16}>{s.t}</T>
              </View>
            </React.Fragment>
          ))}
        </Card>

        {/* Cleaning + refer */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Card onPress={() => nav.navigate('Cleaning')} style={{ flex: 1, gap: 8 }}>
            <IconBadge tone="blue"><Sparkles size={18} color={colors.blueText} /></IconBadge>
            <T size={14} w="extrabold">Cleaning services</T>
            <T size={12} color={colors.muted} lh={16}>Home, office and debris clearing</T>
          </Card>
          <Card tone="gold" onPress={() => nav.navigate('Main', { screen: 'Refer' })} style={{ flex: 1, gap: 8 }}>
            <IconBadge tone="gold"><Gift size={18} color={colors.goldText} /></IconBadge>
            <T size={14} w="extrabold" color="#5C3B00">Earn ₹50 per friend</T>
            <T size={12} color={colors.goldText} lh={16}>Share your referral code</T>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The six most-sold categories for the home grid (admin order as fallback, no repeated photos). */
const POPULAR = ['Newspaper', 'Copper', 'E-waste', 'Plastic', 'Split AC', 'Steel'];
function homePicks(prices: Price[]): Price[] {
  const picked = POPULAR.map((n) => prices.find((p) => p.category === n)).filter(Boolean) as Price[];
  for (const p of prices) {
    if (picked.length >= 6) break;
    if (!picked.includes(p) && !picked.some((q) => categoryMeta(q.category).image === categoryMeta(p.category).image)) picked.push(p);
  }
  return picked.slice(0, 6);
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
        numColumns={3}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => <CategoryTile price={item} width={Math.floor((width - 32 - 20) / 3)} onPress={() => navigation.navigate('SellCategory', { preselect: item.category })} />}
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
        contentContainerStyle={{ padding: 16 }}
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
        <T size={15} w="bold">{p.category}</T>
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
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
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
