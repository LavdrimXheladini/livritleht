// Item catalogue for the labour estimate (CLAUDE.md §4). These are the platform's TIME and volume
// estimates only — every price comes from the mover's own rate card (COMPLIANCE §1).
// Item names are translated in @ranktrip/i18n when the booking flow adds its item picker.

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
