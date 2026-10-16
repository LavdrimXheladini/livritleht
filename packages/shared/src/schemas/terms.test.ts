import { describe, expect, it } from 'vitest';

import { earliestTermsStart, publishedTermsSchema, sameJson, termsStatus, type TermsVersionRow } from './terms';

const now = new Date('2026-11-10T12:00:00Z');
const version = (n: number, effective: string): TermsVersionRow => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  audience: 'mover',
  version: n,
  summary: n > 1 ? 'New fees.' : null,
  published_at: '2026-10-20T09:00:00Z',
  effective_at: effective,
});
const v1 = version(1, '2026-10-20T09:00:00Z');
const v2 = version(2, '2026-11-25T00:00:00Z');

describe('terms status', () => {
  it('nothing published: nothing to accept', () => {
    expect(termsStatus([], [], now)).toEqual({ current: null, mustAccept: null, upcoming: null, firstTime: true });
  });

  it('the version in effect must be accepted first', () => {
    expect(termsStatus([v1], [], now)).toMatchObject({ current: v1, mustAccept: v1, firstTime: true });
    expect(termsStatus([v1], [v1.id], now)).toMatchObject({ current: v1, mustAccept: null, firstTime: false });
  });

  it('a version that applies later is a notice until it applies, then must be accepted', () => {
    expect(termsStatus([v1, v2], [v1.id], now)).toMatchObject({ mustAccept: null, upcoming: v2 });
    expect(termsStatus([v1, v2], [v1.id, v2.id], now)).toMatchObject({ mustAccept: null, upcoming: null });
    const later = new Date('2026-11-26T00:00:00Z');
    expect(termsStatus([v2, v1], [v1.id], later)).toMatchObject({ current: v2, mustAccept: v2, upcoming: null, firstTime: false });
  });
});

describe('a published version', () => {
  it('holds the text in the legal pages\' shape', () => {
    const content = { doc: 'mover-terms', locale: 'en', updated: '2026-10-16', text: { intro: 'x', sections: [{ id: 'a', heading: 'A', blocks: ['p', { list: ['i'] }, { see: 'privacy' }] }] } };
    expect(publishedTermsSchema.parse(content)).toEqual(content);
    expect(publishedTermsSchema.safeParse({ ...content, text: { intro: 'x', sections: [{ id: 'a', heading: 'A', blocks: [{ see: 'nowhere' }] }] } }).success).toBe(false);
  });
});

describe('publishing', () => {
  it('new terms for movers start 16 days on (15 days\' notice); the first version and customers\' at once', () => {
    const at = new Date('2026-10-16T20:00:00Z');
    expect(earliestTermsStart('mover', true, at)).toBe('2026-11-01');
    expect(earliestTermsStart('mover', false, at)).toBe('2026-10-16');
    expect(earliestTermsStart('customer', true, at)).toBe('2026-10-16');
  });

  it('compares a published text with the app\'s whatever the key order', () => {
    expect(sameJson({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });
});
