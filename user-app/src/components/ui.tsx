import { USE_MOCK } from '../config/env';
/**
 * Scraptox UI kit, drawn from the design canvas (board "01 · Design system").
 * Tokens only; no raw hex in screens.
 */
import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleProp,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import T from './T';
import Pressable from './Pressable';
import { colors, radius, shadow, status as statusTokens, StatusKey } from '../theme';

/* ----------------------------------------------------------------- Button */

type Variant = 'primary' | 'deep' | 'outline' | 'tonal' | 'ghost' | 'ghostDanger' | 'danger' | 'white';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  icon,
  iconRight,
  style,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'lg' | 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const h = size === 'lg' ? 48 : size === 'md' ? 40 : 32;
  const off = disabled || loading;
  const v = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    deep: { bg: colors.deep, fg: colors.white, border: colors.deep },
    outline: { bg: colors.white, fg: colors.primary, border: colors.primary },
    tonal: { bg: colors.green50, fg: colors.deep, border: colors.green50 },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    ghostDanger: { bg: 'transparent', fg: colors.red, border: 'transparent' },
    danger: { bg: colors.white, fg: colors.red, border: colors.redLine },
    white: { bg: colors.white, fg: colors.deep, border: colors.white },
  }[variant];
  const bg = disabled ? colors.disabled : v.bg;
  const fg = disabled ? colors.disabledText : v.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: h,
          borderRadius: size === 'sm' ? 8 : radius.md,
          backgroundColor: bg,
          borderWidth: variant === 'outline' || variant === 'danger' ? 1.5 : 0,
          borderColor: disabled ? colors.disabled : v.border,
          paddingHorizontal: size === 'sm' ? 10 : 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <T w={size === 'sm' ? 'bold' : 'extrabold'} size={size === 'lg' ? 15 : size === 'md' ? 14 : 12} color={fg} numberOfLines={1}>
        {label}
      </T>
      {!loading && iconRight}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- AppBar */

export function BackButton({ onPress, light }: { onPress: () => void; light?: boolean }) {
  return (
    <IconButton label="Back" onPress={onPress} tone={light ? 'deep' : 'outline'}>
      <ChevronLeft size={20} color={light ? colors.white : colors.ink} strokeWidth={2.4} />
    </IconButton>
  );
}

export function IconButton({
  children,
  onPress,
  label,
  tone = 'outline',
  size = 38,
  badge,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  label: string;
  tone?: 'outline' | 'deep' | 'primary' | 'plain' | 'white';
  size?: number;
  badge?: boolean;
}) {
  const bg = { outline: colors.white, deep: colors.deep2, primary: colors.primary, plain: 'transparent', white: colors.white }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: bg,
        borderWidth: tone === 'outline' ? 1 : 0,
        borderColor: colors.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
        ...(tone === 'white' ? shadow.raised : null),
      })}>
      {children}
      {badge ? <View style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 5, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.white }} /> : null}
    </Pressable>
  );
}

export function AppBar({
  title,
  subtitle,
  right,
  onBack,
  back = true,
  border = true,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  back?: boolean;
  border?: boolean;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 4, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: border ? 1 : 0, borderBottomColor: colors.line, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
        {back ? <BackButton onPress={onBack ?? (() => nav.goBack())} /> : null}
        <View style={{ flex: 1 }}>
          {subtitle ? <T size={11} w="semibold" color={colors.muted}>{subtitle}</T> : null}
          {title ? <T size={back ? 16 : 19} w="extrabold" numberOfLines={1}>{title}</T> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Thin step progress (sell flow). */
export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < current ? colors.brand : colors.line }} />
      ))}
    </View>
  );
}

/* ----------------------------------------------------------- Containers */

export function Card({ children, style, onPress, tone = 'white' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'white' | 'soft' | 'green' | 'gold' }) {
  const bg = { white: colors.white, soft: colors.bg, green: colors.green50, gold: '#FFF8E8' }[tone];
  const border = { white: colors.line, soft: colors.bg, green: colors.green100, gold: colors.goldLine }[tone];
  const s: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: radius.lg, borderWidth: 1, borderColor: border, padding: 12 }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s, { opacity: pressed ? 0.92 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
      <T size={15} w="extrabold">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T size={12} w="bold" color={colors.primary}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Sticky bottom area for the main action; handles the gesture-bar inset. */
export function BottomBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) + 4, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }, style]}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.lineSoft }, style]} />;
}

