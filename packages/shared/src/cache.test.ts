import { describe, expect, it } from 'vitest';

import { routeCacheKey, ttlCache } from './cache';

describe('ttl cache', () => {
  it('returns a value until it expires', () => {
    let t = 0;
    const cache = ttlCache<number>({ ttlMs: 1000, maxEntries: 10, now: () => t });
    cache.set('a', 42);
    t = 999;
    expect(cache.get('a')).toBe(42);
    t = 1000;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('drops the oldest entries once full', () => {
    const cache = ttlCache<string>({ ttlMs: 1000, maxEntries: 2, now: () => 0 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.set('a', 'A2'); // written again: now the newest
    cache.set('c', 'C');
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual(['A2', undefined, 'C']);
    expect(cache.size).toBe(2);
  });
});

describe('route cache key', () => {
  const prishtina = { lat: 42.6629, lon: 21.1655 };
  const prizren = { lat: 42.2139, lon: 20.7397 };

  it('is the same for stops within a few metres', () => {
    expect(routeCacheKey({ lat: 42.66291, lon: 21.16549 }, prizren)).toBe(routeCacheKey(prishtina, prizren));
  });

  it('tells apart different stops and the direction of travel', () => {
    expect(routeCacheKey({ lat: 42.6639, lon: 21.1655 }, prizren)).not.toBe(routeCacheKey(prishtina, prizren));
    expect(routeCacheKey(prizren, prishtina)).not.toBe(routeCacheKey(prishtina, prizren));
  });
});
