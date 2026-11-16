/**
 * Partner onboarding, in the web app's order: KYC upload → KYC status →
 * subscription plan. Pickups and bids open once KYC is verified and a plan is
 * active (the backend enforces the same rules).
 */
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, Check, CircleAlert, Clock, IdCard, ImagePlus, LogOut, ShieldCheck, Ticket, UserRound } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import { AppBar, BottomBar, Button, Card, DemoNote, Field, Loading, RadioDot, Screen, Sheet, Tag } from '../components/ui';
import { IconBadge } from '../components/brand';
import { colors, radius } from '../theme';
import { api, postForm } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { Plan, useStore } from '../store/AppStore';
import { images } from '../data/catalog';
import { dateLabel, inr } from '../utils/format';
import { Photo, pickPhotos, takePhoto } from '../utils/media';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/** True once the partner is past onboarding (these screens are then opened from Profile). */
const inMain = (u: any) => u?.kyc?.status === 'verified' && u?.subscription?.status === 'active';

const PLAN_IMAGE: Record<string, any> = { planSilver: images.planSilver, planGold: images.planGold, planPlatinum: images.planPlatinum };

function LogoutLink() {
  const { logout } = useStore();
  return (
    <Pressable onPress={() => Alert.alert('Log out?', 'You can log in again with your mobile number.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: logout }])} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 }}>
      <LogOut size={16} color={colors.muted} />
      <T size={13} w="bold" color={colors.muted}>Log out</T>
    </Pressable>
  );
}

/** Onboarding progress: KYC → review → plan. */
function OnboardSteps({ at }: { at: 0 | 1 | 2 }) {
  const steps = ['Upload KYC', 'Verification', 'Choose plan'];
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {steps.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= at ? colors.deep : colors.line }} />
          <T size={11} w={i === at ? 'extrabold' : 'semibold'} color={i <= at ? colors.deep : colors.faint}>{s}</T>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------- KYC upload */

function DocSlot({ title, hint, photo, onPick, Icon, required, front }: { title: string; hint: string; photo: Photo | null; onPick: (p: Photo | null) => void; Icon: typeof IdCard; required?: boolean; front?: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = async (camera: boolean) => {
    setOpen(false);
    try {
      const p = camera ? await takePhoto(front) : (await pickPhotos(1))[0] ?? null;
      if (p) onPick(p);
    } catch (e: any) {
      Alert.alert('Could not add the photo', e.message);
    }
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${title}, ${photo ? 'added' : 'not added'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: photo ? 1 : 1.5, borderStyle: photo ? 'solid' : 'dashed', borderColor: photo ? colors.green200 : colors.lineStrong, backgroundColor: colors.white }}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.bg }} />
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={26} color={colors.deep} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={14} w="bold">{title}</T>
            {!required ? <Tag tone="grey" label="Optional" /> : null}
          </View>
          <T size={12} color={colors.muted} lh={16}>{hint}</T>
        </View>
        {photo ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={14} color={colors.white} strokeWidth={3.4} />
          </View>
        ) : (
          <T size={13} w="bold" color={colors.primary}>Add</T>
        )}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={{ gap: 10 }}>
          <Button label={front ? 'Take a selfie' : 'Take a photo'} variant="deep" icon={<Camera size={18} color={colors.white} />} onPress={() => pick(true)} />
          <Button label="Choose from gallery" variant="outline" icon={<ImagePlus size={18} color={colors.primary} />} onPress={() => pick(false)} />
          {photo ? <Button label="Remove photo" variant="danger" onPress={() => { onPick(null); setOpen(false); }} /> : null}
        </View>
      </Sheet>
    </>
  );
}

