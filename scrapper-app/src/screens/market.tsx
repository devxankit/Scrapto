import React, { useEffect, useState } from 'react';
import { FlatList, Image, RefreshControl, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Clock, Flag, Gavel, MapPin, MessageCircle, Trophy, TrendingUp } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, DemoNote, ErrorBox, Field, Loading, RadioDot, Screen, Sheet, Tag } from '../components/ui';
import { colors, radius } from '../theme';
import { api } from '../api/client';
import { clearQueryCache, useQuery } from '../hooks/useQuery';
import { useStore } from '../store/AppStore';
import { categoryMeta, images, REPORT_REASONS } from '../data/catalog';
import { agoLabel, inr, qty, catName } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/** "5h 12m", "1d 4h", "Closed" */
export function endsIn(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'Closed';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const lotQty = (l: any) => (l.unit === 'pc' ? `× ${l.estimatedWeight}` : l.estimatedWeight >= 1000 ? `${Math.round(l.estimatedWeight / 100) / 10} t` : `~${qty(l.estimatedWeight)}`);

/* ------------------------------------------------------------- Market tab */

export function MarketScreen() {
  const nav = useNavigation();
  const [tab, setTab] = useState<'open' | 'mine' | 'won'>('open');
  const q = useQuery<{ requests: any[] }>('/marketplace/requests', { tab });
  const list = q.data?.requests ?? [];
  return (
    <Screen>
      <AppBar title="Marketplace" subtitle="Bulk lots from shops, offices and factories" back={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['open', 'Open lots'], ['mine', 'My bids'], ['won', 'Won']] as const).map(([k, l]) => (
            <Chip key={k} label={l} active={tab === k} dark onPress={() => setTab(k)} />
          ))}
        </View>
      </AppBar>
      <FlatList
        data={list}
        keyExtractor={(l) => l._id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={q.reload} colors={[colors.primary]} />}
        contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
        ListEmptyComponent={q.loading ? <Loading /> : (
          <View style={{ alignItems: 'center', paddingTop: 30, gap: 8, paddingHorizontal: 24 }}>
            <Image source={images.emptyBids} style={{ width: 170, height: 170, borderRadius: 24 }} />
            <T size={17} w="extrabold" center>{tab === 'open' ? 'No open lots right now' : tab === 'mine' ? 'No bids yet' : 'No lots won yet'}</T>
            <T size={13} color={colors.muted} center>{tab === 'open' ? 'New bulk lots are posted every day. Check back soon.' : 'Bid on an open lot. The seller picks the best offer.'}</T>
          </View>
        )}
        renderItem={({ item: l }) => (
          <Card onPress={() => nav.navigate('Lot', { id: l._id })} style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
              <Image source={categoryMeta(l.category).image} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: colors.bg }} />
              <View style={{ flex: 1, gap: 3 }}>
                <T size={15} w="extrabold" numberOfLines={2} lh={19}>{l.title}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} color={colors.muted} />
                  <T size={12} color={colors.muted} numberOfLines={1} raw style={{ flex: 1 }}>{`${l.unit === 'pc' ? `${l.estimatedWeight} pcs` : lotQty(l)} · ${l.location.area} · ${l.location.distanceKm} km`}</T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <T size={13} w="extrabold" color={colors.deep} raw>{l.highestBid ? `Top bid ${inr(l.highestBid)}` : 'No bids yet'}</T>
                  {l.won ? <Tag label="YOU WON" /> : l.myBid ? <Tag tone={l.isLeading ? 'green' : 'gold'} label={l.isLeading ? 'YOU LEAD' : 'OUTBID'} /> : null}
                </View>
              </View>
              {l.status === 'open' ? (
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Clock size={14} color={colors.goldText} />
                  <T size={12} w="extrabold" color={colors.goldText} raw>{endsIn(l.endsAt)}</T>
                </View>
              ) : null}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

/* -------------------------------------------------------------------- Lot */

