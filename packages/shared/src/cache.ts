// Small in-memory cache with an expiry and a size cap, per process or edge isolate. Used by the
// `quote` function for road distances, so repeat quotes don't call the fair-use OSRM server again.

import type { Place } from './schemas/geo';

export function ttlCache<V>({ ttlMs, maxEntries, now = Date.now }: { ttlMs: number; maxEntries: number; now?: () => number }) {
  const entries = new Map<string, { value: V; expires: number }>();
  return {
    get(key: string): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: V): void {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      // The oldest go first once the cache is full.
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) break;
        entries.delete(oldest);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

/**
 * Cache key for a road route: both stops rounded to 4 decimals (~11 m), so the same addresses —
 * a re-quote, another crew size — hit the cache, while the distance (and price) stays exact enough.
 */
export function routeCacheKey(pickup: Pick<Place, 'lat' | 'lon'>, dropoff: Pick<Place, 'lat' | 'lon'>): string {
  const point = (p: Pick<Place, 'lat' | 'lon'>) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
  return `${point(pickup)};${point(dropoff)}`;
}