export function KycScreen({ navigation }: P<'Kyc'>) {
  const { user, refreshMe } = useStore();
  const [aadhaar, setAadhaar] = useState('');
  const [front, setFront] = useState<Photo | null>(null);
  const [selfie, setSelfie] = useState<Photo | null>(null);
  const [licence, setLicence] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = aadhaar.replace(/\D/g, '');
  const rejected = user?.kyc?.status === 'rejected';
  const ready = digits.length === 12 && !!front && !!selfie;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await postForm('/kyc', { aadhaarNumber: digits }, { aadhaar: front, selfie, license: licence });
      await refreshMe();
      navigation.navigate('KycStatus');
    } catch (e: any) {
      Alert.alert('Could not submit KYC', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppBar title="Verify your identity" subtitle={`Hi ${user?.name?.split(' ')[0] ?? ''}`} back={inMain(user) && navigation.canGoBack()} right={<LogoutLink />}>
        <OnboardSteps at={0} />
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {rejected ? (
          <Card style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.redSoft, borderColor: colors.redLine }}>
            <CircleAlert size={18} color={colors.red} />
            <View style={{ flex: 1, gap: 2 }}>
              <T size={14} w="bold" color={colors.redText}>Your KYC was not approved</T>
              <T size={12} color={colors.redText}>{user?.kyc?.rejectionReason ?? 'Please upload clear photos and try again.'}</T>
            </View>
          </Card>
        ) : null}
        <Card tone="green" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconBadge><ShieldCheck size={20} color={colors.deep} /></IconBadge>
          <T size={13} color={colors.deep} lh={18} style={{ flex: 1 }}>Customers only see KYC-verified partners. Your Aadhaar number is stored encrypted and is never shown to customers.</T>
        </Card>
        <Field
          label="Aadhaar number"
          value={digits.replace(/(\d{4})(?=\d)/g, '$1 ')}
          onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))}
          keyboardType="number-pad"
          placeholder="XXXX XXXX XXXX"
          error={digits.length > 0 && digits.length < 12 ? 'Please enter a valid 12-digit Aadhaar number' : undefined}
        />
        <DocSlot title="Aadhaar card photo" hint="Front side, all four corners visible, no glare" photo={front} onPick={setFront} Icon={IdCard} required />
        <DocSlot title="Selfie" hint="Face the camera in good light, no cap or sunglasses" photo={selfie} onPick={setSelfie} Icon={UserRound} required front />
        <DocSlot title="Driving licence" hint="Needed if you drive a tempo or truck" photo={licence} onPick={setLicence} Icon={IdCard} />
        <DemoNote text="Demo build: KYC is approved by itself a few seconds after you submit." />
      </ScrollView>
      <BottomBar>
        <Button variant="deep" label="Submit for verification" disabled={!ready} loading={busy} onPress={submit} />
      </BottomBar>
    </Screen>
  );
}

/* -------------------------------------------------------------- KYC status */

export function KycStatusScreen({ navigation }: P<'KycStatus'>) {
  const { user, refreshMe } = useStore();
  const status = user?.kyc?.status ?? 'not_submitted';
  const hasPlan = user?.subscription?.status === 'active';

  // Check for a decision while the screen is open (the web app polled too).
  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(refreshMe, 3000);
    return () => clearInterval(t);
  }, [status, refreshMe]);

  const steps = [
    { label: 'Documents submitted', sub: user?.kyc?.submittedAt ? dateLabel(user.kyc.submittedAt) : '', done: status !== 'not_submitted' },
    { label: 'Under review', sub: status === 'pending' ? 'Usually within 24 hours' : '', done: status === 'verified' },
    { label: 'Approved', sub: user?.kyc?.verifiedAt ? dateLabel(user.kyc.verifiedAt) : '', done: status === 'verified' },
  ];

  return (
    <Screen>
      <AppBar title="KYC status" back={inMain(user) && navigation.canGoBack()} right={hasPlan ? undefined : <LogoutLink />}>
        {!hasPlan ? <OnboardSteps at={status === 'verified' ? 2 : 1} /> : null}
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {status === 'verified' ? (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
            <Image source={images.kycApproved} style={{ width: 150, height: 150, borderRadius: 20 }} />
            <T size={20} w="extrabold" center>KYC verified</T>
            <T size={13} color={colors.muted} center>{`Approved ${dateLabel(user?.kyc?.verifiedAt)} · valid for all pickups`}</T>
          </Card>
        ) : status === 'rejected' ? (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
            <IconBadge tone="red" size={64}><CircleAlert size={30} color={colors.red} /></IconBadge>
            <T size={20} w="extrabold" center>KYC not approved</T>
            <T size={13} color={colors.muted} center>{user?.kyc?.rejectionReason ?? 'Please upload clear photos and try again.'}</T>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
            <IconBadge tone="gold" size={64}><Clock size={30} color={colors.goldText} /></IconBadge>
            <T size={20} w="extrabold" center>We're checking your documents</T>
            <T size={13} color={colors.muted} center lh={19}>You'll get a notification when it's done. You can close the app meanwhile.</T>
          </Card>
        )}
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {steps.map((s, i) => (
            <View key={s.label} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'center' }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: s.done ? colors.brand : colors.bg, borderWidth: s.done ? 0 : 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                {s.done ? <Check size={14} color={colors.white} strokeWidth={3.4} /> : <T size={11} w="bold" color={colors.muted} raw>{String(i + 1)}</T>}
              </View>
              <View style={{ flex: 1 }}>
                <T size={14} w="bold" color={s.done ? colors.ink : colors.muted}>{s.label}</T>
                {s.sub ? <T size={12} color={colors.muted}>{s.sub}</T> : null}
              </View>
            </View>
          ))}
        </Card>
        {status !== 'not_submitted' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[['Aadhaar', true], ['Selfie', true], ['Licence', !!user?.kyc?.licenseUrl]].map(([l, on]) => (
              <Tag key={String(l)} tone={on ? 'green' : 'grey'} label={`${on ? '✓' : '–'} ${l}`} />
            ))}
            {user?.kyc?.aadhaarLast4 ? <Tag tone="grey" label={`Aadhaar •••• ${user.kyc.aadhaarLast4}`} /> : null}
          </View>
        ) : null}
      </ScrollView>
      {status === 'verified' && !hasPlan ? (
        <BottomBar>
          <Button variant="deep" label="Choose a plan" onPress={() => navigation.navigate('Plans')} />
        </BottomBar>
      ) : status === 'rejected' || status === 'not_submitted' ? (
        <BottomBar>
          <Button variant="deep" label="Upload documents again" onPress={() => navigation.navigate('Kyc')} />
        </BottomBar>
      ) : null}
    </Screen>
  );
}

