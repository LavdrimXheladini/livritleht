import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@ranktrip/ui';

/**
 * Mini map of a job request, same shapes as the website's mover phone: a few streets, the copper
 * route, a white pickup dot and a copper drop-off dot. Decorative: the route text carries the meaning.
 */
export function RouteSketch() {
  return (
    <View aria-hidden className="aspect-[5/2] overflow-hidden rounded-input bg-night-800">
      <Svg width="100%" height="100%" viewBox="0 0 300 120">
        <Path d="M0 90 L300 70 M60 0 L90 120 M200 0 L180 120 M0 30 L300 50" stroke={colors.night[600]} strokeWidth={6} fill="none" />
        <Path
          d="M30 95 C90 80 110 40 170 45 S240 30 270 25"
          stroke={colors.accent[500]}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx={30} cy={95} r={6} fill={colors.stone[50]} />
        <Circle cx={270} cy={25} r={6} fill={colors.accent[500]} />
      </Svg>
    </View>
  );
}
