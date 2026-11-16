import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Vertical gradient over a photo (SVG works on every architecture, no extra native module). */
export default function Fade({ stops, style }: { stops: [number, string, number][]; style?: StyleProp<ViewStyle> }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <Svg style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, style]} width="100%" height="100%" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([o, c, a], i) => (
            <Stop key={i} offset={o} stopColor={c} stopOpacity={a} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