export function LotScreen({ route, navigation }: P<'Lot'>) {
  const { user } = useStore();
  const q = useQuery<{ request: any }>(`/marketplace/requests/${route.params.id}`);
  const [lot, setLot] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (q.data?.request) setLot(q.data.request);
  }, [q.data]);
  // Keep the countdown fresh.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!lot) {
    return (
      <Screen>
        <AppBar title="Bulk lot" />
        {q.error ? <ErrorBox text={q.error.message} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const n = Number(amount);
  const floor = Math.max(lot.myBid?.amount ?? 0, 0);
  const bids = [...lot.bids].sort((a: any, b: any) => b.amount - a.amount);
  const open = lot.status === 'open';
  const canBid = open && n > floor;
  const step = lot.highestBid && lot.highestBid >= 20000 ? 1000 : 250;

  const place = async () => {
    setBusy(true);
    try {
      const r = await api(`/marketplace/requests/${lot._id}/bids`, { method: 'POST', body: { amount: n, message: note.trim() || undefined } });
      setLot(r.data.request);
      setAmount('');
      clearQueryCache();
      Alert.alert(lot.myBid ? 'Bid raised' : 'Bid placed', r.data.request.isLeading ? 'You have the highest bid right now.' : 'Another partner has a higher bid. You can raise yours any time before it closes.');
    } catch (e: any) {
      Alert.alert('Could not place the bid', e.message, e.code === 'PLAN_REQUIRED' ? [{ text: 'Cancel', style: 'cancel' }, { text: 'See plans', onPress: () => navigation.navigate('Plans') }] : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppBar title={lot.title} subtitle={`${catName(lot.category)} · ${lot.unit === 'pc' ? `${lot.estimatedWeight} pcs` : lotQty(lot)}`} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Image source={categoryMeta(lot.category).image} style={{ width: '100%', height: 170, backgroundColor: colors.bg }} resizeMode="cover" />
          <View style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {open ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.goldSoft }}>
                  <Clock size={13} color={colors.goldText} />
                  <T size={12} w="extrabold" color={colors.goldText} raw>{`Ends in ${endsIn(lot.endsAt)}`}</T>
                </View>
              ) : lot.won ? <Tag label="YOU WON THIS LOT" /> : <Tag tone="grey" label="BIDDING CLOSED" />}
            </View>
            <T size={14} color={colors.ink2} lh={20}>{lot.description}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} color={colors.muted} />
              <T size={13} color={colors.muted} raw>{`${lot.location.area}, ${lot.location.city} · ${lot.location.distanceKm} km`}</T>
            </View>
            <T size={12} color={colors.muted} raw>{`Seller: ${lot.seller.name}`}</T>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['Highest bid', lot.highestBid ? inr(lot.highestBid) : '—'], ['Bids', String(lot.bidCount)], ['Your bid', lot.myBid ? inr(lot.myBid.amount) : '—']].map(([l, v]) => (
            <Card key={l} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12 }}>
              <T size={16} w="extrabold" raw color={l === 'Your bid' && lot.myBid ? (lot.isLeading ? colors.deep : colors.goldText) : colors.ink}>{v}</T>
              <T size={11} w="semibold" color={colors.muted}>{l}</T>
            </Card>
          ))}
        </View>

        {lot.won ? (
          <Card tone="green" style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Trophy size={18} color={colors.deep} />
              <T size={15} w="extrabold" color={colors.deep}>{`You won at ${inr(lot.myBid?.amount ?? 0)}`}</T>
            </View>
            <T size={13} color={colors.ink2}>Chat with the seller to fix the pickup time and payment.</T>
            <Button label="Chat with seller" variant="deep" icon={<MessageCircle size={18} color={colors.white} />} onPress={() => navigation.navigate('ChatThread', { lotId: lot._id, name: lot.seller.name })} />
          </Card>
        ) : null}

        {open ? (
          <Card style={{ gap: 12 }}>
            <T size={15} w="extrabold">{lot.myBid ? 'Raise your bid' : 'Place a bid'}</T>
            <Field value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" placeholder={lot.highestBid ? String(lot.highestBid + step) : 'Your offer'} left={<T size={18} w="bold" color={colors.muted} raw>₹</T>} error={amount && n <= floor ? `More than your current ${inr(floor)}` : undefined} />
            {lot.highestBid ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[1, 2, 4].map((k) => {
                  const v = lot.highestBid + step * k;
                  return <Chip key={k} label={inr(v)} active={n === v} onPress={() => setAmount(String(v))} icon={<TrendingUp size={13} color={n === v ? colors.white : colors.muted} />} />;
                })}
              </View>
            ) : null}
            <Field value={note} onChangeText={setNote} placeholder="Note for the seller (optional), e.g. pickup with loader tomorrow" />
            <Button label={lot.myBid ? 'Raise bid' : 'Place bid'} variant="deep" disabled={!canBid} loading={busy} onPress={place} icon={<Gavel size={18} color={canBid ? colors.white : colors.disabledText} />} />
            {user?.subscription?.planId === 'plan_silver' ? <T size={12} color={colors.goldText}>Bidding needs a Gold or Platinum plan.</T> : null}
          </Card>
        ) : null}

        <T size={17} w="bold" style={{ marginTop: 4 }}>Bids</T>
        <Card style={{ paddingVertical: 4 }}>
          {bids.length ? bids.map((b: any, i: number) => {
            const mine = b.scrapper._id === user?._id;
            return (
              <View key={b._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.lineSoft }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 0 ? colors.goldSoft : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={12} w="extrabold" color={i === 0 ? colors.goldText : colors.muted} raw>{String(i + 1)}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T size={14} w="bold" color={mine ? colors.deep : colors.ink}>{mine ? 'You' : 'Another partner'}</T>
                  <T size={12} color={colors.muted}>{agoLabel(b.createdAt)}</T>
                </View>
                <T size={14} w="extrabold" raw>{inr(b.amount)}</T>
              </View>
            );
          }) : <T size={13} color={colors.muted} style={{ paddingVertical: 12 }}>No bids yet. Be the first.</T>}
        </Card>
        <Pressable onPress={() => setReportOpen(true)} accessibilityRole="button" style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}>
          <Flag size={14} color={colors.red} />
          <T size={13} w="bold" color={colors.red}>Report this lot</T>
        </Pressable>
      </ScrollView>
      {!open && !lot.won ? (
        <BottomBar>
          <Button label="Back to marketplace" variant="outline" onPress={() => navigation.goBack()} />
        </BottomBar>
      ) : null}
      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} lotId={lot._id} />
    </Screen>
  );
}

function ReportSheet({ visible, onClose, lotId }: { visible: boolean; onClose: () => void; lotId: string }) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet visible={visible} onClose={onClose} title="Report this lot">
      <View style={{ gap: 10 }}>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <RadioDot on={reason === r} color={colors.red} />
            <T size={14} w="semibold">{r}</T>
          </Pressable>
        ))}
        <Field value={details} onChangeText={setDetails} multiline placeholder="What happened? (optional)" />
        <DemoNote text="Reports go to the Scraptox team. The seller is not told who reported." />
        <Button
          label="Send report"
          variant="danger"
          disabled={!reason}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const r = await api(`/marketplace/requests/${lotId}/report`, { method: 'POST', body: { reason, details: details.trim() } });
              Alert.alert('Report sent', r.message);
              setReason(null);
              setDetails('');
              onClose();
            } catch (e: any) {
              Alert.alert('Could not send', e.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Sheet>
  );
}
