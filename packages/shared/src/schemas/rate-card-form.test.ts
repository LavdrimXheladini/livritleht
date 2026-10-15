import { describe, expect, it } from 'vitest';

import { suggestedRateCard } from '../market-rates';
import {
  fromMinorUnits,
  rateCardColumns,
  rateCardCurrencies,
  rateCardFormDefaults,
  rateCardFormSchema,
  rateCardFormValues,
  ratesStepStatus,
  serviceAreaColumns,
  toMinorUnits,
  type RateCardFormInput,
} from './rate-card-form';

const eur: RateCardFormInput = {
  currency: 'EUR',
  baseFee: '25',
  perKm: '0,60',
  hourly1: '30',
  hourly2: '57.50',
  hourly3: '',
  minPrice: '40',
  floorWithoutLiftFee: '5',
  heavyItemFee: '10',
  assemblyPerItem: '15',
  longDistanceFromKm: '',
  longDistancePerKm: '',
};

const errors = (input: Partial<RateCardFormInput>) =>
  Object.fromEntries(
    (rateCardFormSchema.safeParse({ ...eur, ...input }).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('rateCardFormSchema', () => {
  it('turns typed amounts into minor units and hourly labour into the per-minute rate it keeps', () => {
    expect(rateCardColumns(rateCardFormSchema.parse(eur))).toEqual({
      currency: 'EUR',
      base_fee: 2500,
      per_km: 60,
      per_labor_minute_1_helper: 50, // €30/h
      per_labor_minute_2_helpers: 96, // €57.50/h → 95.83 → 96 cents a minute
      per_labor_minute_3_helpers: null, // not offered
      min_price: 4000,
      floor_without_lift_fee: 500,
      heavy_item_fee: 1000,
      assembly_per_item: 1500,
      long_distance_threshold_km: null,
      long_distance_per_km: 0,
    });
  });

  it('needs the basics, in a money format; never caps an amount (COMPLIANCE §1)', () => {
    expect(errors({ baseFee: '', hourly1: '' })).toEqual({ baseFee: 'amount_required', hourly1: 'amount_required' });
    expect(errors({ perKm: '0.605' })).toEqual({ perKm: 'amount_invalid' });
    expect(errors({ perKm: '-1' })).toEqual({ perKm: 'amount_invalid' });
    expect(errors({ hourly2: 'abc' })).toEqual({ hourly2: 'amount_invalid' });
    expect(errors({ baseFee: '9999999' })).toEqual({});
  });

  it('takes lek, denar and dinar in whole units only', () => {
    const lek = { ...eur, currency: 'ALL' as const, perKm: '60', hourly2: '5750' };
    expect(errors(lek)).toEqual({});
    expect(errors({ ...lek, baseFee: '2500.50' })).toEqual({ baseFee: 'whole_units' });
  });

  it('a long-distance rate needs both its start and its price per km', () => {
    expect(errors({ longDistanceFromKm: '150' })).toEqual({ longDistancePerKm: 'long_distance_both' });
    expect(rateCardFormSchema.parse({ ...eur, longDistanceFromKm: '150', longDistancePerKm: '0.30' })).toMatchObject({
      longDistanceThresholdKm: 150,
      longDistancePerKm: 30,
    });
    expect(errors({ longDistanceFromKm: '15.5', longDistancePerKm: '1' })).toEqual({ longDistanceFromKm: 'km_invalid' });
  });
});

describe('the form and saved cards', () => {
  it('shows amounts in whole units, and labour per hour', () => {
    expect(toMinorUnits('25,5')).toBe(2550);
    expect([fromMinorUnits(2550, 'EUR'), fromMinorUnits(2500, 'EUR'), fromMinorUnits(150000, 'ALL')]).toEqual(['25.50', '25', '1500']);
    const values = rateCardFormValues(rateCardFormSchema.parse(eur));
    expect(values).toMatchObject({ hourly1: '30', hourly2: '57.60', hourly3: '', perKm: '0.60' });
  });

  it('starts from the local averages for the van class (marked as suggestions), or the saved card', () => {
    const suggested = rateCardFormDefaults(null, 'PL', 'VAN');
    expect(suggested.suggested).toBe(true);
    expect(suggested.values).toEqual(rateCardFormValues(suggestedRateCard('PL', 'VAN')));
    expect(suggested.values.currency).toBe('PLN');
    expect(rateCardFormDefaults(null, 'PT', 'VAN')).toMatchObject({ suggested: false, values: { currency: 'EUR', baseFee: '' } });
  });

  it("offers the country's currency and EUR (cross-border jobs are priced in EUR)", () => {
    expect(rateCardCurrencies('PL')).toEqual(['PLN', 'EUR']);
    expect(rateCardCurrencies('AL')).toEqual(['ALL', 'EUR']);
    expect(rateCardCurrencies('XK')).toEqual(['EUR']);
  });
});

describe('work area and the checklist', () => {
  it('keeps a town and a radius as a point', () => {
    expect(serviceAreaColumns('c1', { lat: 42.6629, lon: 21.1655, area: 'Prishtinë' }, 50)).toEqual({
      company_id: 'c1',
      label: 'Prishtinë',
      center: 'SRID=4326;POINT(21.1655 42.6629)',
      radius_km: 50,
    });
  });

  it('is done once every van in use has saved prices and there is a work area', () => {
    const vans = [
      { id: 'a', active: true },
      { id: 'b', active: false },
    ];
    const card = { vehicle_id: 'a', confirmed_by_mover_at: '2026-10-15T09:00:00Z' };
    expect(ratesStepStatus([], [], [{}])).toBe('todo');
    expect(ratesStepStatus(vans, [card], [])).toBe('todo');
    expect(ratesStepStatus(vans, [{ ...card, confirmed_by_mover_at: null }], [{}])).toBe('todo');
    expect(ratesStepStatus(vans, [card], [{}])).toBe('saved');
  });
});
