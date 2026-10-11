import { describe, expect, it } from 'vitest';

import { VEHICLE_CLASSES } from './constants';
import { ITEM_CATALOGUE, TYPICAL_LOADS } from './items';

/** Upper end of each class's load (COMPLIANCE §1.1 table), in tenths of m³. */
const CAPACITY_TENTHS = { SMALL: 30, VAN: 60, LARGE_VAN: 150, BOX: 220, TRUCK: 400 } as const;

describe('typical loads', () => {
  it('fit their vehicle class and grow with it', () => {
    let previous = 0;
    for (const cls of VEHICLE_CLASSES) {
      const volume = TYPICAL_LOADS[cls].reduce((sum, it) => sum + ITEM_CATALOGUE[it.key].volumeTenthsM3 * it.qty, 0);
      expect(volume).toBeLessThanOrEqual(CAPACITY_TENTHS[cls]);
      expect(volume).toBeGreaterThan(previous);
      previous = volume;
    }
  });
});
