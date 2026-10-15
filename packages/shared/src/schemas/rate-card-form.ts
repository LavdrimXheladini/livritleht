import { z } from 'zod';

import { CURRENCIES, type Currency, type VehicleClass } from '../constants';
import { MARKET_RATES, suggestedRateCard, type MarketCountry } from '../market-rates';
import { WHOLE_UNIT_CURRENCIES } from '../money';
import type { RateCard } from './pricing';

// The mover's own prices for one van (COMPLIANCE §1, §1.1; design/DECISIONS.md #22). Typed in whole
// currency units ("25" or "25.50"; lek, denar and dinar without decimals) and stored in minor units.
// Labour is typed per HOUR, the way movers think, and stored per minute (the engine's unit): the form
// shows the per-minute amount it will keep. No maximum anywhere — the platform never caps a mover's price.

const AMOUNT = /^\d{1,7}([.,]\d{1,2})?$/;

/** "25", "25.5", "25,50" → 2550 (minor units). */
export const toMinorUnits = (raw: string) => Math.round(Number(raw.trim().replace(',', '.')) * 100);

/** 2550 → "25.50"; whole units without decimals ("25", or "1500" lek). */
export function fromMinorUnits(amount: number, currency: Currency): string {
  if (WHOLE_UNIT_CURRENCIES.includes(currency) || amount % 100 === 0) return String(Math.round(amount / 100));
  return (amount / 100).toFixed(2);
}

/** An hourly rate (minor units) as the per-minute amount the engine uses — what is saved. */
export const perMinuteFromHourly = (hourly: number) => Math.round(hourly / 60);

const required = z.string().trim().min(1, { error: 'amount_required', abort: true }).regex(AMOUNT, 'amount_invalid');
const optional = z.string().trim().refine((v) => v === '' || AMOUNT.test(v), 'amount_invalid');

const fields = z.object({
  currency: z.enum(CURRENCIES),
  baseFee: required,
  perKm: required,
  hourly1: required,
  /** Empty = this crew size isn't offered with this van. */
  hourly2: optional,
  hourly3: optional,
  minPrice: required,
  floorWithoutLiftFee: required,
  heavyItemFee: required,
  assemblyPerItem: required,
  /** Both empty, or both given: from this many km on, `longDistancePerKm` is added per km. */
  longDistanceFromKm: z.string().trim().refine((v) => v === '' || /^\d{1,4}$/.test(v), 'km_invalid'),
  longDistancePerKm: optional,
});

const AMOUNT_FIELDS = ['baseFee', 'perKm', 'hourly1', 'hourly2', 'hourly3', 'minPrice', 'floorWithoutLiftFee', 'heavyItemFee', 'assemblyPerItem', 'longDistancePerKm'] as const;
type FieldName = keyof typeof fields.shape;
const whenParses = (...keys: FieldName[]) => {
  const mask: Partial<Record<FieldName, true>> = Object.fromEntries(keys.map((k) => [k, true]));
  const part = fields.pick(mask);
  return { when: (payload: { value: unknown }) => part.safeParse(payload.value).success };
};
const hasDecimals = (v: string) => /[.,]/.test(v);
export type RateCardFormInput = z.input<typeof fields>;

// Lek, denar and dinar have no hundredths in use (design/DECISIONS.md #14).
let checked = fields;
for (const name of AMOUNT_FIELDS) {
  checked = checked.refine((f) => !(WHOLE_UNIT_CURRENCIES.includes(f.currency) && hasDecimals(f[name])), {
    path: [name],
    error: 'whole_units',
    ...whenParses('currency', name),
  });
}

/** The price form's rules; the output is the engine's RateCard (minor units, per-minute labour). */
export const rateCardFormSchema = checked
  .refine((f) => (f.longDistanceFromKm === '') === (f.longDistancePerKm === ''), {
    path: ['longDistancePerKm'],
    error: 'long_distance_both',
    ...whenParses('longDistanceFromKm', 'longDistancePerKm'),
  })
  .transform(
    (f): RateCard => ({
      currency: f.currency,
      baseFee: toMinorUnits(f.baseFee),
      perKm: toMinorUnits(f.perKm),
      perLaborMinute: {
        1: perMinuteFromHourly(toMinorUnits(f.hourly1)),
        2: f.hourly2 === '' ? null : perMinuteFromHourly(toMinorUnits(f.hourly2)),
        3: f.hourly3 === '' ? null : perMinuteFromHourly(toMinorUnits(f.hourly3)),
      },
      minPrice: toMinorUnits(f.minPrice),
      floorWithoutLiftFee: toMinorUnits(f.floorWithoutLiftFee),
      heavyItemFee: toMinorUnits(f.heavyItemFee),
      assemblyPerItem: toMinorUnits(f.assemblyPerItem),
      longDistanceThresholdKm: f.longDistanceFromKm === '' ? null : Number(f.longDistanceFromKm),
      longDistancePerKm: f.longDistancePerKm === '' ? 0 : toMinorUnits(f.longDistancePerKm),
    }),
  );

/** The columns a mover may write on `rate_cards` (its column grants). Saving confirms the card (trigger). */
export function rateCardColumns(card: RateCard) {
  return {
    currency: card.currency,
    base_fee: card.baseFee,
    per_km: card.perKm,
    per_labor_minute_1_helper: card.perLaborMinute[1],
    per_labor_minute_2_helpers: card.perLaborMinute[2],
    per_labor_minute_3_helpers: card.perLaborMinute[3],
    min_price: card.minPrice,
    floor_without_lift_fee: card.floorWithoutLiftFee,
    heavy_item_fee: card.heavyItemFee,
    assembly_per_item: card.assemblyPerItem,
    long_distance_threshold_km: card.longDistanceThresholdKm,
    long_distance_per_km: card.longDistancePerKm,
  };
}

