import React from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import T from './T';
import Pressable from './Pressable';
import { CheckBox } from './ui';
import { colors, family as familyTokens, radius } from '../theme';
import { categoryMeta, images } from '../data/catalog';
import { inr } from '../utils/format';

/** Logo mark (from the frontend logo) + "Scraptox" wordmark. */
export function Logo({ size = 30, text = true, light, pill }: { size?: number; text?: boolean; light?: boolean; pill?: boolean }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={images.logoMark} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      {text ? <T size={size * 0.55} w="extrabold" color={light ? colors.white : colors.ink} raw style={{ letterSpacing: -0.2 }}>Scraptox</T> : null}
    </View>
  );
  if (!pill) return body;
  return <View style={{ backgroundColor: colors.white, borderRadius: 14, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, alignSelf: 'flex-start', elevation: 4 }}>{body}</View>;
}

export type Price = { _id: string; category: string; pricePerKg: number; unit?: 'kg' | 'pc'; change?: number };

export const unitOf = (p: Price) => p.unit ?? categoryMeta(p.category).unit;

/**
 * Square rate tile (4 per row): a compact box with the item photo, name and
 * rate. The photo sits small inside the box so every item reads at a glance.
 */
export function CategoryTile({ price, onPress, width, style }: { price: Price; onPress?: () => void; width: number; style?: StyleProp<ViewStyle> }) {
  const meta = categoryMeta(price.category);
  const ch = price.change ?? 0;
  const img = Math.round(width * 0.42);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${price.category}, ${inr(price.pricePerKg)} per ${unitOf(price)}`}
      style={({ pressed }) => [
        { width, height: width, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 3, opacity: pressed ? 0.85 : 1 },
        style,
      ]}>
      <Image source={meta.image} style={{ width: img, height: img }} resizeMode="contain" />
      <T size={11} w="bold" lh={14} numberOfLines={1} style={{ textAlign: 'center', maxWidth: width - 8 }}>{price.category}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <T size={11} w="extrabold" lh={14} color={colors.primary} raw numberOfLines={1}>{`${inr(price.pricePerKg)}/${unitOf(price)}`}</T>
        {ch ? <T size={8} w="bold" color={ch > 0 ? colors.primary : colors.red} raw>{ch > 0 ? '▲' : '▼'}</T> : null}
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
