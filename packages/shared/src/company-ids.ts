// Company and tax numbers of the countries movers register in (MOVER_COUNTRIES): what each looks like,
// its official check digit where one exists, and which official register can look it up. Pure, no
// I/O — used by the app's "Your company" form and by the `company-registry` server function.
//
// Check digits follow the published algorithms (verified against real example numbers in
// company-ids.test.ts): Polish NIP / PESEL / REGON, German USt-IdNr. and tax IdNr (ISO 7064 MOD 11,10),
// Austrian UID, Swiss UID, North Macedonian EDB / EMBG. Kosovo, Albania and North Macedonia have no
// public register API: their numbers get a format check here and MoversHub checks them in the
// register by hand (design/DECISIONS.md #19).

import type { MoverCountry } from './schemas/mover-company';

/** An official register a server can ask about a number. */
export type CompanyRegister = 'vies' | 'pl-white-list' | 'ch-uid';

/** One kind of number: its official name (shown as is in every language), an example, and its rules. */
export type IdKind = {
  name: string;
  example: string;
  /** The number as stored (no spaces, no country prefix unless part of it), or null when it isn't one. */
  parse: (raw: string) => string | null;
  /** The register that knows this kind of number, if any. */
  register?: CompanyRegister;
  /** Only one country's register knows it: "not found" there means it isn't a valid number. */
  registerIsAuthoritative?: boolean;
};

const digitsOf = (value: string) => [...value].map(Number);
const onlyDigits = (raw: string, prefixes: readonly string[] = []) => {
  let value = raw.toUpperCase().replace(/[\s.\-/()]/g, '');
  for (const prefix of prefixes) if (value.startsWith(prefix)) value = value.slice(prefix.length);
  return /^\d+$/.test(value) ? value : null;
};
const weighted = (digits: number[], weights: readonly number[]) =>
  digits.reduce((sum, d, i) => sum + d * weights[i % weights.length]!, 0);

