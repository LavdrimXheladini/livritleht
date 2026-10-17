import { describe, expect, it } from 'vitest';

import { ITEM_KEYS, TYPICAL_LOADS } from '../items';
import { demoPlace } from '../places';
import {
  ITEM_GROUPS,
  bookRequestFromDraft,
  bookRequestSchema,
  bookingDraftSchema,
  CANCELLATION_FEES_CHARGED,
  MOVER_LATE_FREE_CANCEL_MINUTES,
  cancellationNow,
  cancellationTerms,
  freeCancellationUntil,
  lateCancellationFee,
  jobType,
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
  choice: null,
  jobId: null,
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
  it('a move saved before choosing a mover existed has no choice yet', () => {
    const { choice: _choice, ...older } = draft;
    expect(bookingDraftSchema.parse(older).choice).toBeNull();
  });

  it('round-trips, and something else is refused', () => {
    expect(bookingDraftSchema.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(bookingDraftSchema.safeParse({ ...draft, items: { piano: { qty: 1, assembly: false } } }).success).toBe(false);
    expect(bookingDraftSchema.safeParse({ ...draft, items: { box: { qty: 0, assembly: false } } }).success).toBe(false);
  });
});

describe('booking request', () => {
  const chosen = { ...draft, choice: { vehicleId: '7e57a000-0000-4000-8000-000000000201', companyId: '7e570000-0000-4000-8000-000000000002' } };

  it('waits for a mover and a day', () => {
    expect(bookRequestFromDraft(draft)).toBeNull();
    expect(bookRequestFromDraft({ ...chosen, hour: null })).toBeNull();
  });

  it('sends the move and the chosen van — never a price — and the server schema accepts it', () => {
    const request = bookRequestFromDraft(chosen)!;
    expect(request).toMatchObject({ vehicleId: chosen.choice.vehicleId, helpers: 2, vehicleClass: 'VAN', scheduledAt: scheduledAt('2026-10-20', 9) });
    expect(request).not.toHaveProperty('jobId');
    expect(bookRequestSchema.safeParse(request).success).toBe(true);
    expect(bookRequestSchema.safeParse({ ...request, moverPrice: 1 }).success).toBe(false);
    expect(bookRequestFromDraft({ ...chosen, jobId: '00000000-0000-4000-8000-0000000e0001' })).toHaveProperty('jobId', '00000000-0000-4000-8000-0000000e0001');
  });

  it('refuses a stop that is not complete', () => {
    const request = bookRequestFromDraft(chosen)!;
    expect(bookRequestSchema.safeParse({ ...request, pickup: { ...request.pickup, hasLift: null } }).success).toBe(false);
    expect(bookRequestSchema.safeParse({ ...request, dropoff: { ...request.dropoff, details: '' } }).success).toBe(false);
  });
});

describe('job type', () => {
  const items = (n: number) => [{ key: 'box' as const, qty: n, assembly: false }];
  it('is a label from what was listed', () => {
    expect(jobType({ crossBorder: true, vehicleClass: 'VAN', items: items(1) })).toBe('CROSS_BORDER');
    expect(jobType({ crossBorder: false, vehicleClass: 'SMALL', items: items(3) })).toBe('ITEM');
    expect(jobType({ crossBorder: false, vehicleClass: 'VAN', items: items(10) })).toBe('SMALL_MOVE');
    expect(jobType({ crossBorder: false, vehicleClass: 'BOX', items: items(10) })).toBe('FULL_MOVE');
    expect(jobType({ crossBorder: false, vehicleClass: 'LARGE_VAN', items: items(120) })).toBe('FULL_MOVE');
  });
});

describe('cancellation terms', () => {
  it('are read from the company row only when both are set to one of the choices', () => {
    expect(cancellationTerms({ cancel_free_hours: 48, cancel_late_pct: 50 })).toEqual({ freeHours: 48, latePct: 50 });
    expect(cancellationTerms({ cancel_free_hours: null, cancel_late_pct: null })).toBeNull();
    expect(cancellationTerms({ cancel_free_hours: 12, cancel_late_pct: 50 })).toBeNull();
  });
});

