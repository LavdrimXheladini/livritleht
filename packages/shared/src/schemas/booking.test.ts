import { describe, expect, it } from 'vitest';

import { ITEM_KEYS, TYPICAL_LOADS } from '../items';
import { demoPlace } from '../places';
import {
  ITEM_GROUPS,
  bookingDraftSchema,
  fittingClass,
  jobItems,
  loadTenthsM3,
  moveDays,
  moveQuoteRequest,
  newStop,
  scheduledAt,
  smallerClass,
  stopProblems,
  type BookingDraft,
} from './booking';
import { quoteRequestSchema } from './pricing';

const prishtina = demoPlace('prishtina', 'Prishtinë');
const prizren = demoPlace('prizren', 'Prizren');

const draft: BookingDraft = {
  pickup: { ...newStop(prishtina, { street: 'Rruga Agim Ramadani', houseNumber: '12' }), floor: 3, hasLift: false },
  dropoff: { ...newStop(prizren), details: 'Behind the school, blue gate' },
  items: { sofa3: { qty: 1, assembly: true }, box: { qty: 10, assembly: false }, wardrobe: { qty: 1, assembly: true } },
  day: '2026-10-20',
  hour: 9,
  crew: 2,
  vehicleClass: 'VAN',
};

describe('item groups', () => {
  it('list every catalogue item exactly once', () => {
    const listed = Object.values(ITEM_GROUPS).flat();
    expect([...listed].sort()).toEqual([...ITEM_KEYS].sort());
  });
});

describe('fitting class', () => {
  it('is the smallest van whose load space holds the items', () => {
    expect(fittingClass(0)).toBe('SMALL');
    expect(fittingClass(30)).toBe('SMALL');
    expect(fittingClass(31)).toBe('VAN');
    expect(fittingClass(121)).toBe('BOX');
    expect(fittingClass(5000)).toBe('TRUCK');
  });

  it("fits each class's own typical load", () => {
    for (const [cls, load] of Object.entries(TYPICAL_LOADS)) {
      expect(smallerClass(fittingClass(loadTenthsM3(load)), cls as keyof typeof TYPICAL_LOADS) || fittingClass(loadTenthsM3(load)) === cls).toBe(true);
    }
  });

  it('counts the items by quantity', () => {
    expect(loadTenthsM3([{ key: 'box', qty: 10 }, { key: 'sofa3', qty: 1 }])).toBe(28);
  });
});

describe('stops', () => {
  it('need the street from the map, or details that say where', () => {
    expect(stopProblems(newStop(prishtina))).toEqual(['place']);
    expect(stopProblems({ ...newStop(prishtina), details: 'Blue house next to the mosque' })).toEqual([]);
    expect(stopProblems({ ...newStop(prishtina), details: '  ab ' })).toEqual(['place']);
    expect(stopProblems(newStop(prishtina, { street: 'Rruga B' }))).toEqual([]);
  });

  it('above the ground floor, need to know about a lift', () => {
    const street = newStop(prishtina, { street: 'Rruga B' });
    expect(stopProblems({ ...street, floor: 4 })).toEqual(['lift']);
    expect(stopProblems({ ...street, floor: 4, hasLift: false })).toEqual([]);
    expect(stopProblems({ ...street, floor: 0 })).toEqual([]);
  });
});

describe('items', () => {
  it("go to the quote in the picker's order (furniture first); assembly only where the item comes apart", () => {
    expect(jobItems({ box: { qty: 2, assembly: true }, sofa3: { qty: 1, assembly: true }, wardrobe: { qty: 1, assembly: true } })).toEqual([
      { key: 'sofa3', qty: 1, assembly: false },
      { key: 'wardrobe', qty: 1, assembly: true },
      { key: 'box', qty: 2, assembly: false },
    ]);
  });
});

describe('days', () => {
  it('start tomorrow, across the end of a month', () => {
    const days = moveDays(new Date(2026, 9, 30, 22, 15), 4);
    expect(days).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('the start time is local time, sent as UTC', () => {
    expect(new Date(scheduledAt('2026-10-20', 9)).getTime()).toBe(new Date(2026, 9, 20, 9).getTime());
    expect(scheduledAt('2026-10-20', 9)).toMatch(/Z$/);
  });
});

describe('quote request', () => {
  it("is the customer's own move, and the quote function accepts it", () => {
    const request = moveQuoteRequest(draft);
    expect(request).toMatchObject({
      pickupStop: { floor: 3, hasLift: false },
      dropoffStop: { floor: 0, hasLift: false },
      helpers: 2,
      items: [
        { key: 'sofa3', qty: 1, assembly: false },
        { key: 'wardrobe', qty: 1, assembly: true },
        { key: 'box', qty: 10, assembly: false },
      ],
      scheduledAt: scheduledAt('2026-10-20', 9),
    });
    expect(quoteRequestSchema.safeParse(request).success).toBe(true);
    // The address details stay out of the price check.
    expect(JSON.stringify(request)).not.toContain('blue gate');
  });

  it('without a day yet, prices for today', () => {
    expect(moveQuoteRequest({ ...draft, day: null })).not.toHaveProperty('scheduledAt');
  });
});

describe('draft on the device', () => {
  it('round-trips, and something else is refused', () => {
    expect(bookingDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(bookingDraftSchema.safeParse({ ...draft, items: { piano: { qty: 1, assembly: false } } }).success).toBe(false);
    expect(bookingDraftSchema.safeParse({ ...draft, items: { box: { qty: 0, assembly: false } } }).success).toBe(false);
  });
});
