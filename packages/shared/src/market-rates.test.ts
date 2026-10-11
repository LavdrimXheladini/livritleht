import { describe, expect, it } from 'vitest';

import { VEHICLE_CLASSES } from './constants';
import { MARKET_RATES, suggestedRateCard, type MarketCountry } from './market-rates';
import { rateCardSchema } from './schemas/pricing';

const countries = Object.keys(MARKET_RATES) as MarketCountry[];

describe('market reference rates', () => {
  it('cover every launch market, each in its own currency', () => {
    expect(countries.sort()).toEqual(['AL', 'AT', 'CH', 'DE', 'MK', 'PL', 'XK']);
    expect(Object.fromEntries(countries.map((c) => [c, MARKET_RATES[c].currency]))).toEqual({
      AL: 'ALL', AT: 'EUR', CH: 'CHF', DE: 'EUR', MK: 'MKD', PL: 'PLN', XK: 'EUR',
    });
  });

  it('give a valid suggested rate card for every class', () => {
    for (const country of countries) {
      for (const cls of VEHICLE_CLASSES) {
        expect(rateCardSchema.safeParse(suggestedRateCard(country, cls)).success).toBe(true);
      }
    }
  });

  it('cost more for bigger vehicles and bigger crews', () => {
    for (const country of countries) {
      const prices = VEHICLE_CLASSES.map((cls) => suggestedRateCard(country, cls));
      prices.forEach((card, i) => {
        if (i > 0) expect(card.perKm).toBeGreaterThan(prices[i - 1]!.perKm);
        expect(card.perLaborMinute[2]!).toBeGreaterThan(card.perLaborMinute[1]);
        expect(card.perLaborMinute[3]!).toBeGreaterThan(card.perLaborMinute[2]!);
      });
    }
  });

  it('make a bigger crew a little dearer in total, as the market does (time × rate)', () => {
    for (const country of countries) {
      const m = MARKET_RATES[country].van.perLaborMinute;
      // A crew of 2 takes 60% of the time, a crew of 3 45% (CREW_TIME_PCT in packages/pricing).
      expect(m[2]! * 0.6).toBeGreaterThan(m[1]);
      expect(m[3]! * 0.45).toBeGreaterThan(m[1]);
    }
  });

  it('differ per country: a van crew of 2 costs more per hour in Zurich than in Prishtina', () => {
    expect(MARKET_RATES.CH.van.perLaborMinute[2]).toBeGreaterThan(MARKET_RATES.XK.van.perLaborMinute[2]!);
  });
});
