import { describe, expect, it } from 'vitest';

import { GPS_ACTIVE_STATUSES, JOB_STATUSES } from './constants';

describe('GPS sharing (COMPLIANCE §9.1)', () => {
  it('runs only from EN_ROUTE_TO_PICKUP until the job is completed', () => {
    const from = JOB_STATUSES.indexOf('EN_ROUTE_TO_PICKUP');
    const until = JOB_STATUSES.indexOf('COMPLETED');
    expect([...GPS_ACTIVE_STATUSES]).toEqual(JOB_STATUSES.slice(from, until));
  });

  it('is off before the mover sets off, and once the job is completed, cancelled or disputed', () => {
    for (const status of ['DRAFT', 'QUOTED', 'BOOKED', 'OFFERED', 'ACCEPTED', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const) {
      expect(GPS_ACTIVE_STATUSES).not.toContain(status);
    }
  });
});
