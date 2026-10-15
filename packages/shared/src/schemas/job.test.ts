import { describe, expect, it } from 'vitest';

import { bookRequestFromDraft, bookRequestSchema } from './booking';
import { JOB_COLUMNS, draftFromJob, jobRowSchema, type JobRow } from './job';

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