describe('cancelling after a mover accepted (the same examples as the database test)', () => {
  // EUR 50.00, free until 48 hours before, then 50 %; arrival S.
  const S = '2026-10-22T08:00:00.000Z';
  const at = (ms: number) => new Date(Date.parse(S) + ms);
  const H = 3_600_000;
  const base = { status: 'ACCEPTED' as const, scheduledAt: S, moverPrice: 5000, currency: 'EUR' as const, terms: { freeHours: 48 as const, latePct: 50 as const }, firstPickupPhotoAt: null };

  it('is free until the moment the free time ends, that moment included', () => {
    expect(cancellationNow({ ...base, now: at(-48 * H - 1000) })).toMatchObject({ fee: 0, rule: 'free_period' });
    expect(cancellationNow({ ...base, now: at(-48 * H) })).toMatchObject({ fee: 0, rule: 'free_period', freeUntil: at(-48 * H) });
    expect(cancellationNow({ ...base, now: at(-48 * H + 1000) })).toMatchObject({ fee: 2500, rule: 'late' });
  });

  it('is free from 60 minutes after the arrival time unless a pickup photo was added before then (owner, 2026-10-17)', () => {
    expect(MOVER_LATE_FREE_CANCEL_MINUTES).toBe(60);
    expect(cancellationNow({ ...base, status: 'EN_ROUTE_TO_PICKUP', now: at(59 * 60_000 + 59_000) })).toMatchObject({ fee: 2500, rule: 'late' });
    expect(cancellationNow({ ...base, status: 'EN_ROUTE_TO_PICKUP', now: at(H) })).toMatchObject({ fee: 0, rule: 'mover_late' });
    expect(cancellationNow({ ...base, status: 'ACCEPTED', now: at(H) })).toMatchObject({ fee: 0, rule: 'mover_late' });
    // "Arrived" alone is the mover's word: without a photo it's still the mover late.
    expect(cancellationNow({ ...base, status: 'AT_PICKUP', now: at(2 * H) })).toMatchObject({ fee: 0, rule: 'mover_late' });
    expect(cancellationNow({ ...base, status: 'AT_PICKUP', firstPickupPhotoAt: at(30 * 60_000).toISOString(), now: at(2 * H) })).toMatchObject({ fee: 2500, rule: 'late' });
    expect(cancellationNow({ ...base, status: 'AT_PICKUP', firstPickupPhotoAt: at(61 * 60_000).toISOString(), now: at(2 * H) })).toMatchObject({ fee: 0, rule: 'mover_late' });
  });

  it("charges the mover's share, rounded down to the price step — never more", () => {
    expect(cancellationNow({ ...base, terms: { freeHours: 48, latePct: 0 }, now: at(-H) })).toMatchObject({ fee: 0, rule: 'terms_free' });
    expect(lateCancellationFee(5001, 50, 'EUR')).toBe(2500);
    expect(lateCancellationFee(5001, 25, 'EUR')).toBe(1250);
    expect(lateCancellationFee(4999, 25, 'EUR')).toBe(1249);
    expect(lateCancellationFee(5001, 100, 'EUR')).toBe(5001);
    expect(lateCancellationFee(153000, 25, 'ALL')).toBe(38200);
    expect(lateCancellationFee(99900, 50, 'MKD')).toBe(49900);
    expect(lateCancellationFee(100000, 100, 'RSD')).toBe(100000);
  });

  it('is not cancelled in the app once loaded, nor before a mover accepted', () => {
    expect(cancellationNow({ ...base, status: 'IN_TRANSIT', now: at(-H) })).toBeNull();
    expect(cancellationNow({ ...base, status: 'OFFERED', now: at(-H) })).toBeNull();
  });

  it('counts "7 days before" on the clock in Central Europe, so a clock change never takes an hour', () => {
    expect(freeCancellationUntil('2026-10-30T08:00:00Z', 168).toISOString()).toBe('2026-10-23T08:00:00.000Z');
    expect(freeCancellationUntil('2027-04-01T07:00:00Z', 168).toISOString()).toBe('2027-03-25T08:00:00.000Z');
    expect(freeCancellationUntil('2026-10-30T08:00:00Z', 48).toISOString()).toBe('2026-10-28T08:00:00.000Z');
  });

  it('records the fee only: nothing is charged before card payments', () => {
    expect(CANCELLATION_FEES_CHARGED).toBe(false);
  });
});
