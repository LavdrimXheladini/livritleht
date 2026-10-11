import { describe, expect, it } from 'vitest';

import { resolveLocale, resources } from './index';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

const flat = Object.fromEntries(
  Object.entries(resources).map(([lng, { translation }]) => [lng, flatten(translation as Tree)]),
);
const enKeys = Object.keys(flat.en ?? {}).sort();

describe('locale files', () => {
  it.each(Object.keys(flat))('%s has exactly the same keys as en', (lng) => {
    expect(Object.keys(flat[lng] ?? {}).sort()).toEqual(enKeys);
  });

  it.each(Object.keys(flat))('%s has no empty strings', (lng) => {
    const empty = Object.entries(flat[lng] ?? {}).filter(([, v]) => v.trim() === '');
    expect(empty).toEqual([]);
  });
});

// COMPLIANCE §12 / §13: the platform must never present itself as the mover or employer.
// `\b` is ASCII-only in JS, so use Unicode letter boundaries for ë, š, č, ł …
const word = (src: string) => new RegExp(`(?<!\\p{L})(?:${src})(?!\\p{L})`, 'iu');

const BANNED: Record<string, RegExp[]> = {
  en: [
    word('our (movers?|team|vans?|drivers?|price)'),
    word('ranktrip (movers?|price)'),
    word('ranktrip will move'),
    word('hire ranktrip'),
    word('ranktrip (covers|guarantees)'),
    word('drivers?|workers?|staff|employees?|salary|salaries|wages?'),
    word('assigned to you'),
  ],
  sq: [word('shoferë?t?|punëtor\\p{L}*|rrog\\p{L}*|pag[ëe]n?'), word('tanë')],
  pl: [word('nasi|naszych|nasza|nasz'), word('kierowc\\p{L}*|pracowni\\p{L}*|pensj\\p{L}*')],
  sr: [word('naši|naše|naših|naš'), word('vozač\\p{L}*|radnik\\p{L}*|zaposlen\\p{L}*|plat[aeu]')],
  de: [
    word('unser\\p{L}*'),
    word('fahrer\\p{L}*|mitarbeiter\\p{L}*|angestellte\\p{L}*|gehalt|gehälter|lohn|löhne'),
    word('ranktrip (garantiert|übernimmt|haftet)'),
    word('dir zugewiesen|ihnen zugewiesen'),
  ],
};

describe('banned wording (COMPLIANCE §12)', () => {
  for (const [lng, patterns] of Object.entries(BANNED)) {
    it(`${lng} strings use marketplace wording`, () => {
      const hits = Object.entries(flat[lng] ?? {}).flatMap(([key, value]) =>
        patterns.filter((p) => p.test(value)).map((p) => `${key}: "${value}" matches ${p}`),
      );
      expect(hits).toEqual([]);
    });
  }
});

describe('resolveLocale', () => {
  it('maps regional tags and ex-Yugoslav languages', () => {
    expect(resolveLocale('sq-XK')).toBe('sq');
    expect(resolveLocale('pl_PL')).toBe('pl');
    expect(resolveLocale('hr-HR')).toBe('sr');
    expect(resolveLocale('bs')).toBe('sr');
    expect(resolveLocale('de-AT')).toBe('de');
    expect(resolveLocale('fr-FR')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});