export function ListRow({
  icon,
  title,
  subtitle,
  meta,
  onPress,
  last,
  danger,
  right,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.lineSoft, opacity: pressed ? 0.7 : 1 })}>
      {icon}
      <View style={{ flex: 1 }}>
        <T size={14} w="semibold" color={danger ? colors.red : colors.ink}>{title}</T>
        {subtitle ? <T size={12} color={colors.muted} style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {meta ? <T size={12} color={colors.muted}>{meta}</T> : null}
      {right ?? (onPress ? <ChevronRight size={18} color={colors.faint} /> : null)}
    </Pressable>
  );
}

/** Label / value pair inside summary cards. */
export function InfoRow({ label, value, strong, valueColor }: { label: string; value: string; strong?: boolean; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T size={13} color={colors.muted}>{label}</T>
      <T size={strong ? 15 : 13} w={strong ? 'extrabold' : 'bold'} color={valueColor ?? colors.ink} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</T>
    </View>
  );
}

/* ---------------------------------------------------------- Chips, pills */

export function Chip({ label, active, onPress, icon, dark }: { label: string; active?: boolean; onPress?: () => void; icon?: React.ReactNode; dark?: boolean }) {
  const onBg = dark ? colors.ink : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        height: 32,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: active ? onBg : colors.white,
        borderWidth: active ? 0 : 1,
        borderColor: colors.lineStrong,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}>
      {icon}
      <T size={12} w={active ? 'bold' : 'semibold'} color={active ? colors.white : colors.ink2}>{label}</T>
    </Pressable>
  );
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const s = statusTokens[(status as StatusKey)] ?? statusTokens.pending;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: s.bg, alignSelf: 'flex-start' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot }} />
      <T size={11} w="bold" color={s.fg}>{label ?? s.label}</T>
    </View>
  );
}

export function Tag({ label, tone = 'green' }: { label: string; tone?: 'green' | 'gold' | 'grey' | 'red' }) {
  const t = {
    green: { bg: colors.green50, fg: colors.deep },
    gold: { bg: colors.goldSoft, fg: colors.goldText },
    grey: { bg: colors.bg, fg: colors.ink2 },
    red: { bg: colors.redSoft, fg: colors.redText },
  }[tone];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: t.bg, alignSelf: 'flex-start' }}>
      <T size={11} w="extrabold" color={t.fg}>{label}</T>
    </View>
  );
}

export function CheckBox({ on, size = 22 }: { on: boolean; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 7, backgroundColor: on ? colors.primary : colors.white, borderWidth: on ? 0 : 1.5, borderColor: '#C3CCC6', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Check size={size * 0.62} color={colors.white} strokeWidth={3.5} /> : null}
    </View>
  );
}

export function RadioDot({ on, color = colors.primary }: { on: boolean; color?: string }) {
  return <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 1.5, borderColor: on ? color : colors.faint, backgroundColor: colors.white }} />;
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={8}>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? colors.brand : colors.lineStrong, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white }} />
      </View>
    </Pressable>
  );
}

/* --------------------------------------------------------------- Inputs */

