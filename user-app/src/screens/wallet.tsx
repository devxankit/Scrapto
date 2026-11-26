import React, { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowDownLeft, ArrowUpRight, Building2, Gift, Plus, RotateCw, Ticket, Wallet as WalletIcon } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, Chip, DemoNote, EmptyState, Field, Loading, RadioDot, Screen, Sheet, Tag } from '../components/ui';
import { IconBadge } from '../components/brand';
import { colors, radius } from '../theme';
import { api } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { dateLabel, inr } from '../utils/format';
import { Alert } from '../i18n/Alert';
import { tx as translate } from '../i18n/auto';
import type { RootParams } from '../navigation/RootNavigator';
import { openRazorpay, PaymentCancelled } from '../api/razorpay';
import { useStore } from '../store/AppStore';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/** Readable titles for backend wallet transaction categories. */
const TX_TITLES: Record<string, string> = {
  payment_received: 'Pickup payment',
  payment_sent: 'Paid to customer',
  withdrawal: 'Withdrawal',
  withdrawal_refund: 'Withdrawal refunded',
  recharge: 'Money added',
  wallet_recharge: 'Money added',
  referral_bonus: 'Referral reward',
  referral: 'Referral reward',
  coupon: 'Coupon cashback',
  cashback: 'Cashback',
  subscription: 'Plan purchase',
  refund: 'Refund',
  adjustment: 'Adjustment',
  coupon_credit: 'Coupon cashback',
  commission: 'Platform fee',
};

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

export function WalletScreen({ navigation }: P<'Wallet'>) {
  const w = useQuery<any>('/wallet/profile');
  const tx = useQuery<{ transactions: any[] }>('/wallet/transactions');
  const [addOpen, setAddOpen] = useState(false);
  const reload = () => {
    w.reload();
    tx.reload();
  };
  return (
    <Screen>
      <AppBar title="Wallet" right={<T size={13} w="bold" color={colors.primary} onPress={() => navigation.navigate('Coupons')} style={{ padding: 6 }}>Coupons</T>} />
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
                {w.data?.pendingClearance ? <T size={12} color={colors.green100} raw>{`${inr(w.data.pendingClearance)} clearing`}</T> : <T size={12} color={colors.green100}>Pickup payments land here instantly</T>}
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
        ListEmptyComponent={tx.loading ? <Loading /> : <EmptyState icon={<WalletIcon size={30} color={colors.primary} />} title="No transactions yet" text="Money from pickups, referrals and cashback shows up here." />}
        renderItem={({ item, index }) => {
          const list = tx.data?.transactions ?? [];
          // Backend sends type CREDIT/DEBIT and category like PAYMENT_RECEIVED, with no title.
          const out = String(item.type).toLowerCase() === 'debit';
          const cat = String(item.category ?? '').toLowerCase();
          const gift = cat.includes('referral') || cat.includes('coupon') || cat.includes('cashback');
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

export function CouponsScreen() {
  const q = useQuery<{ coupons: any[] }>('/wallet/coupons');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async (c: string) => {
    setBusy(true);
    try {
      await api('/wallet/apply-coupon', { method: 'POST', body: { code: c } });
      Alert.alert('Coupon applied', 'The cashback is in your wallet.');
      setCode('');
      q.reload();
    } catch (e: any) {
      Alert.alert('Could not apply', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppBar title="Coupons" />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="Enter coupon code" autoCapitalize="characters" left={<Ticket size={18} color={colors.muted} />} />
          </View>
          <Button label="Apply" full={false} size="lg" variant="outline" disabled={!code.trim()} loading={busy} onPress={() => apply(code.trim())} style={{ height: 52 }} />
        </View>
        {(q.data?.coupons ?? []).map((c) => (
          <Card key={c.code} style={{ flexDirection: 'row', gap: 12, opacity: c.used ? 0.55 : 1 }}>
            <IconBadge tone="gold"><Ticket size={18} color={colors.goldText} /></IconBadge>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={14} w="extrabold">{c.title}</T>
              </View>
              <T size={12} color={colors.muted} lh={17}>{c.description}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <T size={12} w="extrabold" color={colors.goldText} raw>{c.code}</T>
                </View>
                <T size={11} color={colors.muted}>{`Valid till ${dateLabel(c.expiresAt)}`}</T>
              </View>
            </View>
            {c.used ? <Tag tone="grey" label="Used" /> : <T size={13} w="bold" color={colors.primary} onPress={() => apply(c.code)}>Apply</T>}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
