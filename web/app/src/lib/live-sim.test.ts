import { describe, expect, it } from 'vitest';

import type { DemoItem } from './live-demo-types';
import { advance, cargoSlots, etaMinutes, leftKm, simSpeedKmh, simStatus, timelineStates, vanLoad } from './live-sim';

const items: DemoItem[] = [
  { key: 'sofa', size: '220×95×85 cm', volumeTenthsM3: 18, room: 'living', fragile: false, slots: 3 },
  { key: 'mirror', size: '120×80 cm', volumeTenthsM3: 1, room: 'hall', fragile: true, slots: 1 },
];

describe('live dashboard simulation', () => {
  it('derives status from progress', () => {
    expect(simStatus(0.01)).toBe('loading');
    expect(simStatus(0.5)).toBe('onTheWay');
    expect(simStatus(0.99)).toBe('atDropoff');
    expect(timelineStates(0.01)).toEqual(['done', 'done', 'current', 'todo', 'todo']);
    expect(timelineStates(0.5)).toEqual(['done', 'done', 'done', 'current', 'todo']);
  });

  it('loops progress and counts down distance', () => {
    expect(advance(0.99, 0.1, 0.2)).toBeCloseTo(0.01);
    expect(leftKm({ km: 82 }, 0.5)).toBe(41);
    expect(leftKm({ km: 82 }, 1)).toBe(0);
  });

  it('is stationary while loading and adds a border wait on long cross-border legs', () => {
    expect(simSpeedKmh({ km: 82 }, 0.02)).toBe(0);
    expect(simSpeedKmh({ km: 82 }, 0.5)).toBeGreaterThan(50);
    const domestic = etaMinutes({ km: 1200, crossBorder: false }, 0.5);
    expect(etaMinutes({ km: 1200, crossBorder: true }, 0.5)).toBe(domestic + 45);
  });

  it('computes van load and fills the cargo grid in item order', () => {
    expect(vanLoad({ items, capacityM3: 13 })).toEqual({ usedTenths: 19, percent: 15 });
    const slots = cargoSlots({ items });
    expect(slots).toHaveLength(18);
    expect(slots.slice(0, 5)).toEqual([{ item: 0 }, { item: 0 }, { item: 0 }, { item: 1 }, { item: null }]);
  });
});