export function useFocusAfterTransition(ref: React.RefObject<React.ComponentRef<typeof TextInput> | null>, enabled = true) {
  const nav = useNavigation();
  React.useEffect(() => {
    if (!enabled) return;
    let done = false;
    const focus = () => {
      if (done) return;
      done = true;
      ref.current?.focus();
    };
    const unsub = nav.addListener('transitionEnd' as never, (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) focus();
    });
    const fallback = setTimeout(focus, 450);
    return () => {
      unsub();
      clearTimeout(fallback);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const Field = React.forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { label?: string; error?: string; left?: React.ReactNode; right?: React.ReactNode; hint?: string; multiline?: boolean }>(
  function Field({ label, error, left, right, hint, multiline, style, ...rest }, ref) {
    const [focused, setFocused] = React.useState(false);
    const border = error ? colors.red : focused ? colors.primary : colors.lineStrong;
    return (
      <View style={{ gap: 6 }}>
        {label ? <T size={13} w="semibold" color={colors.ink2}>{label}</T> : null}
        <View
          style={{
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            minHeight: multiline ? 88 : 46,
            borderWidth: focused || error ? 1.5 : 1,
            borderColor: border,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            backgroundColor: colors.white,
            gap: 10,
          }}>
          {left}
          <TextInput
            ref={ref}
            placeholderTextColor={colors.faint}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            maxFontSizeMultiplier={1.3}
            style={[{ flex: 1, fontFamily: 'PlusJakartaSans-SemiBold', fontSize: 14, color: colors.ink, paddingVertical: multiline ? 10 : 0, minHeight: multiline ? 82 : 42 }, style]}
            {...rest}
          />
          {right}
        </View>
        {error ? <T size={12} w="semibold" color={colors.red}>{error}</T> : hint ? <T size={12} color={colors.muted}>{hint}</T> : null}
      </View>
    );
  },
);

/** − 12 kg + */
export function Stepper({ value, label, onDec, onInc, disabledDec }: { value: string; label: string; onDec: () => void; onInc: () => void; disabledDec?: boolean }) {
  const btn = (txt: string, fn: () => void, dis?: boolean, a11y?: string) => (
    <Pressable onPress={fn} disabled={dis} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
      <T size={20} w="bold" color={dis ? colors.faint : colors.primary} raw>{txt}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 10, height: 40 }}>
      {btn('−', onDec, disabledDec, `Less ${label}`)}
      <T size={14} w="extrabold" style={{ minWidth: 52, textAlign: 'center' }}>{value}</T>
      {btn('+', onInc, false, `More ${label}`)}
    </View>
  );
}

/* --------------------------------------------------------------- Images */

export function Photo({ source, size, radius: r = 10, style }: { source: ImageSourcePropType; size: number; radius?: number; style?: any }) {
  return <Image source={source} style={[{ width: size, height: size, borderRadius: r, backgroundColor: colors.bg }, style]} resizeMode="cover" />;
}

export function Avatar({ source, size = 48, ring }: { source: ImageSourcePropType; size?: number; ring?: string }) {
  return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring, backgroundColor: colors.bg }} />;
}

/* ---------------------------------------------------------- Empty, notes */

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.green50, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>{icon}</View>
      <T size={17} w="extrabold" center>{title}</T>
      <T size={13} color={colors.muted} center lh={19}>{text}</T>
      {action ? <View style={{ marginTop: 10, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

/** Small line that says what is simulated in the demo build. */
export function DemoNote({ text }: { text: string }) {
  // "Demo build: ..." notes describe the on-device mock. Hide them whenever the
  // app talks to the real backend, where they would be false.
  if (!USE_MOCK && /^Demo build/i.test(text)) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.goldSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold }} />
      <T size={12} w="semibold" color={colors.goldText} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function Loading({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingVertical: 48, alignItems: 'center' }, style]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={{ margin: 16, padding: 14, borderRadius: radius.lg, backgroundColor: colors.redSoft, gap: 10 }}>
      <T size={13} w="semibold" color={colors.redText}>{text}</T>
      {onRetry ? <Button label="Try again" variant="danger" size="sm" full={false} onPress={onRetry} /> : null}
    </View>
  );
}

export function KeyboardSafe({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

/* ---------------------------------------------------------------- Sheet */

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  // Never mount a hidden <Modal> (Fabric left native views stale on Android).
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 10, maxHeight: '90%', ...shadow.sheet }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginBottom: 14 }} />
          {title ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <T size={18} w="extrabold" style={{ flex: 1 }}>{title}</T>
              <IconButton label="Close" tone="plain" size={36} onPress={onClose}>
                <X size={20} color={colors.muted} />
              </IconButton>
            </View>
          ) : null}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Screen with the grey page background. */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>{children}</View>;
}
