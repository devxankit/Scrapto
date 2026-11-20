import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StatusBar, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bike, Check, ChevronDown, Clock, Globe, LocateFixed, MapPin, Search, Smartphone, Truck } from 'lucide-react-native';
import T from '../components/T';
import Pressable from '../components/Pressable';
import Fade from '../components/Fade';
import { AppBar, BottomBar, Button, CheckBox, DemoNote, Field, KeyboardSafe, Sheet, useFocusAfterTransition } from '../components/ui';
import { BackButton } from '../components/ui';
import { Logo } from '../components/brand';
import { colors, radius } from '../theme';
import { useStore } from '../store/AppStore';
import { CITIES, HOW_HEARD, LANGUAGES, SERVICES, VEHICLES, images } from '../data/catalog';
import type { Partner } from '../store/AppStore';
import { askLocationPermission, currentPosition, reverseGeocode } from '../utils/location';
import { phoneLabel } from '../utils/format';
import { Alert } from '../i18n/Alert';
import type { RootParams } from '../navigation/RootNavigator';

type P<K extends keyof RootParams> = NativeStackScreenProps<RootParams, K>;

/* ----------------------------------------------------------------- Splash */

export function SplashScreen() {
  return (
    // Same logo, size and position as the native launch screen, so the hand-off is seamless.
    <View style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={images.logoFull} style={{ width: 200, height: 159 }} resizeMode="contain" accessibilityLabel="Scraptox Partner" />
      <ActivityIndicator color={colors.primary} style={{ position: 'absolute', bottom: '22%' }} />
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
          if ((sel === 'ur') !== (lang === 'ur')) Alert.alert('Restart the app', 'Close and reopen Scraptox Partner to switch the reading direction.');
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
  const heroH = Math.max(380, Math.round(height * 0.58));
  const current = LANGUAGES.find((l) => l.id === (lang ?? 'en'));

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await requestOtp(digits);
      // A new number has no code yet: sign up first (register texts the code).
      if (r.isNewUser) navigation.navigate('Signup', { phone: digits });
      else navigation.navigate('Otp', { phone: digits, isNewUser: false });
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
          <Image source={images.heroPartner} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="A smiling Scraptox partner in a green uniform" />
          <Fade stops={[[0, '#002814', 0.6], [0.24, '#002814', 0], [0.48, colors.deep, 0], [0.84, colors.deep, 0.94], [1, colors.deep, 1]]} />
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
          <View style={{ position: 'absolute', top: heroH * 0.42, right: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, elevation: 6 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
              <T size={15} w="extrabold" color={colors.goldText} raw>₹</T>
            </View>
            <View>
              <T size={13} w="extrabold">Pickups near you, daily</T>
              <T size={11} w="semibold" color={colors.muted}>Paid from your partner wallet</T>
            </View>
          </View>
          <View style={{ position: 'absolute', left: 24, right: 24, bottom: 46, gap: 12 }}>
            <T size={30} w="extrabold" color={colors.white} lh={35} style={{ letterSpacing: -0.6 }}>Grow your scrap business with Scraptox.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
              {['Requests near you', 'Bulk-lot bidding', 'Instant payouts'].map((s) => (
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
            <T size={19} w="extrabold">Partner log in or sign up</T>
            <T size={13} color={colors.muted}>{t('phone.sub')}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1.5, borderColor: colors.deep, borderRadius: 14, paddingHorizontal: 14, gap: 10 }}>
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
          <Button variant="deep" label={t('phone.getOtp')} disabled={!valid} loading={busy} onPress={submit} iconRight={<ArrowRight size={18} color={valid ? colors.white : colors.disabledText} strokeWidth={2.6} />} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            <T size={12} color={colors.muted}>Want to sell your scrap?</T>
            <T size={12} w="extrabold" color={colors.primary}>Get the Scraptox app →</T>
          </View>
          <T size={11} color={colors.disabledText} center lh={16}>
            By continuing you agree to our{' '}
            <T size={11} w="bold" color={colors.primary} onPress={() => navigation.navigate('Legal', { kind: 'terms' })}>Partner terms</T> and{' '}
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

const RESEND_SECONDS = 60;

export function OtpScreen({ route, navigation }: P<'Otp'>) {
  const { phone, isNewUser } = route.params;
  const { verifyOtp, requestOtp } = useStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useFocusAfterTransition(input);

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const verify = async () => {
    if (code.length !== 6) return;
    if (isNewUser) {
      navigation.navigate('Signup', { phone, otp: code });
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(phone, code);
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
          <Smartphone size={28} color={colors.deep} />
        </View>
        <View style={{ gap: 8 }}>
          <T size={26} w="extrabold" style={{ letterSpacing: -0.4 }}>{t('otp.title')}</T>
          <T size={14} color={colors.muted} lh={20}>
            Code sent to <T size={14} w="bold" raw>{`+91 ${phoneLabel(phone)}`}</T>
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
              <View key={i} style={{ flex: 1, height: 58, borderRadius: 14, borderWidth: 1.5, borderColor: filled || cur ? colors.deep : colors.lineStrong, backgroundColor: filled ? '#F6FBF8' : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                <T size={22} w="extrabold" raw>{code[i] ?? ''}</T>
              </View>
            );
          })}
          <TextInput
            ref={input}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            onSubmitEditing={verify}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%' }}
          />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color={colors.muted} />
          {left > 0 ? (
            <T size={13} color={colors.muted}>Resend code in <T size={13} w="bold" raw>{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</T></T>
          ) : (
            <T
              size={13}
              w="bold"
              color={colors.primary}
              onPress={async () => {
                setLeft(RESEND_SECONDS);
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
        <DemoNote text="Demo build: any 6-digit code works" />
        {isNewUser ? <T size={13} color={colors.muted} lh={19}>New to Scraptox Partner? Next you add your vehicle and city.</T> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        <Button variant="deep" label={isNewUser ? t('common.continue') : t('otp.verify')} disabled={code.length !== 6} loading={busy} onPress={verify} />
      </View>
    </KeyboardSafe>
  );
}

/* ----------------------------------------------------------------- Signup */

const VEHICLE_ICON = { bike: Bike, auto: Truck, truck: Truck };

export function SignupScreen({ route, navigation }: P<'Signup'>) {
  const { phone } = route.params;
  const { registerUser } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [vehicle, setVehicle] = useState<Partner['vehicleInfo']['type']>('auto');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [services, setServices] = useState<Partner['services']>(['scrap_pickup']);
  const [heard, setHeard] = useState<string | null>(null);
  const [heardOther, setHeardOther] = useState('');
  const [ref, setRef] = useState('');
  const [agree, setAgree] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // The backend requires an email to create an account.
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const emailOk = !email || emailValid;
  const numberOk = VEHICLE_NO.test(number.trim().toUpperCase());
  // Backend codes are SCRAP-/USER- plus 8 characters (models/User.js).
  const refOk = !ref || /^(SCRAP|USER)-[A-Z0-9]{4,12}$/.test(ref);
  const ready = name.trim().length >= 2 && emailValid && numberOk && !!city && services.length > 0 && refOk && agree;

  const toggleService = (sid: Partner['services'][number]) =>
    setServices((s) => (s.includes(sid) ? s.filter((x) => x !== sid) : [...s, sid]));

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const v = VEHICLES.find((x) => x.id === vehicle)!;
      await registerUser(phone, {
        name: name.trim(),
        email: email.trim() || undefined,
        vehicleInfo: { type: vehicle, number: number.trim().toUpperCase(), capacity: v.capacity },
        services,
        city,
        heardFrom: heard === 'Other' ? heardOther.trim() || 'Other' : heard ?? undefined,
        referralCode: ref || undefined,
      });
      // Account created and code texted: verify it next.
      setBusy(false);
      navigation.navigate('Otp', { phone, isNewUser: false });
    } catch (e: any) {
      Alert.alert('Could not create your account', e.message);
      setBusy(false);
    }
  };

  return (
    <KeyboardSafe style={{ backgroundColor: colors.bg }}>
      <AppBar title="Partner details" subtitle={`+91 ${phoneLabel(phone)}`} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 12 }}>
        <View style={{ gap: 12 }}>
          <Field label="Full name (as on Aadhaar)" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Please check the email address'} />
        </View>

        <View style={{ gap: 10 }}>
          <T size={15} w="extrabold">Your vehicle</T>
          <VehiclePicker value={vehicle} onChange={setVehicle} />
          <Field label="Vehicle number" value={number} onChangeText={(v) => setNumber(v.toUpperCase().slice(0, 13))} placeholder="HR 26 DK 4417" autoCapitalize="characters" error={number && !numberOk ? 'Enter it as on the RC, e.g. HR 26 DK 4417' : undefined} />
        </View>

        <View style={{ gap: 8 }}>
          <T size={15} w="extrabold">Your city</T>
          <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: colors.white }}>
            <MapPin size={18} color={city ? colors.deep : colors.faint} />
            <T size={15} w="semibold" color={city ? colors.ink : colors.faint} style={{ flex: 1 }}>{city || 'Choose the city you work in'}</T>
            <ChevronDown size={18} color={colors.muted} />
          </Pressable>
          <T size={12} color={colors.muted}>You get pickup requests from this city.</T>
        </View>

        <View style={{ gap: 10 }}>
          <T size={15} w="extrabold">Services you offer</T>
          {SERVICES.map((s) => {
            const on = services.includes(s.id);
            return (
              <Pressable key={s.id} onPress={() => toggleService(s.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: on ? colors.green200 : colors.line, backgroundColor: colors.white }}>
                <CheckBox on={on} />
                <View style={{ flex: 1 }}>
                  <T size={14} w="bold">{s.name}</T>
                  <T size={12} color={colors.muted}>{s.hint}</T>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 8 }}>
          <T size={15} w="extrabold">How did you hear about us?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {HOW_HEARD.map((h) => (
              <Pressable key={h} onPress={() => setHeard(h)} accessibilityRole="radio" accessibilityState={{ checked: heard === h }} style={{ paddingHorizontal: 12, height: 34, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: heard === h ? colors.deep : colors.white, borderWidth: heard === h ? 0 : 1, borderColor: colors.lineStrong }}>
                <T size={12} w="semibold" color={heard === h ? colors.white : colors.ink2}>{h}</T>
              </Pressable>
            ))}
          </View>
          {heard === 'Other' ? <Field value={heardOther} onChangeText={setHeardOther} placeholder="Tell us where" /> : null}
        </View>

        <Field label="Referral code (optional)" value={ref} onChangeText={(v) => setRef(v.toUpperCase().slice(0, 10))} placeholder="SCRAP-XXXX" autoCapitalize="characters" error={refOk ? undefined : 'Codes look like SCRAP-AB12'} />

        <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <CheckBox on={agree} />
          <T size={13} color={colors.ink2} lh={19} style={{ flex: 1 }}>I agree to the Scraptox partner terms, and I will complete KYC before taking pickups.</T>
        </Pressable>
      </ScrollView>
      <BottomBar>
        <Button variant="deep" label="Create partner account" disabled={!ready} loading={busy} onPress={submit} />
      </BottomBar>
      <CitySheet visible={cityOpen} onClose={() => setCityOpen(false)} onPick={(c) => { setCity(c); setCityOpen(false); }} />
    </KeyboardSafe>
  );
}

/** Indian registration number, e.g. HR 26 DK 4417 or DL 1C 1234. */
export const VEHICLE_NO = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/;

export function VehiclePicker({ value, onChange }: { value: Partner['vehicleInfo']['type']; onChange: (v: Partner['vehicleInfo']['type']) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {VEHICLES.map((v) => {
        const on = value === v.id;
        const Icon = VEHICLE_ICON[v.id];
        return (
          <Pressable key={v.id} onPress={() => onChange(v.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.deep : colors.line, backgroundColor: on ? colors.green50 : colors.white }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? colors.deep : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={20} color={on ? colors.white : colors.ink2} />
            </View>
            <View style={{ flex: 1 }}>
              <T size={14} w="bold">{v.name}</T>
              <T size={12} color={colors.muted}>{`${v.hint} · up to ${v.capacity} kg`}</T>
            </View>
            {on ? <Check size={18} color={colors.deep} strokeWidth={3} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** City picker: search the list, or detect it from GPS (the web app used Google Places). */
export function CitySheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (city: string) => void }) {
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const list = CITIES.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()));
  const custom = q.trim().length > 2 && !CITIES.some((c) => c.toLowerCase() === q.trim().toLowerCase());
  const detect = async () => {
    setLocating(true);
    try {
      if (!(await askLocationPermission())) throw new Error('Location permission is off. Pick your city from the list.');
      const place = await reverseGeocode(await currentPosition());
      if (!place?.city) throw new Error('Could not find your city. Pick it from the list.');
      onPick(place.city);
    } catch (e: any) {
      Alert.alert('Could not detect your city', e.message);
    } finally {
      setLocating(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Choose your city">
      <View style={{ gap: 12 }}>
        <Field value={q} onChangeText={setQ} placeholder="Search city" left={<Search size={18} color={colors.muted} />} autoCapitalize="words" />
        <Pressable onPress={detect} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
          {locating ? <ActivityIndicator color={colors.primary} /> : <LocateFixed size={18} color={colors.primary} />}
          <T size={14} w="bold" color={colors.primary}>Use my current location</T>
        </Pressable>
        {custom ? (
          <Pressable onPress={() => onPick(q.trim())} accessibilityRole="button" style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
            <T size={14} w="semibold" raw>{`Use "${q.trim()}"`}</T>
          </Pressable>
        ) : null}
        {list.map((c) => (
          <Pressable key={c} onPress={() => onPick(c)} accessibilityRole="button" style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
            <T size={14} w="semibold">{c}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
