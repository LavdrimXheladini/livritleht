import type { Currency, VehicleClass } from './constants';
import type { RateCard } from './schemas/pricing';

// Typical moving prices per country — REFERENCE ONLY (COMPLIANCE §1 ALLOWED: "suggested or average
// market rates as information only"). Used to pre-fill a new mover's rate card, which the mover must
// review and save (§1.1), and to price the test movers. Never a platform price list or a cap: every
// mover sets and changes their own rates.
//
// Research 2026-10 (public price lists and guides; rates vary a lot between firms, so these are
// middle-of-the-range values for a van with a crew). Amounts in minor units of `currency`.

export type MarketRates = {
  country: string;
  currency: Currency;
  /** Reference card for a VAN (~6 m³); the other classes scale by CLASS_SCALE. */
  van: Omit<RateCard, 'currency'>;
  /** Where the numbers come from. */
  basis: string;
};

const card = (
  baseFee: number,
  perKm: number,
  perMinute: [number, number, number],
  minPrice: number,
  floorWithoutLiftFee: number,
  heavyItemFee: number,
  assemblyPerItem: number,
): Omit<RateCard, 'currency'> => ({
  baseFee,
  perKm,
  perLaborMinute: { 1: perMinute[0], 2: perMinute[1], 3: perMinute[2] },
  minPrice,
  floorWithoutLiftFee,
  heavyItemFee,
  assemblyPerItem,
  longDistanceThresholdKm: null,
  longDistancePerKm: 0,
});

export const MARKET_RATES = {
  // Kosovo — classifieds: local truck jobs ~€30–60; lowest wages in the region (avg. gross €713, 2025).
  // Crew of 1/2/3 ≈ €15/24/33 per hour.
  XK: { country: 'XK', currency: 'EUR', van: card(2000, 50, [25, 40, 55], 3500, 200, 400, 600), basis: 'merrjep.com listings; KCC wage report 2025' },
  // Albania — van freight ~100 lek/km (listings); wages a little above Kosovo (avg. gross ~€860, 2025).
  // Crew of 1/2/3 ≈ 1 600 / 2 600 / 3 600 lek per hour.
  AL: { country: 'AL', currency: 'ALL', van: card(200000, 6000, [2700, 4300, 6000], 350000, 20000, 40000, 60000), basis: 'merrjep.al listings; INSTAT wages 2025' },
  // North Macedonia — van + driver 2 800–5 500 den per job, crew + van €30–54/h, ~30–50 den/km
  // between towns. Crew of 1/2/3 ≈ 900 / 1 800 / 2 500 den per hour.
  MK: { country: 'MK', currency: 'MKD', van: card(120000, 3500, [1500, 3000, 4200], 250000, 12000, 25000, 35000), basis: 'emajstor.mk 2026 guide; daibau.mk' },
  // Poland — Warsaw: bus + driver + 1 mover ~234–253 zł/h, +2 movers ~300 zł/h, 2–4 zł/km outside
  // the city. Crew of 1/2/3 ≈ 120 / 240 / 300 zł per hour.
  PL: { country: 'PL', currency: 'PLN', van: card(10000, 300, [200, 400, 500], 25000, 1500, 4000, 6000), basis: 'kb.pl Warsaw price list; goliat-przeprowadzki.pl' },
  // Germany — professional helpers €25–50/h each, van with driver €0.60–1.20/km.
  // Crew of 1/2/3 ≈ €40/80/115 per hour.
  DE: { country: 'DE', currency: 'EUR', van: card(6000, 90, [67, 133, 192], 15000, 800, 1500, 2500), basis: 'my-hammer.de, anyhelpnow, kristall-umzuege.de' },
  // Austria — Vienna: 2 movers + truck €55–95/h, each extra mover ~€30/h.
  // Crew of 1/2/3 ≈ €38/72/102 per hour.
  AT: { country: 'AT', currency: 'EUR', van: card(5000, 85, [63, 120, 170], 13000, 700, 1400, 2200), basis: 'diemoebelpacker.at' },
  // Switzerland — Zurich: 2 movers + vehicle CHF 120–175/h, averages CHF 100–150/h.
  // Crew of 1/2/3 ≈ CHF 75/140/195 per hour.
  CH: { country: 'CH', currency: 'CHF', van: card(10000, 150, [125, 233, 325], 28000, 1500, 3000, 4500), basis: 'klassumzug.ch, steinerumzug.ch, mrclean.ch' },
} as const satisfies Record<string, MarketRates>;

export type MarketCountry = keyof typeof MARKET_RATES;

/** Bigger vehicles cost more to run (base, per km, minimum) and slightly more per crew minute. */
export const CLASS_SCALE: Record<VehicleClass, { vehicle: number; labor: number }> = {
  SMALL: { vehicle: 0.75, labor: 0.9 },
  VAN: { vehicle: 1, labor: 1 },
  LARGE_VAN: { vehicle: 1.3, labor: 1.1 },
  BOX: { vehicle: 1.7, labor: 1.25 },
  TRUCK: { vehicle: 2.4, labor: 1.4 },
};

/**
 * Suggested rate card for a vehicle class in a country, to PRE-FILL onboarding only. The mover must
 * review and save it before it is ever quoted (COMPLIANCE §1.1). `factor` varies test movers.
 */
export function suggestedRateCard(country: MarketCountry, vehicleClass: VehicleClass, factor = 1): RateCard {
  const { currency, van } = MARKET_RATES[country];
  const { vehicle, labor } = CLASS_SCALE[vehicleClass];
  const v = (n: number) => Math.round(n * vehicle * factor);
  const l = (n: number) => Math.round(n * labor * factor);
  // Base fee and minimum in whole currency units: nicer numbers for the mover to start from.
  const whole = (n: number) => Math.round(n / 100) * 100;
  return {
    currency,
    baseFee: whole(v(van.baseFee)),
    perKm: v(van.perKm),
    perLaborMinute: { 1: l(van.perLaborMinute[1]), 2: l(van.perLaborMinute[2]!), 3: l(van.perLaborMinute[3]!) },
    minPrice: whole(v(van.minPrice)),
    floorWithoutLiftFee: l(van.floorWithoutLiftFee),
    heavyItemFee: l(van.heavyItemFee),
    assemblyPerItem: l(van.assemblyPerItem),
    longDistanceThresholdKm: null,
    longDistancePerKm: 0,
  };
}
