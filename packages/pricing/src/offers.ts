// Offers for one vehicle class: every quotable vehicle priced from its OWN rate card, cheapest
// first, plus the "from" price the vehicle-class screen shows (COMPLIANCE §1.1). Pure, no I/O.

import type { BookingFeeRule, Currency, QuoteJob, RateCard, VehicleClass } from '@ranktrip/shared';

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

/** A specific mover's vehicle and its fixed price for this job — what the customer books. */
export type Offer = { vehicleId: string; companyId: string; companyName: string; quote: Quote };

/** Lowest offer in one currency (a class can mix currencies, e.g. EUR and PLN movers). */
export type FromPrice = { currency: Currency; moverPrice: number; bookingFee: number | null; total: number };

export type ClassOffers = {
  vehicleClass: VehicleClass;
  /** Number of offers; 0 = no mover available for this class here. */
  count: number;
  /** "from €X": the lowest mover's price in each currency (amounts in different currencies are not compared). */
  from: FromPrice[];
  /** Every offer, cheapest first within each currency. */
  offers: Offer[];
};

export function buildClassOffers(
  vehicleClass: VehicleClass,
  job: QuoteJob,
  rows: readonly QuotableVehicleRow[],
  bookingFee: BookingFeeRule | null,
): ClassOffers {
  const offers: Offer[] = [];
  for (const row of rows) {
    const result = quoteVehicle({ ...job, vehicleClass }, rateCardFromRow(row), { bookingFee });
    // Vehicles that can't take this job (crew not offered, non-EUR corridor) are simply not offered.
    if (result.ok) offers.push({ vehicleId: row.vehicle_id, companyId: row.company_id, companyName: row.company_name, quote: result.quote });
  }
  offers.sort(
    (a, b) =>
      a.quote.currency.localeCompare(b.quote.currency) ||
      a.quote.moverPrice - b.quote.moverPrice ||
      a.vehicleId.localeCompare(b.vehicleId),
  );

  const from: FromPrice[] = [];
  for (const { quote } of offers) {
    if (from.some((f) => f.currency === quote.currency)) continue; // first per currency is the cheapest
    from.push({ currency: quote.currency, moverPrice: quote.moverPrice, bookingFee: quote.bookingFee, total: quote.total });
  }

  return { vehicleClass, count: offers.length, from, offers };
}