/** A van's saved card as the app reads it (RLS: the company's owner only). */
export const rateCardRowSchema = z.object({
  vehicle_id: z.uuid(),
  currency: z.enum(CURRENCIES),
  base_fee: z.number().int(),
  per_km: z.number().int(),
  per_labor_minute_1_helper: z.number().int(),
  per_labor_minute_2_helpers: z.number().int().nullable(),
  per_labor_minute_3_helpers: z.number().int().nullable(),
  min_price: z.number().int(),
  floor_without_lift_fee: z.number().int(),
  heavy_item_fee: z.number().int(),
  assembly_per_item: z.number().int(),
  long_distance_threshold_km: z.number().int().nullable(),
  long_distance_per_km: z.number().int(),
  confirmed_by_mover_at: z.string().nullable(),
});
export type RateCardRow = z.infer<typeof rateCardRowSchema>;
export const RATE_CARD_COLUMNS = Object.keys(rateCardRowSchema.shape).join(', ');

export const rateCardFromSavedRow = (row: RateCardRow): RateCard => ({
  currency: row.currency,
  baseFee: row.base_fee,
  perKm: row.per_km,
  perLaborMinute: { 1: row.per_labor_minute_1_helper, 2: row.per_labor_minute_2_helpers, 3: row.per_labor_minute_3_helpers },
  minPrice: row.min_price,
  floorWithoutLiftFee: row.floor_without_lift_fee,
  heavyItemFee: row.heavy_item_fee,
  assemblyPerItem: row.assembly_per_item,
  longDistanceThresholdKm: row.long_distance_threshold_km,
  longDistancePerKm: row.long_distance_per_km,
});

/** A card as the form shows it (hourly labour; amounts in whole units). */
export function rateCardFormValues(card: RateCard): RateCardFormInput {
  const money = (amount: number) => fromMinorUnits(amount, card.currency);
  const hourly = (perMinute: number | null) => (perMinute === null ? '' : money(perMinute * 60));
  return {
    currency: card.currency,
    baseFee: money(card.baseFee),
    perKm: money(card.perKm),
    hourly1: hourly(card.perLaborMinute[1]),
    hourly2: hourly(card.perLaborMinute[2]),
    hourly3: hourly(card.perLaborMinute[3]),
    minPrice: money(card.minPrice),
    floorWithoutLiftFee: money(card.floorWithoutLiftFee),
    heavyItemFee: money(card.heavyItemFee),
    assemblyPerItem: money(card.assemblyPerItem),
    longDistanceFromKm: card.longDistanceThresholdKm === null ? '' : String(card.longDistanceThresholdKm),
    longDistancePerKm: card.longDistanceThresholdKm === null ? '' : money(card.longDistancePerKm),
  };
}

/**
 * The form's starting values: the saved card; else the local averages for this van's class in the
 * company's country — information to start from, used only once the mover saves (§1 ALLOWED, §1.1) —
 * else empty.
 */
export function rateCardFormDefaults(row: RateCardRow | null, country: string, vehicleClass: VehicleClass): { values: RateCardFormInput; suggested: boolean } {
  if (row) return { values: rateCardFormValues(rateCardFromSavedRow(row)), suggested: false };
  if (country in MARKET_RATES) return { values: rateCardFormValues(suggestedRateCard(country as MarketCountry, vehicleClass)), suggested: true };
  return {
    values: {
      currency: 'EUR',
      baseFee: '',
      perKm: '',
      hourly1: '',
      hourly2: '',
      hourly3: '',
      minPrice: '',
      floorWithoutLiftFee: '',
      heavyItemFee: '',
      assemblyPerItem: '',
      longDistanceFromKm: '',
      longDistancePerKm: '',
    },
    suggested: false,
  };
}

/** The currencies a mover can price in: their country's, and EUR (cross-border jobs are priced in EUR only, §11). */
export function rateCardCurrencies(country: string): Currency[] {
  const local = country in MARKET_RATES ? MARKET_RATES[country as MarketCountry].currency : 'EUR';
  return local === 'EUR' ? ['EUR'] : [local, 'EUR'];
}

/* ── Work area ───────────────────────────────────────────────────────── */

/** Radius choices around a town where a mover picks up jobs (service_areas.radius_km: 1–2000). */
export const SERVICE_AREA_RADII_KM = [10, 25, 50, 100, 200] as const;

/** The columns of one work area: a town from the map search and a radius around it. */
export function serviceAreaColumns(companyId: string, place: { lat: number; lon: number; area: string }, radiusKm: number) {
  return { company_id: companyId, label: place.area.slice(0, 120), center: `SRID=4326;POINT(${place.lon} ${place.lat})`, radius_km: radiusKm };
}

export const serviceAreaRowSchema = z.object({ id: z.uuid(), label: z.string().nullable(), radius_km: z.number().int() });
export type ServiceAreaRow = z.infer<typeof serviceAreaRowSchema>;

/**
 * The checklist's "Your rates" step: done once every van in use has prices the mover saved and there
 * is at least one work area; else to do.
 */
export function ratesStepStatus(
  vehicles: readonly { id: string; active: boolean }[],
  cards: readonly Pick<RateCardRow, 'vehicle_id' | 'confirmed_by_mover_at'>[],
  areas: readonly unknown[],
): 'todo' | 'saved' {
  const inUse = vehicles.filter((v) => v.active);
  const priced = inUse.every((v) => cards.some((c) => c.vehicle_id === v.id && c.confirmed_by_mover_at !== null));
  return inUse.length > 0 && priced && areas.length > 0 ? 'saved' : 'todo';
}
