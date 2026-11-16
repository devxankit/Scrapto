import React from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import T from './T';
import Pressable from './Pressable';
import { CheckBox } from './ui';
import { colors, family as familyTokens, radius } from '../theme';
import { categoryMeta, images } from '../data/catalog';
import { inr } from '../utils/format';

/** Logo mark (from the frontend logo) + "Scraptox" wordmark + deep-green "Partner" tag. */
export function Logo({ size = 30, text = true, light, pill }: { size?: number; text?: boolean; light?: boolean; pill?: boolean }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={images.logoMark} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      {text ? <T size={size * 0.55} w="extrabold" color={light ? colors.white : colors.ink} raw style={{ letterSpacing: -0.2 }}>Scraptox</T> : null}
      {text ? (
        <View style={{ backgroundColor: light ? colors.white : colors.deep, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <T size={Math.max(9, size * 0.3)} w="extrabold" color={light ? colors.deep : colors.white} raw style={{ letterSpacing: 0.6 }}>PARTNER</T>
        </View>
      ) : null}
    </View>
  );
  if (!pill) return body;
  return <View style={{ backgroundColor: colors.white, borderRadius: 14, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, alignSelf: 'flex-start', elevation: 4 }}>{body}</View>;
}

export type Price = { _id: string; category: string; pricePerKg: number; unit?: 'kg' | 'pc'; change?: number };

export const unitOf = (p: Price) => p.unit ?? categoryMeta(p.category).unit;

/** Photo tile with name, rate and today's trend (home grid, 3 per row). */
export function CategoryTile({ price, onPress, width, style }: { price: Price; onPress?: () => void; width: number; style?: StyleProp<ViewStyle> }) {
  const meta = categoryMeta(price.category);
  const ch = price.change ?? 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${price.category}, ${inr(price.pricePerKg)} per ${unitOf(price)}`}
      style={({ pressed }) => [{ width, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', opacity: pressed ? 0.88 : 1 }, style]}>
      <View style={{ width: width - 2, height: width - 2, padding: 6, backgroundColor: colors.white }}>
        <Image source={meta.image} style={{ width: width - 14, height: width - 14, borderRadius: 10 }} resizeMode="contain" />
      </View>
      <View style={{ height: 1, backgroundColor: colors.lineSoft, marginHorizontal: 10 }} />
      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 3 }}>
        <T size={13} w="bold" numberOfLines={1}>{price.category}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={13} w="extrabold" color={colors.primary} raw numberOfLines={1}>{`${inr(price.pricePerKg)}/${unitOf(price)}`}</T>
          {ch ? <T size={10} w="bold" color={ch > 0 ? colors.primary : colors.red} raw>{ch > 0 ? '▲' : '▼'}</T> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Selectable row-card used in the sell flow (2 per row). */
export function CategoryPick({ price, on, onPress }: { price: Price; on: boolean; onPress: () => void }) {
  const meta = categoryMeta(price.category);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={price.category}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        borderRadius: 14,
        backgroundColor: on ? colors.green50 : colors.white,
        borderWidth: on ? 1.5 : 1,
        borderColor: on ? colors.primary : colors.line,
        opacity: pressed ? 0.9 : 1,
      })}>
      <Image source={meta.image} style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: familyTokens[meta.family].bg }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T size={13} w="bold" numberOfLines={2} lh={16}>{price.category}</T>
        <T size={12} w="extrabold" color={colors.primary} raw numberOfLines={1}>{`${inr(price.pricePerKg)}/${unitOf(price)}`}</T>
      </View>
      <CheckBox on={on} />
    </Pressable>
  );
}

/** Round icon badge used in lists (two-tone, filled). */
export function IconBadge({ children, tone = 'green', size = 38 }: { children: React.ReactNode; tone?: 'green' | 'gold' | 'grey' | 'red' | 'blue'; size?: number }) {
  const bg = { green: colors.green50, gold: colors.goldSoft, grey: colors.lineSoft, red: colors.redSoft, blue: colors.blueSoft }[tone];
  return <View style={{ width: size, height: size, borderRadius: radius.md - 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}
