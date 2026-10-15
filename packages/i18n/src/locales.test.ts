import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveLocale, resources } from './index';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

// Every namespace, keys prefixed with it (e.g. "admin:title").
const flat = Object.fromEntries(
  Object.entries(resources).map(([lng, namespaces]) => [
    lng,
    Object.fromEntries(Object.entries(namespaces).flatMap(([ns, tree]) => Object.entries(flatten(tree as Tree)).map(([k, v]) => [`${ns}:${k}`, v]))),
  ]),
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
    word('our (movers?|team|vans?|drivers?|prices?)'),
    word("movershub(?:['’]s)? (movers?|prices?|team|vans?)"),
    word('movershub will move'),
    word('hire movershub'),
    word('movershub (covers|guarantees)'),
    word('drivers?|workers?|staff|employees?|salary|salaries|wages?'),
    word('assigned to you'),
  ],
  sq: [
    // Forms of "pagë" (wage) only — "pagesa" (payment, payout) is fine.
    word('shofer\\p{L}*|punëtor\\p{L}*|punonjës\\p{L}*|staf\\p{L}*|rrog\\p{L}*|pag(?:a|at|ave|ash|ë|ën|ës|e|en|es)'),
    word('tanë'),
    word('(transportues\\p{L}*|ekip\\p{L}*|çmim\\p{L}*|furgon\\p{L}*|kamion\\p{L}*) (ynë|jonë|tonë|tona)'),
    word('movershub (garanton|mbulon)|çmim\\p{L}* (i|e) movershub\\p{L}*'),
  ],
  pl: [
    word('nasz(?:a|e|ą|ego|ej|emu|ym|ymi|ych)?|nasi'),
    // Forms of "płaca" (wage) only — "płacisz", "płacę" (you pay, I pay) are fine.
    word('kierowc\\p{L}*|pracowni\\p{L}*|personel\\p{L}*|pensj\\p{L}*|wynagrodze\\p{L}*|płac(?:a|e|y|om|ami|ach)'),
    word('movershub (gwarantuje|pokrywa)|cen(?:a|y|ę|ą|ie) movershub\\p{L}*'),
  ],
  sr: [
    // Listed forms: a catch-all "naš…" would flag "našli" (found).
    word('naš(?:a|e|eg|ega|em|emu|i|ih|im|ima|oj|om|u)?'),
    // "plaća" is left out: it also means "pays".
    word('vozač\\p{L}*|radni[kc]\\p{L}*|zaposlen\\p{L}*|osoblj\\p{L}*|plat[aeu]'),
    word('movershub (garantuje|pokriva)|movershub cen\\p{L}*|cen(?:a|e|u) movershub\\p{L}*'),
  ],
  de: [
    word('unser\\p{L}*'),
    word('fahrer\\p{L}*|mitarbeiter\\p{L}*|arbeiter\\p{L}*|angestellte\\p{L}*|beschäftigte\\p{L}*|personal|gehalt|gehälter|lohn|löhne'),
    word('movershub (garantiert|übernimmt|haftet)|movershub-?preis\\p{L}*|preise? von movershub'),
    word('dir zugewiesen|ihnen zugewiesen'),
  ],
};

const banned = (lng: string, text: string) => (BANNED[lng] ?? []).filter((p) => p.test(text));

describe('banned wording (COMPLIANCE §12)', () => {
  for (const [lng, patterns] of Object.entries(BANNED)) {
    it(`${lng} strings use marketplace wording`, () => {
      const hits = Object.entries(flat[lng] ?? {}).flatMap(([key, value]) =>
        patterns.filter((p) => p.test(value)).map((p) => `${key}: "${value}" matches ${p}`),
      );
      expect(hits).toEqual([]);
    });
  }

  // The patterns themselves: every §12 phrase is caught in each language, while words that only
  // look alike — and are in the texts today — pass.
  const MUST_CATCH: Record<string, string[]> = {
    en: ['Our movers', "MoversHub's movers", 'MoversHub price', 'Hire MoversHub', 'MoversHub guarantees', 'Drivers', 'Staff', 'Salary', 'Assigned to you'],
    sq: ['transportuesit tanë', 'ekipi ynë', 'çmimi ynë', 'shoferi', 'punonjësit', 'stafi', 'paga', 'rroga', 'MoversHub garanton', 'Çmimi i MoversHub'],
    pl: ['nasi przewoźnicy', 'nasze ceny', 'naszą ekipę', 'kierowca', 'pracownicy', 'personel', 'wynagrodzenie', 'płaca', 'MoversHub gwarantuje', 'cena MoversHub'],
    sr: ['naši prevoznici', 'naša cena', 'našu ekipu', 'vozači', 'radnici', 'osoblje', 'plata', 'MoversHub garantuje', 'MoversHub cena'],
    de: ['unsere Umzugsunternehmen', 'Fahrer', 'Arbeiter', 'Mitarbeiter', 'Personal', 'Beschäftigte', 'Lohn', 'MoversHub-Preis', 'MoversHub garantiert', 'dir zugewiesen'],
  };
  const MUST_PASS: Record<string, string[]> = {
    en: ['Movers on MoversHub', "Mover's price", 'Payout', 'Accept job', "Mover's insurance covers"],
    sq: ['Pagesa për ty', 'pagesën', 'paguhesh', 'kushton', 'çmimi i transportuesit'],
    pl: ['Płacisz w aplikacji', 'Jak płacę?', 'Wypłata', 'cena przewoźnika'],
    sr: ['našli', 'plaćanje', 'Isplata', 'radni sto', 'osiguranja pokrivaju'],
    de: ['Arbeitszimmer', 'Personalausweis', 'Auszahlung', 'Preis des Umzugsunternehmens'],
  };
  for (const lng of Object.keys(BANNED)) {
    it(`${lng} patterns catch every §12 phrase and nothing that only looks alike`, () => {
      expect((MUST_CATCH[lng] ?? []).filter((phrase) => banned(lng, phrase).length === 0)).toEqual([]);
      expect((MUST_PASS[lng] ?? []).filter((phrase) => banned(lng, phrase).length > 0)).toEqual([]);
    });
  }

  it('texts outside the translation files (sign-in email and SMS) use marketplace wording too', () => {
    const root = join(import.meta.dirname, '..', '..', '..', 'supabase');
    const templates = readdirSync(join(root, 'templates'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => readFileSync(join(root, 'templates', f), 'utf8').replace(/<[^>]+>/g, ' '));
    const config = [...readFileSync(join(root, 'config.toml'), 'utf8').matchAll(/^\s*(?:subject|template)\s*=\s*"(.*)"/gm)].map((m) => m[1]!);
    expect(templates.length + config.length).toBeGreaterThan(0);
    expect([...templates, ...config].filter((text) => banned('en', text).length > 0)).toEqual([]);
  });
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
