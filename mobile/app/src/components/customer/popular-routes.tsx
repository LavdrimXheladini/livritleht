import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cx } from '@movershub/mobile';
import { DEMO_DISTRICTS, demoPlaceById, isDemoDistrict, type DemoPlaceId, type Place } from '@movershub/shared';

type Route = { from: DemoPlaceId; to: DemoPlaceId };

/** Example routes: within one city, between cities, and the diaspora corridors. */
const ROUTES: readonly Route[] = [
  { from: 'dardania', to: 'velania' },
  { from: 'prishtina', to: 'prizren' },
  { from: 'mokotow', to: 'wola' },
  { from: 'munich', to: 'prishtina' },
  { from: 'skopje', to: 'prishtina' },
];

const keyOf = (r: Route) => `${r.from}>${r.to}`;
const samePoint = (a: Place, b: Place) => a.lat === b.lat && a.lon === b.lon;

/**
 * "Popular routes": one tap loads both places into the quote. Cards of one size in a row that scrolls
 * sideways; the route currently in the address fields shows as selected.
 */
export function PopularRoutes({
  pickup,
  dropoff,
  onPick,
}: {
  pickup: Place;
  dropoff: Place;
  onPick: (pickup: Place, dropoff: Place) => void;
}) {
  const { t } = useTranslation();
  const places = (r: Route) => [demoPlaceById(r.from, t), demoPlaceById(r.to, t)] as const;
  // "Prishtina: Dardania → Velania" within one city, "Prishtina → Prizren" otherwise (website: corridorLabel).
  const label = (r: Route) => {
    const from = t(`places.${r.from}`);
    const to = t(`places.${r.to}`);
    const district = isDemoDistrict(r.from) ? DEMO_DISTRICTS.find((d) => d.id === r.from) : undefined;
    return district ? t('landing.pricing.localCorridor', { city: t(`places.${district.city}`), from, to }) : `${from} → ${to}`;
  };
  const current = ROUTES.find((r) => {
    const [from, to] = places(r);
    return samePoint(from, pickup) && samePoint(to, dropoff);
  });

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('landing.pricing.corridors')} className="gap-2">
      <Text className="font-sans text-[13px] text-ink-600">{t('landing.pricing.corridors')}</Text>
      {/* Cards of one size, the two places one above the other: an even row, whatever the names' lengths. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2">
        {ROUTES.map((r) => {
          const on = current !== undefined && keyOf(current) === keyOf(r);
          return (
            <Pressable
              key={keyOf(r)}
              accessibilityRole="radio"
              accessibilityLabel={label(r)}
              accessibilityState={{ selected: on, checked: on }}
              aria-checked={on}
              onPress={() => onPick(...places(r))}
              className={cx('h-[68px] w-[132px] justify-center gap-1 rounded-[18px] border px-3.5', on ? 'border-brand-500 bg-brand-500' : 'border-stone-300 bg-stone-50 active:bg-stone-150')}
            >
              <Text numberOfLines={1} className={cx('font-sans-semibold text-[14px]', on ? 'text-stone-50' : 'text-ink-900')}>
                {t(`places.${r.from}`)}
              </Text>
              <Text numberOfLines={1} className={cx('font-sans text-[13px]', on ? 'text-accent-300' : 'text-ink-600')}>
                {`→ ${t(`places.${r.to}`)}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
