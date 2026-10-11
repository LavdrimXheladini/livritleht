// Client-safe types for the "Live moves" dashboard demo. Data is built on the server
// (live-demo.ts, server-only) and passed to client components.
import type { VehicleClass } from '@ranktrip/shared';

import type { LineCoords } from './geo/types';

export const DEMO_ITEMS = [
  'sofa',
  'wardrobe',
  'mattress',
  'washingMachine',
  'mirror',
  'boxes',
  'plants',
  'tv',
  'desk',
  'bicycle',
  'suitcases',
  'armchair',
  'bookshelf',
  'lamp',
] as const;
export type DemoItemKey = (typeof DEMO_ITEMS)[number];

export const DEMO_ROOMS = ['living', 'bedroom', 'bathroom', 'hall', 'all', 'balcony', 'office', 'garage'] as const;
export type DemoRoom = (typeof DEMO_ROOMS)[number];

export type DemoItem = {
  key: DemoItemKey;
  /** "×14" count shown after the name, if any. */
  count?: number;
  /** "220×95×85 cm"; 'mixed' for boxes; null when not measured. */
  size: string | 'mixed' | null;
  /** Volume in tenths of a cubic metre (integer, avoids float sums). */
  volumeTenthsM3: number;
  room: DemoRoom | null;
  fragile: boolean;
  /** Cargo slots this item takes in the van-load grid (6×3). */
  slots: number;
};

/** One simulated active job. Prices are sample rates (design/DECISIONS.md #4), in cents. */
export type LiveJob = {
  id: string;
  /** i18n key suffix of the sample mover company (`dashboard.companies.<key>`). */
  company: 'a' | 'b' | 'c';
  vehicleClass: VehicleClass;
  from: string;
  to: string;
  km: number;
  crossBorder: boolean;
  /** Route enters or leaves a non-EU country → customs documentation notice (COMPLIANCE §11). */
  customsNotice: boolean;
  takeRatePct: number;
  moverPriceCents: number;
  currency: 'EUR';
  capacityM3: number;
  geometry: LineCoords;
  items: readonly DemoItem[];
  /** Simulation: starting progress (0…1) and progress per second. */
  startT: number;
  ratePerS: number;
};
