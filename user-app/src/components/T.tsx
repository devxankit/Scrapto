import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, font, FontWeight } from '../theme';
import { txChildren, useTx } from '../i18n/auto';

type Props = TextProps & {
  w?: FontWeight;
  size?: number;
  color?: string;
  center?: boolean;
  lh?: number;
  /** Show the text exactly as given (language names, what the user typed, the app version). */
  raw?: boolean;
};

/**
 * App text: Plus Jakarta Sans with an explicit weight, since Android picks fonts
 * by file. Indian scripts fall back to the system Noto families.
 *
 * Every text is shown in the user's language: fixed text from the bundled
 * dictionaries, everything else (names, addresses, chat) translated by the
 * server and swapped in when it arrives. See i18n/auto.ts.
 */
export default function T({ w = 'regular', size = 14, color = colors.ink, center, lh, style, raw, children, ...rest }: Props) {
  useTx();
  // Translated text is often longer than the English it was laid out for: a
  // single-line text first shrinks (down to 75%), and is only then cut with "…".
  // Scraptox: only short labels shrink; long text (addresses, item lists) is cut with "…".
  const plain = typeof children === 'string' ? children : Array.isArray(children) && children.every((c) => typeof c === 'string' || typeof c === 'number') ? children.join('') : '';
  const oneLine = rest.numberOfLines === 1 && plain.length > 0 && plain.length <= 26;
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      adjustsFontSizeToFit={oneLine}
      minimumFontScale={oneLine ? 0.75 : undefined}
      {...rest}
      children={raw ? children : (txChildren(children) as React.ReactNode)}
      style={[
        {
          fontFamily: font[w],
          fontSize: size,
          color,
          includeFontPadding: false,
          textAlign: center ? 'center' : undefined,
          lineHeight: lh,
        },
        style,
      ]}
    />
  );
}