/** Polish NIP: 10 digits, weights 6 5 7 2 3 4 5 6 7, sum mod 11 = the last digit. */
export function isNip(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = digitsOf(value);
  const check = weighted(d.slice(0, 9), [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11;
  return check !== 10 && check === d[9];
}

/** Polish PESEL (personal number): 11 digits, weights 1 3 7 9…, (10 − sum mod 10) mod 10. */
export function isPesel(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const d = digitsOf(value);
  return (10 - (weighted(d.slice(0, 10), [1, 3, 7, 9]) % 10)) % 10 === d[10];
}

/** Polish REGON: 9 digits (or 14, for a local unit — then its first 9 are a REGON too). */
export function isRegon(value: string): boolean {
  if (!/^(\d{9}|\d{14})$/.test(value)) return false;
  const d = digitsOf(value);
  const ok9 = (weighted(d.slice(0, 8), [8, 9, 2, 3, 4, 5, 6, 7]) % 11) % 10 === d[8];
  if (value.length === 9) return ok9;
  return ok9 && (weighted(d.slice(0, 13), [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11) % 10 === d[13];
}

/** ISO 7064 MOD 11,10: the German USt-IdNr. (9 digits) and tax IdNr (11 digits) end with this check digit. */
export function hasIso7064Mod1110(value: string): boolean {
  if (!/^\d{2,}$/.test(value)) return false;
  const d = digitsOf(value);
  let product = 10;
  for (const digit of d.slice(0, -1)) {
    let sum = (digit + product) % 10;
    if (sum === 0) sum = 10;
    product = (2 * sum) % 11;
  }
  return (11 - product) % 10 === d.at(-1);
}

/** Austrian UID: U + 8 digits; Luhn-like sum of the first 7, check = (10 − (sum + 4) mod 10) mod 10. */
export function isAustrianUid(value: string): boolean {
  if (!/^U\d{8}$/.test(value)) return false;
  const d = digitsOf(value.slice(1));
  const sum = d.slice(0, 7).reduce((s, x, i) => s + (i % 2 === 1 ? (x * 2 > 9 ? x * 2 - 9 : x * 2) : x), 0);
  return (10 - ((sum + 4) % 10)) % 10 === d[7];
}

/** Swiss UID: CHE + 9 digits; weights 5 4 3 2 7 6 5 4, check = 11 − sum mod 11 (11 → 0, 10 = invalid). */
export function isSwissUid(value: string): boolean {
  if (!/^CHE\d{9}$/.test(value)) return false;
  const d = digitsOf(value.slice(3));
  const check = (11 - (weighted(d.slice(0, 8), [5, 4, 3, 2, 7, 6, 5, 4]) % 11)) % 11;
  return check !== 10 && check === d[8];
}

/** North Macedonian EDB (tax number) and EMBG (personal number): 13 digits, weights 7 6 5 4 3 2 repeated. */
export function isMacedonian13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const d = digitsOf(value);
  return ((11 - (weighted(d.slice(0, 12), [7, 6, 5, 4, 3, 2]) % 11)) % 11) % 10 === d[12];
}

/** Albanian NIPT / NUIS (companies and persons): a letter A–M, 8 digits, a letter. */
export function parseNipt(raw: string): string | null {
  const value = raw.toUpperCase().replace(/[\s.\-/()]/g, '').replace(/^AL/, '');
  return /^[A-M]\d{8}[A-Z]$/.test(value) ? value : null;
}

const swissUid = (raw: string): string | null => {
  // "CHE-123.456.789 MWST" (also TVA / IVA, or "HR" for the register) → CHE123456789
  const value = raw.toUpperCase().replace(/\b(MWST|TVA|IVA|HR)\b/g, '').replace(/[\s.\-]/g, '');
  return isSwissUid(value) ? value : null;
};

/** German tax office number (Steuernummer): 10–13 digits, often written with slashes. Kept as typed. */
const germanSteuernummer = (raw: string): string | null => {
  const tidy = raw.trim().replace(/\s+/g, ' ');
  const digits = tidy.replace(/[\s/]/g, '');
  return /^[\d\s/]+$/.test(tidy) && /^\d{10,13}$/.test(digits) ? tidy : null;
};

/** Austrian Steuernummer: 9 digits ("12 345/6789"). Kept as typed. */
const austrianSteuernummer = (raw: string): string | null => {
  const tidy = raw.trim().replace(/\s+/g, ' ');
  return /^[\d\s/\-]+$/.test(tidy) && /^\d{9}$/.test(tidy.replace(/[\s/\-]/g, '')) ? tidy : null;
};

const kinds = {
  xkFiscal: { name: 'Numri fiskal / NUI', example: '601234567', parse: (raw) => onlyDigits(raw)?.match(/^\d{8,10}$/)?.[0] ?? null },
  xkBusiness: { name: 'NUI', example: '810123456', parse: (raw) => onlyDigits(raw)?.match(/^\d{8,10}$/)?.[0] ?? null },
  alNipt: { name: 'NIPT', example: 'K52224002A', parse: parseNipt },
  mkEdb: {
    name: 'EDB',
    example: '4030000375897',
    parse: (raw) => {
      const value = onlyDigits(raw.replace(/^\s*МК/i, ''), ['MK']);
      return value && isMacedonian13(value) ? value : null;
    },
  },
  mkEmbg: { name: 'EMBG', example: '0101990450006', parse: (raw) => { const v = onlyDigits(raw); return v && isMacedonian13(v) ? v : null; } },
  mkEmbs: { name: 'EMBS', example: '7123456', parse: (raw) => onlyDigits(raw)?.match(/^\d{7}$/)?.[0] ?? null },
  plNip: {
    name: 'NIP',
    example: '5260250995',
    parse: (raw) => { const v = onlyDigits(raw, ['PL']); return v && isNip(v) ? v : null; },
    register: 'pl-white-list',
  },
  plPesel: { name: 'PESEL', example: '44051401359', parse: (raw) => { const v = onlyDigits(raw); return v && isPesel(v) ? v : null; } },
  plKrs: { name: 'KRS', example: '0000123456', parse: (raw) => onlyDigits(raw, ['KRS'])?.match(/^\d{10}$/)?.[0] ?? null },
  plRegon: { name: 'REGON', example: '123456785', parse: (raw) => { const v = onlyDigits(raw, ['REGON']); return v && isRegon(v) ? v : null; } },
  deVat: {
    name: 'USt-IdNr.',
    example: 'DE136695976',
    parse: (raw) => { const v = onlyDigits(raw, ['DE']); return v && /^\d{9}$/.test(v) && hasIso7064Mod1110(v) ? `DE${v}` : null; },
    register: 'vies',
    registerIsAuthoritative: true,
  },
  deSteuernummer: { name: 'Steuernummer', example: '123/456/78901', parse: germanSteuernummer },
  deIdNr: { name: 'Steuer-IdNr.', example: '86095742719', parse: (raw) => { const v = onlyDigits(raw); return v && /^\d{11}$/.test(v) && v[0] !== '0' && hasIso7064Mod1110(v) ? v : null; } },
  deRegister: {
    name: 'Handelsregister (HRA / HRB)',
    example: 'HRB 123456',
    parse: (raw) => {
      const tidy = raw.trim().replace(/\s+/g, ' ');
      return tidy.length <= 60 && /\b(HRA|HRB|GnR|PR|VR)\s?\d{1,6}\b/i.test(tidy) ? tidy : null;
    },
  },
  atUid: {
    name: 'UID',
    example: 'ATU13585627',
    parse: (raw) => {
      const v = raw.toUpperCase().replace(/[\s.\-/]/g, '').replace(/^AT/, '');
      return isAustrianUid(v) ? `AT${v}` : null;
    },
    register: 'vies',
    registerIsAuthoritative: true,
  },
  atSteuernummer: { name: 'Steuernummer', example: '12 345/6789', parse: austrianSteuernummer },
  atFirmenbuch: {
    name: 'Firmenbuchnummer (FN)',
    example: 'FN 123456a',
    parse: (raw) => {
      const m = /^(?:FN\s?)?(\d{1,6})\s?([A-Z])$/i.exec(raw.trim());
      return m ? `FN ${m[1]}${m[2]!.toLowerCase()}` : null;
    },
  },
  chUid: { name: 'UID (CHE)', example: 'CHE-100.155.212', parse: swissUid, register: 'ch-uid', registerIsAuthoritative: true },
  chPersonal: {
    name: 'Steuernummer',
    example: '123.456.789',
    parse: (raw) => { const v = raw.trim().replace(/\s+/g, ' '); return /^[A-Za-z0-9][A-Za-z0-9 .\/-]{4,29}$/.test(v) ? v : null; },
  },
} satisfies Record<string, IdKind>;

/** Tax numbers each country accepts, for a business and for a private person (first one = shown as the hint). */
export const TAX_ID_KINDS: Record<MoverCountry, { business: readonly IdKind[]; person: readonly IdKind[] }> = {
  XK: { business: [kinds.xkFiscal], person: [kinds.xkFiscal] },
  AL: { business: [kinds.alNipt], person: [kinds.alNipt] },
  MK: { business: [kinds.mkEdb], person: [kinds.mkEmbg, kinds.mkEdb] },
  PL: { business: [kinds.plNip], person: [kinds.plNip, kinds.plPesel] },
  DE: { business: [kinds.deVat, kinds.deSteuernummer], person: [kinds.deIdNr, kinds.deSteuernummer] },
  AT: { business: [kinds.atUid, kinds.atSteuernummer], person: [kinds.atSteuernummer] },
  CH: { business: [kinds.chUid], person: [kinds.chPersonal] },
};

/**
 * A business's registration number: `required` kinds, `optional` (sole traders in Germany and Austria
 * often aren't in the commercial register), or `sameAsTax` (Albania's NIPT and Switzerland's UID are
 * both). Private persons have none.
 */
export const REGISTRATION_KINDS: Record<MoverCountry, { rule: 'required' | 'optional'; kinds: readonly IdKind[] } | { rule: 'sameAsTax' }> = {
  XK: { rule: 'required', kinds: [kinds.xkBusiness] },
  AL: { rule: 'sameAsTax' },
  MK: { rule: 'required', kinds: [kinds.mkEmbs] },
  PL: { rule: 'required', kinds: [kinds.plKrs, kinds.plRegon] },
  DE: { rule: 'optional', kinds: [kinds.deRegister] },
  AT: { rule: 'optional', kinds: [kinds.atFirmenbuch] },
  CH: { rule: 'sameAsTax' },
};

/** The first kind a raw number fits, with its stored form; null = fits none. */
export function matchId(kindsToTry: readonly IdKind[], raw: string): { kind: IdKind; value: string } | null {
  for (const kind of kindsToTry) {
    const value = kind.parse(raw);
    if (value !== null) return { kind, value };
  }
  return null;
}

/** "NIP or PESEL, e.g. 5260250995" — the hint under a number field (names are official, not translated). */
export function idHint(kindsToShow: readonly IdKind[]): { names: string; example: string } {
  return { names: kindsToShow.map((k) => k.name).join(' / '), example: kindsToShow[0]?.example ?? '' };
}

/* ── Company names ─────────────────────────────────────────────────────── */

// Legal forms and filler words left out when comparing a typed name with a register's.
const LEGAL_FORMS = new Set([
  'sh', 'p', 'k', 'shpk', 'sha', 'bi', 'ndermarrje', 'individuale', 'n', 'sh.p.k',
  'sp', 'z', 'o', 'oo', 'zoo', 'spolka', 'spolki', 'akcyjna', 'jawna', 'komandytowa', 'ograniczona', 'odpowiedzialnoscia', 'sa', 'sc', 'sj', 'sk',
  'gmbh', 'ag', 'kg', 'ohg', 'ug', 'haftungsbeschrankt', 'ek', 'e', 'kfm', 'co', 'mbh', 'gesmbh', 'eu',
  'doo', 'dooel', 'ad', 'tp', 'dpu',
  'sagl', 'sarl', 'sarlu', 'ltd', 'llc', 'inc', 'and', 'und', 'dhe', 'i',
]);

/** Lower case, no accents, no punctuation, no legal forms: "Lëvizje Sh.p.k." → ["levizje"]. */
export function nameWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !LEGAL_FORMS.has(w));
}

/**
 * Whether a typed company name is the register's name for that number: the same words (legal forms,
 * accents and punctuation aside), one name's words all in the other, or most words shared.
 */
export function sameCompanyName(typed: string, registered: string): boolean {
  const a = new Set(nameWords(typed));
  const b = new Set(nameWords(registered));
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((w) => b.has(w)).length;
  if (shared === Math.min(a.size, b.size)) return true;
  return shared / new Set([...a, ...b]).size >= 0.6;
}
