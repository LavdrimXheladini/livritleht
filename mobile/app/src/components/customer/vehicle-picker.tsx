import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { cx } from '@movershub/mobile';
import { VEHICLE_CLASSES, type VehicleClass } from '@movershub/shared';
import { colors } from '@movershub/ui';

// Each size as a small drawing, growing from left to right: [body outline, wheel centres].
const SHAPES: Record<VehicleClass, { body: string; wheels: readonly number[] }> = {
  SMALL: { body: 'M5 17v-4l3-4h9l4 4h4a2 2 0 0 1 2 2v2', wheels: [10, 22] },
  VAN: { body: 'M4 17V9a2 2 0 0 1 2-2h12l5 5h3a2 2 0 0 1 2 2v3', wheels: [10, 23] },
  LARGE_VAN: { body: 'M3 17V7a2 2 0 0 1 2-2h15l5 6h3a2 2 0 0 1 2 2v4', wheels: [9, 24] },
  BOX: { body: 'M3 17V5h17v12M20 9h5l4 4v4', wheels: [9, 24] },
  TRUCK: { body: 'M2 17V3h19v14M21 8h5l4 5v4', wheels: [7, 13, 25] },
};

const hidden = Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

function VehicleDrawing({ cls, color }: { cls: VehicleClass; color: string }) {
  const { body, wheels } = SHAPES[cls];
  return (
    <Svg width={40} height={28} viewBox="0 0 32 22" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" {...hidden}>
      <Path d={body} />
      <Path d="M1 17h30" />
      {wheels.map((x) => (
        <Circle key={x} cx={x} cy={17} r={2.6} fill={color} />
      ))}
    </Svg>
  );
}

/**
 * The van sizes as one calm choice on the home: a drawing and the name of each, nothing else. Prices
 * come later, for the customer's own things and day (the booking's "Choose the van size").
 */
export function VehiclePicker({ selected, onSelect }: { selected: VehicleClass; onSelect: (cls: VehicleClass) => void }) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('landing.quote.classes')} className="flex-row gap-1.5">
      {VEHICLE_CLASSES.map((k) => {
        const on = k === selected;
        return (
          <Pressable
            key={k}
            testID={`class-${k}`}
            accessibilityRole="radio"
            accessibilityLabel={t(`vehicles.${k}.name`)}
            accessibilityState={{ selected: on, checked: on }}
            aria-checked={on}
            onPress={() => onSelect(k)}
            className={cx('h-[84px] flex-1 items-center justify-center gap-1.5 rounded-[16px] border px-0.5', on ? 'border-brand-500 bg-brand-500' : 'border-stone-300 bg-stone-50 active:bg-stone-150')}
          >
            <VehicleDrawing cls={k} color={on ? colors.accent[300] : colors.ink[700]} />
            <Text numberOfLines={2} className={cx('text-center text-[11.5px] leading-[14px]', on ? 'font-sans-semibold text-stone-50' : 'font-sans-medium text-ink-900')}>
              {t(`vehicles.${k}.name`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
