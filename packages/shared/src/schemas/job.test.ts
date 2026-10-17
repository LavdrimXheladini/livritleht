import { describe, expect, it } from 'vitest';

import { bookRequestFromDraft, bookRequestSchema } from './booking';
import { JOB_COLUMNS, draftFromJob, jobDay, jobRowSchema, moveState, type JobEventRow, type JobRow } from './job';

const row = {
  id: '00000000-0000-4000-8000-0000000e0b01',
  status: 'QUOTED',
  type: 'SMALL_MOVE',
  vehicle_class: 'VAN',
  helpers: 2,
  scheduled_at: new Date(2026, 9, 16, 9).toISOString(),
  pickup_area: 'Prishtina',
  pickup_district: null,
  pickup_country: 'XK',
  pickup_label: 'Prishtina',
  pickup_street: null,
  pickup_house_number: null,
  pickup_details: 'Block B, entrance 2',
  pickup_floor: 2,
  pickup_has_lift: false,
  pickup_lat: 42.6629,
  pickup_lon: 21.1655,
  dropoff_area: 'Prizren',
  dropoff_district: null,
  dropoff_country: 'XK',
  dropoff_label: 'Rruga Remzi Ademaj 5, Prizren',
  dropoff_street: 'Rruga Remzi Ademaj',
  dropoff_house_number: '5',
  dropoff_details: '',
  dropoff_floor: 0,
  dropoff_has_lift: false,
  dropoff_lat: 42.2093,
  dropoff_lon: 20.7415,
  items: [{ key: 'sofa3', qty: 1, assembly: false }, { key: 'box', qty: 10, assembly: false }],
  distance_km: '83.2',
  chosen_mover_company_id: '7e570000-0000-4000-8000-000000000002',
  chosen_vehicle_id: '7e57a000-0000-4000-8000-000000000201',
  created_at: '2026-10-15T08:00:00.000Z',
  quotes: [],
};

describe('a saved move', () => {
  it('reads the row PostgREST returns (numeric distance as text)', () => {
    expect(jobRowSchema.parse(row).distance_km).toBe(83.2);
  });

  it('selects the coordinates and only what the move screen shows', () => {
    expect(JOB_COLUMNS).toContain('pickup_lat');
    expect(JOB_COLUMNS).toContain('dropoff_lon');
    expect(JOB_COLUMNS).toMatch(/quotes\(.*mover.*\)$/);
  });

  it('becomes the move on the device again, tied to the saved request', () => {
    const draft = draftFromJob(jobRowSchema.parse(row) as JobRow);
    expect(draft).toMatchObject({
      pickup: { place: { lat: 42.6629, lon: 21.1655, countryCode: 'XK' }, floor: 2, hasLift: false, details: 'Block B, entrance 2' },
      dropoff: { street: 'Rruga Remzi Ademaj', houseNumber: '5', floor: 0, hasLift: null },
      items: { sofa3: { qty: 1, assembly: false }, box: { qty: 10, assembly: false } },
      day: '2026-10-16',
      hour: 9,
      crew: 2,
      vehicleClass: 'VAN',
      choice: { vehicleId: row.chosen_vehicle_id, companyId: row.chosen_mover_company_id },
      jobId: row.id,
    });
    // …and reviewing it again sends a valid request for the same saved one.
    const request = bookRequestFromDraft(draft);
    expect(request?.jobId).toBe(row.id);
    expect(bookRequestSchema.safeParse(request).success).toBe(true);
  });
});

