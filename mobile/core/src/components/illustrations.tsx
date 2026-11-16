import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@movershub/ui';

// Decorative pictures drawn from the design tokens — hidden from screen readers.
const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/**
 * A moving van on a street, with boxes waiting beside it: the picture above the sign-in sheet.
 * Drawn for the deep-green band (light shapes, copper van).
 */
export function MovingVanScene({ width = 320 }: { width?: number }) {
  const road = colors.brand[400];
  const line = colors.brand[300];
  const box = colors.accent[200];
  const boxEdge = colors.accent[700];
  return (
    <Svg width={width} height={(width * 150) / 320} viewBox="0 0 320 150" {...hidden}>
      {/* Streets seen at an angle, like a map. */}
      <Path d="M-10 128 H330" stroke={road} strokeWidth={30} />
      <Path d="M70 -10 L40 160" stroke={road} strokeWidth={16} />
      <Path d="M262 -10 L292 160" stroke={road} strokeWidth={12} />
      <Path d="M0 128 H320" stroke={line} strokeWidth={2} strokeDasharray="12 10" />
      {/* Boxes at the kerb. */}
      <Rect x="34" y="84" width="30" height="28" rx="3" fill={box} />
      <Path d="M34 94 H64 M49 84 V94" stroke={boxEdge} strokeWidth={2} />
      <Rect x="58" y="62" width="24" height="22" rx="3" fill={colors.accent[300]} />
      <Path d="M58 70 H82" stroke={boxEdge} strokeWidth={2} />
      <Rect x="68" y="88" width="26" height="24" rx="3" fill={colors.stone[300]} />
      <Path d="M68 97 H94" stroke={colors.ink[500]} strokeWidth={2} />
      {/* The van. */}
      <Path d="M112 54 H214 a6 6 0 0 1 6 6 V112 H106 V60 a6 6 0 0 1 6 -6 Z" fill={colors.stone[50]} />
      <Path d="M220 68 H246 a8 8 0 0 1 6.5 3.4 L270 94 a8 8 0 0 1 1.5 4.6 V112 H220 Z" fill={colors.accent[500]} />
      <Path d="M228 76 H243 L256 93 H228 Z" fill={colors.brand[700]} />
      <Path d="M122 70 H206 M122 84 H190" stroke={colors.stone[300]} strokeWidth={4} strokeLinecap="round" />
      <Rect x="100" y="108" width="176" height="8" rx="4" fill={colors.brand[700]} />
      <Circle cx="138" cy="116" r="13" fill={colors.ink[900]} />
      <Circle cx="138" cy="116" r="5" fill={colors.stone[300]} />
      <Circle cx="240" cy="116" r="13" fill={colors.ink[900]} />
      <Circle cx="240" cy="116" r="5" fill={colors.stone[300]} />
    </Svg>
  );
}
