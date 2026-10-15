// Item catalogue for the labour estimate (CLAUDE.md §4). These are the platform's TIME and volume
// estimates only — every price comes from the mover's own rate card (COMPLIANCE §1).
// Item names are translated in @movershub/i18n under `items.<key>` (the app's item picker).

import type { VehicleClass } from './constants';

export type ItemSpec = {
  /** Minutes for one person to carry, load and unload one unit, without stairs. */
  handlingMin: number;
  /** Volume of one unit in tenths of a cubic metre (integer; 18 = 1.8 m³). */
  volumeTenthsM3: number;
  /** Counts toward the mover's heavy-item fee. */
  heavy: boolean;
  /** Can be taken apart and rebuilt → the mover's assembly fee applies when the customer asks for it. */
  assemblable: boolean;
  fragile: boolean;
};

const spec = (handlingMin: number, volumeTenthsM3: number, flags: Partial<Pick<ItemSpec, 'heavy' | 'assemblable' | 'fragile'>> = {}): ItemSpec => ({
  handlingMin,
  volumeTenthsM3,
  heavy: flags.heavy ?? false,
  assemblable: flags.assemblable ?? false,
  fragile: flags.fragile ?? false,
});

export const ITEM_CATALOGUE = {
  box: spec(2, 1),
  suitcase: spec(2, 1),
  chair: spec(3, 3),
  armchair: spec(8, 6),
  sofa2: spec(15, 12, { heavy: true }),
  sofa3: spec(20, 18, { heavy: true }),
  cornerSofa: spec(30, 25, { heavy: true, assemblable: true }),
  bedSingle: spec(15, 10, { assemblable: true }),
  bedDouble: spec(25, 18, { assemblable: true }),
  mattressSingle: spec(5, 4),
  mattressDouble: spec(8, 8),
  wardrobe: spec(25, 15, { heavy: true, assemblable: true }),
  chestOfDrawers: spec(12, 6),
  bookshelf: spec(10, 5, { assemblable: true }),
  desk: spec(12, 7, { assemblable: true }),
  diningTable: spec(12, 8, { assemblable: true }),
  tv: spec(6, 1, { fragile: true }),
  fridge: spec(20, 8, { heavy: true }),
  washingMachine: spec(15, 4, { heavy: true }),
  dishwasher: spec(15, 4, { heavy: true }),
  cooker: spec(15, 3, { heavy: true }),
  bicycle: spec(4, 4),
  mirror: spec(4, 1, { fragile: true }),
  plant: spec(2, 1, { fragile: true }),
  lamp: spec(2, 1, { fragile: true }),
} as const satisfies Record<string, ItemSpec>;

export type ItemKey = keyof typeof ITEM_CATALOGUE;
export const ITEM_KEYS = Object.keys(ITEM_CATALOGUE) as [ItemKey, ...ItemKey[]];

/**
 * A typical load per vehicle class, for prices shown BEFORE the customer lists their items (the
 * landing page's "from" prices, design/DECISIONS.md #11). A platform assumption for display only —
 * the booking always prices the customer's own items. Volumes fit each class (COMPLIANCE §1.1 table).
 */
export const TYPICAL_LOADS: Record<VehicleClass, readonly { key: ItemKey; qty: number; assembly: boolean }[]> = {
  // A few boxes and bags (~0.8 m³)
  SMALL: [
    { key: 'box', qty: 6, assembly: false },
    { key: 'suitcase', qty: 2, assembly: false },
  ],
  // Sofa + 10 boxes (~3.4 m³)
  VAN: [
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'box', qty: 10, assembly: false },
    { key: 'chair', qty: 2, assembly: false },
  ],
  // Studio / 1-room flat (~9.4 m³)
  LARGE_VAN: [
    { key: 'bedDouble', qty: 1, assembly: false },
    { key: 'mattressDouble', qty: 1, assembly: false },
    { key: 'sofa2', qty: 1, assembly: false },
    { key: 'wardrobe', qty: 1, assembly: false },
    { key: 'fridge', qty: 1, assembly: false },
    { key: 'washingMachine', qty: 1, assembly: false },
    { key: 'diningTable', qty: 1, assembly: false },
    { key: 'chair', qty: 2, assembly: false },
    { key: 'box', qty: 15, assembly: false },
  ],
  // 2–3 room flat (~16.9 m³)
  BOX: [
    { key: 'bedDouble', qty: 1, assembly: false },
    { key: 'mattressDouble', qty: 1, assembly: false },
    { key: 'bedSingle', qty: 1, assembly: false },
    { key: 'mattressSingle', qty: 1, assembly: false },
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'armchair', qty: 1, assembly: false },
    { key: 'wardrobe', qty: 2, assembly: false },
    { key: 'chestOfDrawers', qty: 1, assembly: false },
    { key: 'fridge', qty: 1, assembly: false },
    { key: 'washingMachine', qty: 1, assembly: false },
    { key: 'diningTable', qty: 1, assembly: false },
    { key: 'chair', qty: 4, assembly: false },
    { key: 'desk', qty: 1, assembly: false },
    { key: 'box', qty: 30, assembly: false },
  ],
  // House (~31 m³)
  TRUCK: [
    { key: 'bedDouble', qty: 2, assembly: false },
    { key: 'mattressDouble', qty: 2, assembly: false },
    { key: 'bedSingle', qty: 2, assembly: false },
    { key: 'mattressSingle', qty: 2, assembly: false },
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'cornerSofa', qty: 1, assembly: false },
    { key: 'armchair', qty: 2, assembly: false },
    { key: 'wardrobe', qty: 3, assembly: false },
    { key: 'chestOfDrawers', qty: 2, assembly: false },
    { key: 'fridge', qty: 1, assembly: false },
    { key: 'washingMachine', qty: 1, assembly: false },
    { key: 'dishwasher', qty: 1, assembly: false },
    { key: 'diningTable', qty: 1, assembly: false },
    { key: 'chair', qty: 6, assembly: false },
    { key: 'desk', qty: 2, assembly: false },
    { key: 'bookshelf', qty: 2, assembly: false },
    { key: 'box', qty: 50, assembly: false },
  ],
};