/* ------------------------------------------------------------------ Plans */

const per = (p: Plan) => (p.durationType === 'quarterly' ? '/ 3 months' : p.durationType === 'yearly' ? '/ year' : p.durationType === 'daily' ? '/ day' : p.duration > 1 ? `/ ${p.duration} months` : '/ month');

export function PlansScreen({ navigation }: P<'Plans'>) {
  const { user, refreshMe } = useStore();
  const [kind, setKind] = useState<'general' | 'market_price'>('general');
  const q = useQuery<{ plans: Plan[] }>('/subscriptions/plans', { type: kind });
  const plans = q.data?.plans ?? [];
  const current = kind === 'general' ? user?.subscription : user?.marketSubscription;
  const [sel, setSel] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; finalAmount: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const onboarding = user?.subscription?.status !== 'active';

  useEffect(() => {
    const ps = q.data?.plans ?? [];
    if (!ps.length) return;
    setSel((s) => (s && ps.some((p) => p._id === s) ? s : ps.find((p) => p.isPopular)?._id ?? ps[0]._id));
  }, [q.data]);
  useEffect(() => setCoupon(null), [sel]);

  const plan = plans.find((p) => p._id === sel);
  const amount = coupon ? coupon.finalAmount : plan?.price ?? 0;
  const isCurrent = !!plan && current?.status === 'active' && current.planId === plan._id;

  const apply = async () => {
    if (!plan || !code.trim()) return;
    setChecking(true);
    try {
      const r = await api('/subscriptions/validate-coupon', { method: 'POST', body: { planId: plan._id, code: code.trim() } });
      setCoupon(r.data);
    } catch (e: any) {
      setCoupon(null);
      Alert.alert('Coupon not applied', e.message);
    } finally {
      setChecking(false);
    }
  };

  const pay = async () => {
    if (!plan) return;
    setPaying(true);
    try {
      const o = await api('/subscriptions/subscribe', { method: 'POST', body: { planId: plan._id, couponCode: coupon?.code } });
      // Real build: open Razorpay Checkout with o.data.razorpayOrderId, then verify with its signature.
      await api('/subscriptions/verify-payment', { method: 'POST', body: { planId: plan._id, couponCode: coupon?.code, razorpay_order_id: o.data.razorpayOrderId } });
      setPayOpen(false);
      const me = await refreshMe();
      if (!onboarding || kind === 'market_price') {
        Alert.alert(`${plan.name} plan active`, me?.subscription?.expiryDate ? `Valid till ${dateLabel((kind === 'general' ? me.subscription : me.marketSubscription)?.expiryDate)}.` : 'Your plan is active.');
        if (navigation.canGoBack()) navigation.goBack();
      }
    } catch (e: any) {
      Alert.alert('Payment failed', e.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Screen>
      <AppBar title={onboarding ? 'Choose a plan' : 'Plans'} back={inMain(user) && navigation.canGoBack()} right={onboarding ? <LogoutLink /> : undefined}>
        {onboarding ? <OnboardSteps at={2} /> : null}
        <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: 4 }}>
          {([['general', 'Pickup plans'], ['market_price', 'Market price add-on']] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} style={{ flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === k ? colors.white : 'transparent' }}>
              <T size={13} w={kind === k ? 'extrabold' : 'semibold'} color={kind === k ? colors.deep : colors.muted}>{l}</T>
            </Pressable>
          ))}
        </View>
      </AppBar>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <T size={13} color={colors.muted} lh={19}>
          {kind === 'general' ? 'A plan is needed to accept pickups. Gold and Platinum also let you bid on bulk lots.' : 'Optional add-on: daily mandi rates so you know what to pay and where to sell.'}
        </T>
        {current?.status === 'active' ? (
          <Card tone="green" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={18} color={colors.deep} />
            <T size={13} w="bold" color={colors.deep} style={{ flex: 1 }}>{`${current.plan?.name ?? 'Plan'} active till ${dateLabel(current.expiryDate)}`}</T>
          </Card>
        ) : null}
        {q.loading && !plans.length ? <Loading /> : null}
        {plans.map((p) => {
          const on = sel === p._id;
          const mine = current?.status === 'active' && current.planId === p._id;
          return (
            <Pressable key={p._id} onPress={() => setSel(p._id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ borderRadius: radius.lg, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.deep : colors.line, backgroundColor: on ? colors.green50 : colors.white, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={PLAN_IMAGE[p.image ?? 'planGold'] ?? images.planGold} style={{ width: 48, height: 48, borderRadius: 12 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <T size={16} w="extrabold">{p.name}</T>
                    {p.isPopular ? <Tag tone="gold" label="MOST PICKED" /> : null}
                    {mine ? <Tag label="CURRENT" /> : null}
                  </View>
                  <T size={12} color={colors.muted}>{p.description}</T>
                </View>
                <RadioDot on={on} color={colors.deep} />
              </View>
              <View style={{ gap: 5 }}>
                {p.features.map((f) => (
                  <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Check size={14} color={colors.brand} strokeWidth={3} />
                    <T size={13} color={colors.ink2}>{f}</T>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <T size={22} w="extrabold" color={colors.deep} raw>{inr(p.price)}</T>
                <T size={12} color={colors.muted}>{per(p)}</T>
              </View>
            </Pressable>
          );
        })}
        {plan ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setCoupon(null); }} placeholder="Coupon code" autoCapitalize="characters" left={<Ticket size={18} color={colors.muted} />} hint={coupon ? `${inr(coupon.discount)} off applied` : undefined} />
            </View>
            <Button label="Apply" full={false} variant="outline" disabled={!code.trim() || !!coupon} loading={checking} onPress={apply} style={{ height: 52 }} />
          </View>
        ) : null}
        <T size={12} color={colors.muted} center>Secure payment by Razorpay · UPI, cards, net banking</T>
      </ScrollView>
      <BottomBar>
        <Button
          variant="deep"
          label={!plan ? 'Choose a plan' : isCurrent ? `Renew ${plan.name} · pay ${inr(amount)}` : `Get ${plan.name} · pay ${inr(amount)}`}
          disabled={!plan}
          onPress={() => setPayOpen(true)}
        />
      </BottomBar>
      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Confirm payment">
        {plan ? (
          <View style={{ gap: 14 }}>
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={14} w="bold">{`${plan.name} plan`}</T>
                <T size={14} w="bold" raw>{inr(plan.price)}</T>
              </View>
              {coupon ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={13} color={colors.primary} raw>{`Coupon ${coupon.code}`}</T>
                  <T size={13} w="bold" color={colors.primary} raw>{`−${inr(coupon.discount)}`}</T>
                </View>
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.lineSoft }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={15} w="extrabold">To pay</T>
                <T size={15} w="extrabold" color={colors.deep} raw>{inr(amount)}</T>
              </View>
            </Card>
            <DemoNote text="Demo build: no real payment is taken. The live app opens Razorpay here." />
            <Button variant="deep" label={`Pay ${inr(amount)}`} loading={paying} onPress={pay} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
