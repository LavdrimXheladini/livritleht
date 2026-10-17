import { describe, expect, it } from 'vitest';

import { JOB_STATUSES } from '../constants';
import { MOVER_STEPS, isCustomerAction, jobTransitionSchema, moverJobRowSchema, nextMoverStep } from './job-transition';

const jobId = '00000000-0000-4000-8000-0000000e0d01';

describe("the mover's steps on the move day", () => {
  it('go one at a time, in order, from the acceptance to done', () => {
    expect(nextMoverStep('ACCEPTED')).toBe('EN_ROUTE_TO_PICKUP');
    expect(nextMoverStep('EN_ROUTE_TO_PICKUP')).toBe('AT_PICKUP');
    expect(nextMoverStep('AT_PICKUP')).toBe('IN_TRANSIT');
    expect(nextMoverStep('IN_TRANSIT')).toBe('AT_DROPOFF');
    expect(nextMoverStep('AT_DROPOFF')).toBe('COMPLETED');
    for (const s of ['DRAFT', 'QUOTED', 'BOOKED', 'OFFERED', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const) expect(nextMoverStep(s)).toBeNull();
    for (const s of MOVER_STEPS) expect(JOB_STATUSES).toContain(s);
  });

  it('are requested by naming the step, never anything else', () => {
    expect(jobTransitionSchema.safeParse({ action: 'step', jobId, to: 'AT_PICKUP' }).success).toBe(true);
    expect(jobTransitionSchema.safeParse({ action: 'step', jobId, to: 'CANCELLED' }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ action: 'step', jobId, to: 'ACCEPTED' }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ action: 'step', jobId, to: 'AT_PICKUP', price: 100 }).success).toBe(false);
  });
});

describe('cancelling and confirming', () => {
  it('the customer agrees to a fee as whole minor units, at most what they were shown', () => {
    expect(jobTransitionSchema.safeParse({ action: 'cancel', jobId }).success).toBe(true);
    expect(jobTransitionSchema.safeParse({ action: 'cancel', jobId, maxFee: 2500 }).success).toBe(true);
    expect(jobTransitionSchema.safeParse({ action: 'cancel', jobId, maxFee: -1 }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ action: 'cancel', jobId, maxFee: 12.5 }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ action: 'cancel', jobId, fee: 0 }).success).toBe(false);
  });

  it('the mover may give one of the fixed reasons, or none — never free text', () => {
    expect(jobTransitionSchema.safeParse({ action: 'mover_cancel', jobId }).success).toBe(true);
    expect(jobTransitionSchema.safeParse({ action: 'mover_cancel', jobId, reason: 'customer_absent' }).success).toBe(true);
    expect(jobTransitionSchema.safeParse({ action: 'mover_cancel', jobId, reason: 'sick' }).success).toBe(false);
    expect(jobTransitionSchema.safeParse({ action: 'mover_cancel', jobId, reason: 'cannot_do', text: 'why' }).success).toBe(false);
  });

  it('customers book, cancel and confirm; movers answer and take the steps', () => {
    expect(['book_test', 'cancel', 'confirm'].every((a) => isCustomerAction(a as never))).toBe(true);
    expect(['accept', 'decline', 'step', 'mover_cancel'].some((a) => isCustomerAction(a as never))).toBe(false);
  });
});

describe("a move as the mover's app reads it", () => {
  const row = {
    offer_id: '00000000-0000-4000-8000-0000000e0d02',
    offer_status: 'accepted',
    offer_expires_at: '2026-10-20T08:00:00+00:00',
    job_id: jobId,
    status: 'AT_PICKUP',
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: '2026-10-22T08:00:00+00:00',
    items: [{ key: 'box', qty: 5, assembly: false }],
    distance_km: '83.2',
    est_labor_min: 40,
    pickup_area: 'Prishtina',
    pickup_district: 'Dardania',
    pickup_country: 'XK',
    pickup_floor: 2,
    pickup_has_lift: true,
    dropoff_area: 'Prizren',
    dropoff_district: null,
    dropoff_country: 'XK',
    dropoff_floor: 0,
    dropoff_has_lift: false,
    currency: 'EUR',
    line_items: [{ kind: 'base', amount: 5000 }],
    mover_price: 5000,
    take_rate_pct: 20,
    platform_commission: 1000,
    mover_payout: 4000,
    cancel_free_hours: 48,
    cancel_late_pct: 50,
    pickup_label: 'Rr. Agim Ramadani 12, Prishtina',
    pickup_street: 'Rr. Agim Ramadani',
    pickup_house_number: '12',
    pickup_details: 'Ring twice',
    pickup_lat: 42.6629,
    pickup_lon: 21.1655,
    dropoff_label: 'Prizren',
    dropoff_street: null,
    dropoff_house_number: null,
    dropoff_details: '',
    dropoff_lat: 42.2139,
    dropoff_lon: 20.7397,
  };

  it('reads the job-day columns', () => {
    const parsed = moverJobRowSchema.parse({
      ...row,
      on_my_way_from: '2026-10-22T02:00:00+00:00',
      last_event_at: '2026-10-22T07:58:00+00:00',
      ended_at: null,
      cancelled_by: null,
      cancel_reason: null,
      cancellation_fee: null,
      fee_rule: null,
      confirmed_at: null,
      absent_reason_from: '2026-10-22T08:15:00+00:00',
    });
    expect(parsed).toMatchObject({ status: 'AT_PICKUP', on_my_way_from: '2026-10-22T02:00:00+00:00', absent_reason_from: '2026-10-22T08:15:00+00:00' });
  });

  it('still reads a server without them (before the job day is deployed)', () => {
    expect(moverJobRowSchema.parse(row)).toMatchObject({ on_my_way_from: null, ended_at: null, cancelled_by: null, fee_rule: null });
  });
});
