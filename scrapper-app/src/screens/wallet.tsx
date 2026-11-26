import React, { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ArrowDownLeft, ArrowUpRight, Building2, Gift, Plus, RotateCw, Wallet as WalletIcon } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, DemoNote, EmptyState, Field, Loading, RadioDot, Screen, Sheet } from '../components/ui';
import { IconBadge } from '../components/brand';
import { colors, radius } from '../theme';
import { api } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { catName, dateLabel, inr } from '../utils/format';
import { Alert } from '../i18n/Alert';
import { tx as translate } from '../i18n/auto';
import type { RootParams } from '../navigation/RootNavigator';
import { openRazorpay, PaymentCancelled } from '../api/razorpay';
import { useStore } from '../store/AppStore';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/** Readable titles for backend wallet transaction categories. */
const TX_TITLES: Record<string, string> = {
  payment_received: 'Payment received',
  payment_sent: 'Paid to customer',
  withdrawal: 'Withdrawal',
  recharge: 'Money added',
  coupon_credit: 'Coupon cashback',
  commission: 'Platform fee',
  refund: 'Refund',
  referral_bonus: 'Referral reward',
  subscription: 'Plan purchase',
};

export function WalletScreen() {
  const navigation = useNavigation();
  const w = useQuery<any>('/wallet/profile');
  const tx = useQuery<{ transactions: any[] }>('/wallet/transactions');
  const [addOpen, setAddOpen] = useState(false);
  const reload = () => {
    w.reload();
    tx.reload();
  };
  return (
    <Screen>
      <AppBar title="Partner wallet" back={false} right={<T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('Earnings')} style={{ padding: 6 }}>Earnings ›</T>} />
      <FlatList
        data={tx.data?.transactions ?? []}
        keyExtractor={(t) => t._id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} colors={[colors.primary]} />}
        contentContainerStyle={{ padding: 12, gap: 0, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={{ backgroundColor: colors.deep, borderRadius: radius.xl, padding: 20, gap: 16, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: -40, top: -40, opacity: 0.5 }}>
                <RotateCw size={180} color={colors.deep2} strokeWidth={1.2} />
              </View>
              <View style={{ gap: 4 }}>
                <T size={13} w="semibold" color={colors.green200}>Available balance</T>
                <T size={34} w="extrabold" color={colors.white} raw style={{ letterSpacing: -0.5 }}>{w.data ? inr(w.data.balance, true) : '—'}</T>
                <T size={12} color={colors.green100}>Customers are paid from this wallet at pickup</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Withdraw" variant="white" size="md" icon={<ArrowUpRight size={16} color={colors.deep} strokeWidth={2.6} />} onPress={() => navigation.navigate('Withdraw')} style={{ flex: 1 }} />
                <Pressable onPress={() => setAddOpen(true)} accessibilityRole="button" style={{ flex: 1, height: 44, borderRadius: radius.md + 2, borderWidth: 1.5, borderColor: colors.green400, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Plus size={16} color={colors.white} strokeWidth={2.6} />
                  <T size={14} w="extrabold" color={colors.white}>Add money</T>
                </Pressable>
              </View>
            </View>
            {w.data ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconBadge tone="gold"><T size={11} w="extrabold" color={colors.goldText} raw>UPI</T></IconBadge>
                <View style={{ flex: 1 }}>
                  <T size={14} w="bold" raw>{w.data.upiId}</T>
                  <T size={12} color={colors.muted} raw>{`Withdrawals go here · min ${inr(w.data.minWithdrawal ?? 100)}`}</T>
                </View>
                <T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('Withdraw')}>Edit</T>
              </Card>
            ) : null}
            <T size={17} w="bold" style={{ marginTop: 4 }}>Transactions</T>
          </View>
        }
        ListEmptyComponent={tx.loading ? <Loading /> : <EmptyState icon={<WalletIcon size={30} color={colors.primary} />} title="No transactions yet" text="Top-ups, payments to customers and withdrawals show up here." />}
        renderItem={({ item, index }) => {
          const list = tx.data?.transactions ?? [];
          // Backend sends type CREDIT/DEBIT and category like PAYMENT_SENT, with no title.
          const out = String(item.type).toLowerCase() === 'debit';
          const cat = String(item.category ?? '').toLowerCase();
          const gift = cat.includes('referral') || cat.includes('bonus') || cat.includes('coupon');
          const title = item.title || TX_TITLES[cat] || (out ? 'Money sent' : 'Money received');
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: 1, borderBottomColor: index === list.length - 1 ? colors.line : colors.lineSoft, borderTopLeftRadius: index === 0 ? radius.lg : 0, borderTopRightRadius: index === 0 ? radius.lg : 0, borderBottomLeftRadius: index === list.length - 1 ? radius.lg : 0, borderBottomRightRadius: index === list.length - 1 ? radius.lg : 0 }}>
              <IconBadge tone={out ? 'grey' : gift ? 'gold' : 'green'}>
                {out ? <ArrowUpRight size={18} color={colors.ink2} /> : gift ? <Gift size={18} color={colors.goldText} /> : <ArrowDownLeft size={18} color={colors.primary} />}
              </IconBadge>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">{title}</T>
                <T size={12} color={colors.muted} numberOfLines={1} raw>{[dateLabel(item.createdAt), shortIds(translate(item.description))].filter(Boolean).join(' · ')}</T>
              </View>
              <T size={14} w="extrabold" color={out ? colors.ink : colors.primary} raw>{`${out ? '−' : '+'}${inr(item.amount, true)}`}</T>
            </View>
          );
        }}
      />
      <AddMoneySheet visible={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); reload(); }} />
    </Screen>
  );
}

function AddMoneySheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useStore();
  const [amount, setAmount] = useState('500');
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const pay = async () => {
    setBusy(true);
    try {
      const c = await api('/wallet/recharge/create', { method: 'POST', body: { amount: n } });
      const paid = await openRazorpay({ keyId: c.data.keyId, orderId: c.data.orderId, amountPaise: c.data.amount, description: 'Add money to Scraptox wallet', prefill: { name: user?.name, email: user?.email, contact: user?.phone } });
      await api('/wallet/recharge/verify', { method: 'POST', body: paid });
      onDone();
    } catch (e: any) {
      if (!(e instanceof PaymentCancelled)) Alert.alert('Payment failed', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add money">
      <View style={{ gap: 14 }}>
        <Field label="Amount" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" left={<T size={18} w="bold" color={colors.muted} raw>₹</T>} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[200, 500, 1000, 2000].map((v) => <Chip key={v} label={inr(v)} active={n === v} onPress={() => setAmount(String(v))} />)}
        </View>
        <Button label={`Pay ${inr(n || 0)}`} disabled={!(n >= 10)} loading={busy} onPress={pay} />
      </View>
    </Sheet>
  );
}

export function WithdrawScreen({ navigation }: P<'Withdraw'>) {
  const w = useQuery<any>('/wallet/profile');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState('');
  const [acc, setAcc] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState('');
  const [busy, setBusy] = useState(false);
  const balance = w.data?.balance ?? 0;
  const n = Number(amount);
  const upiId = upi || w.data?.upiId || '';
  const detailsOk = method === 'upi' ? /^[\w.-]+@[\w]+$/.test(upiId) : acc.length >= 9 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) && holder.trim().length > 2;
  const amountErr = amount && n < 100 ? 'Minimum withdrawal is ₹100' : amount && n > balance ? 'More than your balance' : undefined;
  const ok = n >= 100 && n <= balance && detailsOk;

  return (
    <Screen>
      <AppBar title="Withdraw" subtitle={`Balance ${inr(balance, true)}`} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
        <Field label="Amount" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" placeholder="0" error={amountErr} left={<T size={18} w="bold" color={colors.muted} raw>₹</T>} right={<T size={13} w="bold" color={colors.primary} onPress={() => setAmount(String(Math.floor(balance)))}>Max</T>} />
        <View style={{ gap: 10 }}>
          <T size={13} w="semibold" color={colors.ink2}>Send to</T>
          {(['upi', 'bank'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ checked: method === m }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: method === m ? 1.5 : 1, borderColor: method === m ? colors.primary : colors.line, backgroundColor: method === m ? colors.green50 : colors.white }}>
              <RadioDot on={method === m} />
              <IconBadge tone={m === 'upi' ? 'gold' : 'blue'} size={34}>{m === 'upi' ? <T size={10} w="extrabold" color={colors.goldText} raw>UPI</T> : <Building2 size={16} color={colors.blueText} />}</IconBadge>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold">{m === 'upi' ? 'UPI' : 'Bank account'}</T>
                <T size={12} color={colors.muted}>{m === 'upi' ? 'Instant, any UPI app' : 'NEFT/IMPS, within 24 hours'}</T>
              </View>
            </Pressable>
          ))}
        </View>
        {method === 'upi' ? (
          <Field label="UPI ID" value={upiId} onChangeText={setUpi} autoCapitalize="none" placeholder="name@bank" />
        ) : (
          <View style={{ gap: 12 }}>
            <Field label="Account holder name" value={holder} onChangeText={setHolder} autoCapitalize="words" />
            <Field label="Account number" value={acc} onChangeText={(v) => setAcc(v.replace(/\D/g, '').slice(0, 18))} keyboardType="number-pad" />
            <Field label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase().slice(0, 11))} autoCapitalize="characters" placeholder="HDFC0001234" />
          </View>
        )}
      </ScrollView>
      <BottomBar>
        <Button
          label={`Withdraw ${n ? inr(n) : ''}`.trim()}
          disabled={!ok}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              // Backend contract: POST /wallet/withdraw { amount, bankDetails: { upiId } | { accountNumber, ifscCode, accountHolderName } }
              await api('/wallet/withdraw', { method: 'POST', body: { amount: n, bankDetails: method === 'upi' ? { upiId: upiId.trim() } : { accountNumber: acc.trim(), ifscCode: ifsc.trim().toUpperCase(), accountHolderName: holder.trim() } } });
              Alert.alert('Withdrawal requested', method === 'upi' ? 'The money is on its way to your UPI ID.' : 'The money will reach your bank within 24 hours.');
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not withdraw', e.message);
              setBusy(false);
            }
          }}
        />
      </BottomBar>
    </Screen>
  );
}

