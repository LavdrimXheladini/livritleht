// Pure helpers for the simulated "Live moves" dashboard (client-safe, unit-tested).
import type { LiveJob } from './live-demo-types';

export type SimStatus = 'loading' | 'onTheWay' | 'atDropoff';
export type StepState = 'done' | 'current' | 'todo';

/** Progress below this = still loading at pickup (AT_PICKUP); above END = at drop-off (AT_DROPOFF). */
export const LOADING_UNTIL = 0.06;
export const AT_DROPOFF_FROM = 0.98;

export function simStatus(t: number): SimStatus {
  if (t < LOADING_UNTIL) return 'loading';
  if (t >= AT_DROPOFF_FROM) return 'atDropoff';
  return 'onTheWay';
}

/** Next progress value; loops back to the start so the demo keeps running. */
export function advance(t: number, ratePerS: number, dtS: number): number {
  return (t + ratePerS * dtS) % 1;
}

export function leftKm(job: Pick<LiveJob, 'km'>, t: number): number {
  return Math.max(0, Math.round(job.km * (1 - t)));
}

/** Simulated speed: town traffic for short jobs, motorway for long ones. Never used to rate movers (COMPLIANCE §9.1). */
export function simSpeedKmh(job: Pick<LiveJob, 'km'>, t: number): number {
  const status = simStatus(t);
  if (status !== 'onTheWay') return 0;
  return job.km < 20 ? Math.round(28 + 10 * Math.sin(t * 60)) : Math.round(78 + 16 * Math.sin(t * 50));
}

/** Minutes to drop-off: average speed for the distance left, plus a border wait on long cross-border legs. */
export function etaMinutes(job: Pick<LiveJob, 'km' | 'crossBorder'>, t: number): number {
  const left = leftKm(job, t);
  const avg = job.km < 20 ? 25 : 75;
  const border = job.crossBorder && left > 200 ? 45 : 0;
  return Math.max(1, Math.round((left / avg) * 60 + border));
}

/** Used volume (tenths of m³) and load percent of the vehicle's nominal capacity. */
export function vanLoad(job: Pick<LiveJob, 'items' | 'capacityM3'>): { usedTenths: number; percent: number } {
  const usedTenths = job.items.reduce((sum, it) => sum + it.volumeTenthsM3, 0);
  return { usedTenths, percent: Math.min(99, Math.round((usedTenths / (job.capacityM3 * 10)) * 100)) };
}

export type CargoSlot = { item: number } | { item: null };

/** Fill the 6×3 van grid in item order; remaining cells are free space. */
export function cargoSlots(job: Pick<LiveJob, 'items'>, total = 18): CargoSlot[] {
  const slots: CargoSlot[] = [];
  job.items.forEach((it, i) => {
    for (let n = 0; n < it.slots && slots.length < total; n++) slots.push({ item: i });
  });
  while (slots.length < total) slots.push({ item: null });
  return slots;
}

/** Booked → Mover accepted → Picked up → On the way → Delivered. */
export function timelineStates(t: number): [StepState, StepState, StepState, StepState, StepState] {
  const status = simStatus(t);
  if (status === 'loading') return ['done', 'done', 'current', 'todo', 'todo'];
  if (status === 'atDropoff') return ['done', 'done', 'done', 'done', 'current'];
  return ['done', 'done', 'done', 'current', 'todo'];
}