describe('the move day, as the customer follows it', () => {
  const event = (e: string, status: JobEventRow['status'], role: JobEventRow['actor_role'], at: string): JobEventRow => ({ event: e, status, actor_role: role, created_at: at });
  const log: JobEventRow[] = [
    event('booked', 'BOOKED', 'customer', '2026-10-15T08:00:00+00:00'),
    event('offered', 'OFFERED', 'system', '2026-10-15T08:00:00+00:00'),
    event('declined', 'QUOTED', 'mover', '2026-10-15T09:00:00+00:00'),
    event('booked', 'BOOKED', 'customer', '2026-10-15T10:00:00+00:00'),
    event('offered', 'OFFERED', 'system', '2026-10-15T10:00:00+00:00'),
    event('accepted', 'ACCEPTED', 'mover', '2026-10-15T11:00:00+00:00'),
    event('en_route_to_pickup', 'EN_ROUTE_TO_PICKUP', 'mover', '2026-10-22T07:30:00+00:00'),
    event('at_pickup', 'AT_PICKUP', 'mover', '2026-10-22T07:58:00+00:00'),
  ];

  it('starts when a mover accepted, each step with its time — earlier answers don’t count', () => {
    expect(jobDay(log.slice(0, 5))).toBeNull();
    const day = jobDay([...log].reverse())!;
    expect(day.steps).toEqual([
      { status: 'ACCEPTED', at: '2026-10-15T11:00:00+00:00' },
      { status: 'EN_ROUTE_TO_PICKUP', at: '2026-10-22T07:30:00+00:00' },
      { status: 'AT_PICKUP', at: '2026-10-22T07:58:00+00:00' },
      { status: 'IN_TRANSIT', at: null },
      { status: 'AT_DROPOFF', at: null },
      { status: 'COMPLETED', at: null },
    ]);
    expect(day.cancelled).toBeNull();
    expect(day.confirmedAt).toBeNull();
  });

  it('says who cancelled, and when the customer confirmed it was done', () => {
    expect(jobDay([...log, event('cancelled', 'CANCELLED', 'mover', '2026-10-22T08:20:00+00:00')])!.cancelled).toEqual({ at: '2026-10-22T08:20:00+00:00', by: 'mover' });
    const done = [
      ...log,
      event('in_transit', 'IN_TRANSIT', 'mover', '2026-10-22T09:00:00+00:00'),
      event('at_dropoff', 'AT_DROPOFF', 'mover', '2026-10-22T10:00:00+00:00'),
      event('completed', 'COMPLETED', 'mover', '2026-10-22T11:00:00+00:00'),
      event('confirmed', 'COMPLETED', 'customer', '2026-10-22T11:05:00+00:00'),
    ];
    expect(jobDay(done)).toMatchObject({ confirmedAt: '2026-10-22T11:05:00+00:00', cancelled: null });
  });

  it('a move the mover cancelled after accepting reads as theirs to explain', () => {
    const cancelled = { fee: 0, fee_rule: 'mover_cancelled', cancelled_by: 'mover', status_before: 'AT_PICKUP', reason: 'customer_absent', free_until: '2026-10-20T08:00:00+00:00', cancel_late_pct: 50, currency: 'EUR', created_at: '2026-10-22T08:20:00+00:00' };
    const parsed = jobRowSchema.parse({ ...row, status: 'CANCELLED', job_cancellations: cancelled });
    expect(moveState(parsed)).toBe('CANCELLED_BY_MOVER');
    // One per move: PostgREST answers an object; an array or nothing reads the same way.
    expect(jobRowSchema.parse({ ...row, status: 'CANCELLED', job_cancellations: [cancelled] }).job_cancellations).toEqual(parsed.job_cancellations);
    expect(jobRowSchema.parse({ ...row, status: 'CANCELLED', job_cancellations: null }).job_cancellations).toBeNull();
    expect(moveState(jobRowSchema.parse({ ...row, status: 'CANCELLED' }))).toBe('CANCELLED');
  });

  it('is read with the move: its log and a cancellation after acceptance', () => {
    expect(JOB_COLUMNS).toContain('job_events(event,status,actor_role,created_at)');
    expect(JOB_COLUMNS).toContain('job_cancellations(cancelled_by,status_before,reason,free_until,cancel_late_pct,currency,fee,fee_rule,created_at)');
    expect(JOB_COLUMNS).not.toContain('actor_id');
  });
});
