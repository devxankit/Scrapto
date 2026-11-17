import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StatusBar, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, ChevronDown, Clock, Globe, ShieldCheck, Smartphone } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import Fade from '../components/Fade';
import { Button, DemoNote, Field, IconButton, KeyboardSafe, Sheet, useFocusAfterTransition } from '../components/ui';
import { BackButton } from '../components/ui';
import { Logo } from '../components/brand';
import { colors, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { HOW_HEARD, LANGUAGES, images } from '../data/catalog';
import { phoneLabel } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/* ----------------------------------------------------------------- Splash */

export function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <Image source={images.logoMark} style={{ width: 84, height: 84 }} resizeMode="contain" />
      <T size={26} w="extrabold" raw style={{ letterSpacing: -0.4 }}>Scraptox</T>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
    </View>
  );
}

/* --------------------------------------------------------------- Language */

function LanguageList({ selected, onPick }: { selected: string; onPick: (id: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {LANGUAGES.map((l) => {
        const on = selected === l.id;
        return (
          <Pressable
            key={l.id}
            onPress={() => onPick(l.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={l.en}
            style={{ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.primary : colors.line, backgroundColor: on ? colors.green50 : colors.white }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: on ? colors.primary : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={16} w="bold" color={on ? colors.white : colors.ink2} raw>{l.letter}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={15} w="bold" raw numberOfLines={1}>{l.native}</T>
              <T size={11} color={colors.muted} raw>{l.en}</T>
            </View>
            {on ? <Check size={18} color={colors.primary} strokeWidth={3} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function LanguageScreen() {
  const { setLang } = useStore();
  const { t, i18n } = useTranslation();
  const [sel, setSel] = useState('en');
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 24, gap: 22 }}>
        <Logo size={34} />
        <View style={{ gap: 6 }}>
          <T size={26} w="extrabold" style={{ letterSpacing: -0.4 }}>{t('lang.title')}</T>
          <T size={14} color={colors.muted}>{t('lang.sub')}</T>
        </View>
        <LanguageList
          selected={sel}
          onPick={(id) => {
            setSel(id);
            i18n.changeLanguage(id);
          }}
        />
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button label={t('common.continue')} onPress={() => setLang(sel)} />
      </View>
    </View>
  );
}

export function SettingsLanguagePicker({ onDone }: { onDone: () => void }) {
  const { lang, setLang } = useStore();
  const [sel, setSel] = useState(lang ?? 'en');
  return (
    <View style={{ gap: 16 }}>
      <LanguageList selected={sel} onPick={setSel} />
      <Button
        label="Save"
        onPress={async () => {
          await setLang(sel);
          if ((sel === 'ur') !== (lang === 'ur')) Alert.alert('Restart the app', 'Close and reopen Scraptox to switch the reading direction.');
          onDone();
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ Login */

export function LoginScreen({ navigation }: P<'Login'>) {
  const { requestOtp, lang } = useStore();
  // The hero is dark; the screens pushed on top are white, so the bar flips back when we leave.
  const focused = useIsFocused();
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const digits = phone.replace(/\D/g, '');
  const valid = /^[6-9]\d{9}$/.test(digits);
  const heroH = Math.max(380, Math.round(height * 0.6));
  const current = LANGUAGES.find((l) => l.id === (lang ?? 'en'));

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await requestOtp(digits);
      navigation.navigate('Otp', { phone: digits, isNewUser: r.isNewUser });
    } catch (e: any) {
      Alert.alert('Could not send the code', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardSafe style={{ backgroundColor: colors.deep }}>
      {focused ? <StatusBar barStyle="light-content" /> : <StatusBar barStyle="dark-content" />}
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ height: heroH }}>
          <Image source={images.heroUser} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="A young man smiling at the Scraptox app on his phone" />
          <Fade stops={[[0, '#002814', 0.55], [0.22, '#002814', 0], [0.5, colors.deep, 0], [0.84, colors.deep, 0.92], [1, colors.deep, 1]]} />
          <View style={{ position: 'absolute', top: insets.top + 12, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo pill size={30} />
            <Pressable
              onPress={() => setLangOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Change language, current ${current?.en}`}
              style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,40,20,0.35)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Globe size={16} color={colors.white} />
              <T size={13} w="bold" color={colors.white} raw>{current?.native ?? 'English'}</T>
              <ChevronDown size={14} color={colors.white} strokeWidth={3} />
            </Pressable>
          </View>
          <View style={{ position: 'absolute', top: heroH * 0.4, right: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, elevation: 6 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F4E8', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} color={colors.primary} strokeWidth={2.4} />
            </View>
            <View>
              <T size={13} w="extrabold">KYC-verified collectors</T>
              <T size={11} w="semibold" color={colors.muted}>★ 4.8 average rating</T>
            </View>
          </View>
          <View style={{ position: 'absolute', left: 24, right: 24, bottom: 46, gap: 12 }}>
            <T size={30} w="extrabold" color={colors.white} lh={35} style={{ letterSpacing: -0.6 }}>Turn your scrap into cash, at your doorstep.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
              {['Free pickup', 'Digital weighing', 'Instant UPI'].map((s) => (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Check size={14} color={colors.green400} strokeWidth={3} />
                  <T size={12} w="bold" color={colors.green100}>{s}</T>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ flex: 1, marginTop: -28, backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 24, paddingBottom: Math.max(insets.bottom, 16) + 12, gap: 14 }}>
          <View style={{ gap: 4 }}>
            <T size={19} w="extrabold">{t('phone.title')}</T>
            <T size={13} color={colors.muted}>{t('phone.sub')}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, paddingHorizontal: 14, gap: 10 }}>
            <View style={{ width: 22, height: 15, borderRadius: 2, overflow: 'hidden' }}>
              <View style={{ flex: 1, backgroundColor: '#FF9933' }} />
              <View style={{ flex: 1, backgroundColor: colors.white }} />
              <View style={{ flex: 1, backgroundColor: '#138808' }} />
            </View>
            <T size={16} w="bold" raw>+91</T>
            <View style={{ width: 1, height: 24, backgroundColor: colors.line }} />
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/[^\d ]/g, '').slice(0, 11))}
              keyboardType="number-pad"
              placeholder="Mobile number"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Mobile number"
              returnKeyType="done"
              onSubmitEditing={submit}
              maxFontSizeMultiplier={1.3}
              style={{ flex: 1, fontFamily: 'PlusJakartaSans-Bold', fontSize: 17, color: colors.ink, letterSpacing: 0.6, paddingVertical: 0 }}
            />
            {valid ? (
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={13} color={colors.white} strokeWidth={3.4} />
              </View>
            ) : null}
          </View>
          <Button label={t('phone.getOtp')} disabled={!valid} loading={busy} onPress={submit} iconRight={<ArrowRight size={18} color={valid ? colors.white : colors.disabledText} strokeWidth={2.6} />} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            <T size={12} color={colors.muted}>Are you a scrap collector?</T>
            <T size={12} w="extrabold" color={colors.primary}>Get Scraptox Partner →</T>
          </View>
          <T size={11} color={colors.disabledText} center lh={16}>
            By continuing you agree to our{' '}
            <T size={11} w="bold" color={colors.primary} onPress={() => navigation.navigate('Legal', { kind: 'terms' })}>Terms</T> and{' '}
            <T size={11} w="bold" color={colors.primary} onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}>Privacy policy</T>
          </T>
        </View>
      </ScrollView>
      <Sheet visible={langOpen} onClose={() => setLangOpen(false)} title="Language">
        <SettingsLanguagePicker onDone={() => setLangOpen(false)} />
      </Sheet>
    </KeyboardSafe>
  );
}

/* -------------------------------------------------------------------- OTP */

export function OtpScreen({ route, navigation }: P<'Otp'>) {
  const { phone, isNewUser } = route.params;
  const { verifyOtp, requestOtp, registerUser } = useStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ref, setRef] = useState('');
  const [heard, setHeard] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  // Existing numbers were texted by /auth/login-otp; new ones only after register.
  const [sent, setSent] = useState(!isNewUser);
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useFocusAfterTransition(input);

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // The backend requires an email to create an account.
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const emailOk = !email || emailValid;
  const profileOk = name.trim().length >= 2 && emailValid;
  const ready = isNewUser && !sent ? profileOk : code.length === 6 && (!isNewUser || profileOk);

  const profile = () => ({ name: name.trim(), email: email.trim(), referralCode: ref.trim() || undefined, heardFrom: heard ?? undefined });

  const verify = async () => {
    if (!ready) return;
    setBusy(true);
    if (isNewUser && !sent) {
      // Step 1 for a new number: create the account, which texts the code.
      try {
        await registerUser(phone, profile());
        setSent(true);
        setLeft(30);
        input.current?.focus();
      } catch (e: any) {
        Alert.alert('Could not send the code', e.message);
      }
      setBusy(false);
      return;
    }
    try {
      await verifyOtp(phone, code, isNewUser ? profile() : undefined);
    } catch (e: any) {
      Alert.alert('Could not verify', e.message);
      setBusy(false);
    }
  };

  return (
    <KeyboardSafe style={{ backgroundColor: colors.white }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Logo size={32} text={false} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 22 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center' }}>
          <Smartphone size={28} color={colors.primary} />
        </View>
        <View style={{ gap: 8 }}>
          <T size={26} w="extrabold" style={{ letterSpacing: -0.4 }}>{t('otp.title')}</T>
          <T size={14} color={colors.muted} lh={20}>
            {sent ? 'Code sent to ' : "We'll text a code to "}<T size={14} w="bold" raw>{`+91 ${phoneLabel(phone)}`}</T>
            {'  '}
            <T size={14} w="bold" color={colors.primary} onPress={() => navigation.goBack()}>Edit</T>
          </T>
        </View>

        {/* Six boxes drawn over one hidden input, so paste and SMS autofill work. */}
        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Enter the 6-digit code" style={{ flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const filled = i < code.length;
            const cur = i === code.length;
            return (
              <View key={i} style={{ flex: 1, height: 58, borderRadius: 14, borderWidth: 1.5, borderColor: filled || cur ? colors.primary : colors.lineStrong, backgroundColor: filled ? '#F6FBF8' : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                <T size={22} w="extrabold" raw>{code[i] ?? ''}</T>
              </View>
            );
          })}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%' }}
          />
        </Pressable>

        {sent ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color={colors.muted} />
          {left > 0 ? (
            <T size={13} color={colors.muted}>Resend code in <T size={13} w="bold" raw>{`0:${String(left).padStart(2, '0')}`}</T></T>
          ) : (
            <T
              size={13}
              w="bold"
              color={colors.primary}
              onPress={async () => {
                setLeft(30);
                try {
                  await requestOtp(phone);
                } catch (e: any) {
                  Alert.alert('Could not resend', e.message);
                }
              }}>
              {t('otp.resend')}
            </T>
          )}
        </View>
        ) : null}
        <DemoNote text="Demo build: any 6-digit code works" />

        {isNewUser ? (
          <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 14 }}>
            <T size={15} w="extrabold">First time here? Add your details</T>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Please check the email address'} />
            <Field label="Referral code (optional)" value={ref} onChangeText={(v) => setRef(v.toUpperCase())} placeholder="USER-XXXX" autoCapitalize="characters" />
            <View style={{ gap: 8 }}>
              <T size={13} w="semibold" color={colors.ink2}>How did you hear about us?</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HOW_HEARD.map((h) => (
                  <Pressable key={h} onPress={() => setHeard(h)} accessibilityRole="radio" accessibilityState={{ checked: heard === h }} style={{ paddingHorizontal: 12, height: 34, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: heard === h ? colors.primary : colors.white, borderWidth: heard === h ? 0 : 1, borderColor: colors.lineStrong }}>
                    <T size={12} w="semibold" color={heard === h ? colors.white : colors.ink2}>{h}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        <Button label={isNewUser && !sent ? 'Send code' : t('otp.verify')} disabled={!ready} loading={busy} onPress={verify} />
      </View>
    </KeyboardSafe>
  );
}
