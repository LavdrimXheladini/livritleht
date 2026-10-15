// Offers for one vehicle class: every quotable vehicle priced from its OWN rate card, one offer per
// mover (their cheapest van in the class), cheapest first, plus the "from" price the vehicle-class
// screen shows (COMPLIANCE §1.1). Pure, no I/O.

import type { BookingFeeRule, Currency, QuoteJob, RateCard, VehicleClass } from '@movershub/shared';

import { quoteVehicle, type Quote } from './engine';

/** One row of `public.quotable_vehicles(...)` (snake_case, straight from the database). */
export type QuotableVehicleRow = {
  vehicle_id: string;
  company_id: string;
  company_name: string;
  currency: Currency;
  base_fee: number;
  per_km: number;
  per_labor_minute_1_helper: number;
  per_labor_minute_2_helpers: number | null;
  per_labor_minute_3_helpers: number | null;
  min_price: number;
  floor_without_lift_fee: number;
  heavy_item_fee: number;
  assembly_per_item: number;
  long_distance_threshold_km: number | null;
  long_distance_per_km: number;
  is_business: boolean;
  /** Businesses only (null for a private person). */
  registration_no: string | null;
  /** The city of the company's address (null before it was found on the map). */
  town: string | null;
  /** End of the checked carrier insurance (ISO 8601). */
  insurance_until: string | null;
};

export function rateCardFromRow(row: QuotableVehicleRow): RateCard {
  return {
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
  };
}

/** Who the mover is, as customers see it on an offer (COMPLIANCE §4); address and contact come at booking. */
export type MoverFacts = { isBusiness: boolean; registrationNo: string | null; town: string | null; insuranceUntil: string | null };

/** A specific mover's vehicle and its fixed price for this job — what the customer books. */
export type Offer = { vehicleId: string; companyId: string; companyName: string; mover: MoverFacts; quote: Quote };

/** Lowest offer in one currency (a class can mix currencies, e.g. EUR and PLN movers). */
export type FromPrice = { currency: Currency; moverPrice: number; moverPayout: number; bookingFee: number | null; total: number };

/** The "from" price to show: in the preferred currency (e.g. the pickup country's) when offered, else the first. */
export function pickFrom(from: readonly FromPrice[], preferred?: Currency): FromPrice | undefined {
  return (preferred && from.find((f) => f.currency === preferred)) || from[0];
}

export type ClassOffers = {
  vehicleClass: VehicleClass;
  /** Number of movers offering; 0 = no mover available for this class here. */
  count: number;
  /** "from €X": the lowest mover's price in each currency (amounts in different currencies are not compared). */
  from: FromPrice[];
  /** One offer per mover (their cheapest van), cheapest first within each currency. */
  offers: Offer[];
};

export function buildClassOffers(
  vehicleClass: VehicleClass,
  job: QuoteJob,
  rows: readonly QuotableVehicleRow[],
  bookingFee: BookingFeeRule | null,
): ClassOffers {
  const priced: Offer[] = [];
  for (const row of rows) {
    const result = quoteVehicle({ ...job, vehicleClass }, rateCardFromRow(row), { bookingFee });
    // Vehicles that can't take this job (crew not offered, non-EUR corridor) are simply not offered.
    if (result.ok) {
      priced.push({
        vehicleId: row.vehicle_id,
        companyId: row.company_id,
        companyName: row.company_name,
        mover: { isBusiness: row.is_business, registrationNo: row.registration_no, town: row.town, insuranceUntil: row.insurance_until },
        quote: result.quote,
      });
    }
  }
  priced.sort(
    (a, b) =>
      a.quote.currency.localeCompare(b.quote.currency) ||
      a.quote.moverPrice - b.quote.moverPrice ||
      a.vehicleId.localeCompare(b.vehicleId),
  );
  // The customer chooses a mover: a mover with two vans of this class offers their cheaper one.
  const movers = new Set<string>();
  const offers = priced.filter((o) => !movers.has(o.companyId) && movers.add(o.companyId));

  const from: FromPrice[] = [];
  for (const { quote } of offers) {
    if (from.some((f) => f.currency === quote.currency)) continue; // first per currency is the cheapest
    from.push({
      currency: quote.currency,
      moverPrice: quote.moverPrice,
      moverPayout: quote.moverPayout,
      bookingFee: quote.bookingFee,
      total: quote.total,
    });
  }

  return { vehicleClass, count: offers.length, from, offers };
}
