import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@movershub/ui';

// Stroke icons from the design (same paths as packages/ui/src/web/icons.tsx). Decorative: hidden
// from screen readers — the control around them carries the label.
export type IconProps = { size?: number; color?: string; strokeWidth?: number };

// The browser preview passes Svg props straight to the <svg> element, which only knows aria-hidden.
const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

function Icon({ size = 20, color = colors.ink[900], strokeWidth = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hidden}
    >
      {children}
    </Svg>
  );
}

export const VanIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 7h11v9H3z" />
    <Path d="M14 10h4l3 3v3h-7" />
    <Circle cx="7" cy="17.5" r="1.8" />
    <Circle cx="17" cy="17.5" r="1.8" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const CardIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="2" y="5" width="20" height="14" rx="2" />
    <Path d="M2 10h20" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="10" r="3" />
    <Path d="M12 21s7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 7 11 7 11Z" />
  </Icon>
);

export const SwapIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <Path d="M7 4 3 8l4 4" />
    <Path d="M3 8h14" />
    <Path d="m17 20 4-4-4-4" />
    <Path d="M21 16H7" />
  </Icon>
);

export const WarningIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <Path d="M12 9v4M12 17h.01" />
    <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="7" />
    <Path d="m20 20-3.5-3.5" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <Path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon strokeWidth={2} {...p}>
    <Path d="m9 6 6 6-6 6" />
  </Icon>
);

/** Company / registration. */
export const BuildingIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="4" y="3" width="16" height="18" rx="1.5" />
    <Path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
  </Icon>
);

/** Documents (insurance, licence). */
export const DocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <Path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

/** Rates / prices. */
export const TagIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" />
    <Circle cx="8" cy="8" r="1.5" />
  </Icon>
);

/** MoversHub mark: roof chevron over a baseline. */
export const LogoMark = ({ size = 22, ...p }: IconProps) => (
  <Icon size={size} strokeWidth={3} {...p}>
    <Path d="M3 15.5 L12 4 L21 15.5" strokeLinecap="butt" />
    <Path d="M7 20 H17" />
  </Icon>
);
