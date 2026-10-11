import 'server-only';

import type { TFunction } from 'i18next';

import type { Place, VehicleClass } from '@ranktrip/shared';

import { demoPlace } from './geo/types';
import { sampleQuote } from './landing-example';
import type { DemoItem, LiveJob } from './live-demo-types';

// SIMULATED DATA for the "Live moves" dashboard demo (labelled "Simulated data" in the UI).
// Three made-up jobs by sample movers. Road routes and distances are real (geo provider); prices
// use the landing page's sample rates (design/DECISIONS.md #4), computed here on the server.
// Replaced by real jobs (Realtime `job:{id}` channels) once booking + tracking exist (build order 4–7).

/** Nominal load volume per class for the van-load gauge (COMPLIANCE §1.1 ranges). */
const CAPACITY_M3: Record<VehicleClass, number> = { SMALL: 3, VAN: 6, LARGE_VAN: 13, BOX: 20, TRUCK: 30 };

/** Routes into these countries need the customs documentation notice (COMPLIANCE §11). */
const NON_EU_BALKAN = new Set(['XK', 'AL', 'MK', 'ME', 'RS', 'BA']);

const item = (
  key: DemoItem['key'],
  size: DemoItem['size'],
  volumeTenthsM3: number,
  room: DemoItem['room'],
  slots: number,
  extra: { fragile?: boolean; count?: number } = {},
): DemoItem => ({ key, size, volumeTenthsM3, room, slots, fragile: extra.fragile ?? false, count: extra.count });

type JobDef = Omit<LiveJob, 'km' | 'crossBorder' | 'customsNotice' | 'takeRatePct' | 'moverPriceCents' | 'currency' | 'capacityM3' | 'geometry' | 'from' | 'to'> & {
  pickup: Place;
  dropoff: Place;
  /** Crew size the sample price is for (1 = mover only). */
  crew: 1 | 2 | 3;
};

function jobDefs(t: TFunction): JobDef[] {
  // Warsaw districts (not in DEMO_CITIES: those feed the corridor pills).
  const mokotow: Place = { label: t('places.mokotow'), area: t('places.mokotow'), lat: 52.1933, lon: 21.035, countryCode: 'PL' };
  const wola: Place = { label: t('places.wola'), area: t('places.wola'), lat: 52.2361, lon: 20.9836, countryCode: 'PL' };
  return [
    {
      id: 'RT-2041',
      company: 'a',
      vehicleClass: 'LARGE_VAN',
      crew: 2,
      pickup: demoPlace('prishtina', t('places.prishtina')),
      dropoff: demoPlace('prizren', t('places.prizren')),
      startT: 0.22,
      ratePerS: 1 / 40,
      items: [
        item('sofa', '220×95×85 cm', 18, 'living', 3),
        item('wardrobe', '200×60×10 cm', 6, 'bedroom', 2),
        item('mattress', '200×160×25 cm', 8, 'bedroom', 2),
        item('washingMachine', '60×60×85 cm', 3, 'bathroom', 1),
        item('mirror', '120×80 cm', 1, 'hall', 1, { fragile: true }),
        item('boxes', 'mixed', 14, 'all', 4, { count: 14 }),
        item('plants', null, 3, 'balcony', 1, { fragile: true, count: 3 }),
      ],
    },
    {
      id: 'RT-2047',
      company: 'b',
      vehicleClass: 'LARGE_VAN',
      crew: 2,
      pickup: demoPlace('munich', t('places.munich')),
      dropoff: demoPlace('prishtina', t('places.prishtina')),
      startT: 0.48,
      ratePerS: 1 / 100,
      items: [
        item('boxes', 'mixed', 22, 'all', 5, { count: 22 }),
        item('tv', '125×75×10 cm', 1, 'living', 1, { fragile: true }),
        item('desk', '140×70×75 cm', 7, 'office', 2),
        item('bicycle', '180×60×100 cm', 4, 'garage', 1),
        item('suitcases', null, 5, null, 1, { count: 4 }),
      ],
    },
    {
      id: 'RT-2052',
      company: 'c',
      vehicleClass: 'VAN',
      crew: 1,
      pickup: mokotow,
      dropoff: wola,
      startT: 0.71,
      ratePerS: 1 / 26,
      items: [
        item('boxes', 'mixed', 8, 'all', 2, { count: 8 }),
        item('armchair', '80×85×95 cm', 6, 'living', 2),
        item('bookshelf', '180×80×30 cm', 4, 'office', 1),
        item('lamp', null, 1, 'living', 1, { fragile: true }),
      ],
    },
  ];
}

/** The simulated active jobs, with real road routes and sample prices. */
export async function liveDemoJobs(t: TFunction): Promise<LiveJob[]> {
  return Promise.all(
    jobDefs(t).map(async ({ pickup, dropoff, crew, ...def }): Promise<LiveJob> => {
      const q = await sampleQuote(pickup, dropoff);
      const customsNotice =
        q.crossBorder && (NON_EU_BALKAN.has(pickup.countryCode) || NON_EU_BALKAN.has(dropoff.countryCode));
      return {
        ...def,
        from: pickup.area,
        to: dropoff.area,
        km: q.km,
        crossBorder: q.crossBorder,
        customsNotice,
        takeRatePct: q.takeRatePct,
        moverPriceCents: q.prices[def.vehicleClass][crew - 1]![0],
        currency: 'EUR',
        capacityM3: CAPACITY_M3[def.vehicleClass],
        geometry: q.geometry,
      };
    }),
  );
}