/* --------------------------------------------------------------- Earnings */

/**
 * The backend counts a scrap pickup as money the partner PAYS the customer
 * (negative) and a cleaning job as income (positive), so the summary is a cash
 * flow, labelled that way here.
 */
/**
 * "…for Order #6b05743ef6c201afd60918b7" -> "…for Order #0918B7" (the order number people
 * see everywhere else in the app). Plain string scan, no regex.
 */
const HEX = '0123456789abcdefABCDEF';
const shortIds = (t?: string) => {
  const s = String(t ?? '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j < s.length && HEX.includes(s[j])) j++;
    const run = j - i;
    const boundaryBefore = i === 0 || !HEX.includes(s[i - 1]);
    if (run === 24 && boundaryBefore) {
      if (!out.endsWith('#')) out += '#';
      out += s.slice(j - 6, j).toUpperCase();
      i = j;
    } else if (run > 0) {
      out += s.slice(i, j);
      i = j;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
};

/**
 * One /scrapper/earnings/history row, in the shape the list shows. The API sends
 * { orderId, userName, scrapType: "copper, iron", weight, amount (signed),
 * completedAt, orderType }; every field is optional here so a missing one can
 * never crash the screen.
 */
function earningRow(h: any) {
  const id = String(h?.orderId ?? h?.id ?? h?._id ?? '');
  const cleaning = h?.orderType === 'cleaning_service';
  const cats = String(h?.scrapType ?? (Array.isArray(h?.items) ? h.items.join(', ') : ''))
    .split(',').map((c) => c.trim()).filter((c) => c && c.toLowerCase() !== 'scrap');
  const kg = Number(h?.weight) > 0 ? `${Number(h.weight)} kg` : '';
  const what = cleaning ? 'Cleaning job' : [cats.map((c) => catName(c)).join(', '), kg].filter(Boolean).join(' · ');
  const amount = Number(h?.amount);
  return {
    customer: h?.userName ?? h?.customer ?? 'Customer',
    orderNo: h?.orderNo ?? (id ? id.slice(-6).toUpperCase() : ''),
    date: h?.completedAt ?? h?.completedDate ?? h?.createdAt,
    what,
    amount: Number.isFinite(amount) ? amount : 0,
  };
}

export function EarningsScreen() {
  const sq = useQuery<{ summary: any }>('/scrapper/earnings/summary');
  const hq = useQuery<{ history: any[] }>('/scrapper/earnings/history');
  const s = sq.data?.summary;
  const history = hq.data?.history ?? [];
  const money = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${inr(Math.abs(v), true)}`;
  return (
    <Screen>
      <AppBar title="Earnings" subtitle="Cash flow from your pickups" />
      <FlatList
        data={history}
        keyExtractor={(h, i) => String(h.id ?? h._id ?? h.orderId ?? i)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { sq.reload(); hq.reload(); }} colors={[colors.primary]} />}
        contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[['Today', s?.today], ['7 days', s?.week], ['This month', s?.month]].map(([l, v]) => (
                <Card key={l as string} style={{ flex: 1, gap: 2, paddingVertical: 12 }}>
                  <T size={11} w="semibold" color={colors.muted}>{l as string}</T>
                  <T size={15} w="extrabold" raw numberOfLines={1}>{s ? money(v as number) : '—'}</T>
                </Card>
              ))}
            </View>
            <Card tone="green" style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <T size={11} w="semibold" color={colors.deep}>Pickups done</T>
                <T size={18} w="extrabold" color={colors.deep} raw>{String(s?.completedOrders ?? '—')}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={11} w="semibold" color={colors.deep}>Your rating</T>
                <T size={18} w="extrabold" color={colors.deep} raw>{s ? `★ ${s.rating}` : '—'}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={11} w="semibold" color={colors.deep}>All time</T>
                <T size={18} w="extrabold" color={colors.deep} raw numberOfLines={1}>{s ? money(s.total) : '—'}</T>
              </View>
            </Card>
            <T size={12} color={colors.muted} lh={17}>− is money you paid customers for scrap. + is income from cleaning jobs and bonuses.</T>
            <T size={17} w="bold" style={{ marginTop: 4 }}>History</T>
          </View>
        }
        ListEmptyComponent={hq.loading ? <Loading /> : <EmptyState icon={<WalletIcon size={30} color={colors.primary} />} title="No completed pickups yet" text="Each completed pickup shows up here with what you paid." />}
        renderItem={({ item, index }) => {
          const row = earningRow(item);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: 1, borderBottomColor: index === history.length - 1 ? colors.line : colors.lineSoft, borderTopLeftRadius: index === 0 ? radius.lg : 0, borderTopRightRadius: index === 0 ? radius.lg : 0, borderBottomLeftRadius: index === history.length - 1 ? radius.lg : 0, borderBottomRightRadius: index === history.length - 1 ? radius.lg : 0 }}>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold" numberOfLines={1} raw>{row.customer}</T>
                <T size={12} color={colors.muted} numberOfLines={1} raw>{[row.orderNo ? `#${row.orderNo}` : '', row.date ? dateLabel(row.date) : '', row.what].filter(Boolean).join(' · ')}</T>
              </View>
              <T size={14} w="extrabold" color={row.amount < 0 ? colors.ink : colors.primary} raw>{money(row.amount)}</T>
            </View>
          );
        }}
      />
    </Screen>
  );
}
