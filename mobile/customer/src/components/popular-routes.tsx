import { useTranslation } from 'react-i18next';

import { ChipGroup } from '@ranktrip/mobile';
import { DEMO_DISTRICTS, demoPlaceById, isDemoDistrict, type DemoPlaceId, type Place } from '@ranktrip/shared';

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
 * "Popular routes" (the website's corridor pills): one tap loads both places into the quote. The
 * route currently in the address fields shows as selected.
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
    <ChipGroup
      variant="tile"
      wrap={false}
      label={t('landing.pricing.corridors')}
      accessibilityLabel={t('landing.pricing.corridors')}
      value={current ? keyOf(current) : ''}
      onChange={(key) => {
        const route = ROUTES.find((r) => keyOf(r) === key);
        if (route) onPick(...places(route));
      }}
      options={ROUTES.map((r) => ({ value: keyOf(r), label: label(r) }))}
    />
  );
}
