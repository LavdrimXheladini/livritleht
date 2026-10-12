import type { Currency, Locale } from './constants';

// Money is always integer minor units (cents) + ISO currency (CLAUDE.md §9). Format only for display.
//
// Deliberately NOT Intl.NumberFormat: browsers ship different locale data (e.g. Chrome has no
// Albanian number data and silently falls back to English), so server and browser output would
// differ → hydration errors and inconsistent prices. These explicit rules give identical output
// in Node, every browser and React Native.

type NumberRules = {
  decimal: string;
  group: string;
  /** Only group thousands from this many integer digits (Polish style: 1000 but 10 000). */
  minGroupDigits: number;
  /** Currency symbol before the amount without a space ("€162") or after with a no-break space ("162 €"). */
  symbolFirst: boolean;
};

const NBSP = ' ';

const RULES: Record<Locale, NumberRules> = {
  en: { decimal: '.', group: ',', minGroupDigits: 4, symbolFirst: true },
  sq: { decimal: ',', group: '.', minGroupDigits: 4, symbolFirst: false },
  pl: { decimal: ',', group: NBSP, minGroupDigits: 5, symbolFirst: false },
  sr: { decimal: ',', group: '.', minGroupDigits: 4, symbolFirst: false },
  de: { decimal: ',', group: '.', minGroupDigits: 4, symbolFirst: false },
};

const SYMBOLS: Record<string, string> = { EUR: '€', PLN: 'zł', CHF: 'CHF', ALL: 'L', MKD: 'ден', RSD: 'RSD' };

/**
 * Currencies whose hundredths are no longer used — no qindarka, deni (withdrawn 2013) or para
 * (gone since 2008) coins — so their prices are whole units (owner decision 2026-10-12). Amounts
 * still count in hundredths like every currency (CLAUDE.md §9), so the database and Stripe don't change.
 */
export const WHOLE_UNIT_CURRENCIES: readonly Currency[] = ['ALL', 'MKD', 'RSD'];

/** Rounds an amount (minor units) to what a price in this currency can be: whole lek / denar / dinar, else cents. */
export function roundToPriceStep(amount: number, currency: Currency): number {
  return WHOLE_UNIT_CURRENCIES.includes(currency) ? Math.round(amount / 100) * 100 : Math.round(amount);
}

function groupDigits(int: string, rules: NumberRules): string {
  if (int.length < rules.minGroupDigits) return int;
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, rules.group);
}

/** Locale-aware number for labels (e.g. "1,200" / "1.200"). Integers only. */
export function formatNumber(value: number, locale: Locale): string {
  const rules = RULES[locale];
  const sign = value < 0 ? '-' : '';
  return sign + groupDigits(String(Math.abs(Math.round(value))), rules);
}

/** Locale-aware number with one decimal, from an integer count of tenths (e.g. 53 → "5.3" / "5,3"). */
export function formatTenths(tenths: number, locale: Locale): string {
  if (!Number.isInteger(tenths)) throw new Error(`formatTenths expects an integer, got ${tenths}`);
  const sign = tenths < 0 ? '-' : '';
  const abs = Math.abs(tenths);
  return `${sign}${groupDigits(String(Math.floor(abs / 10)), RULES[locale])}${RULES[locale].decimal}${abs % 10}`;
}

export function formatMoney(
  cents: number,
  currency: string,
  locale: Locale,
  { wholeUnits = cents % 100 === 0, compact = false }: { wholeUnits?: boolean; compact?: boolean } = {},
): string {
  if (!Number.isInteger(cents)) throw new Error(`formatMoney expects integer cents, got ${cents}`);
  const rules = RULES[locale];
  const symbol = SYMBOLS[currency] ?? currency;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);

  let amount: string;
  if (compact && locale === 'en' && abs >= 100_000) {
    // Chart axes in English: "€1.2K". Other languages keep the full grouped number.
    const thousands = Math.round(abs / 10_000) / 10;
    amount = `${String(thousands).replace('.', rules.decimal)}K`;
  } else if (wholeUnits || compact) {
    amount = groupDigits(String(Math.round(abs / 100)), rules);
  } else {
    const units = Math.floor(abs / 100);
    const rest = String(abs % 100).padStart(2, '0');
    amount = `${groupDigits(String(units), rules)}${rules.decimal}${rest}`;
  }

  // A sign-like symbol goes first where the language does that ("€162"); letters always go after the
  // amount ("781 zł", "280 CHF", "4,409 L") — "zł781" reads wrong in any language.
  const signLike = symbol.length === 1 && !/\p{L}/u.test(symbol);
  return rules.symbolFirst && signLike ? `${sign}${symbol}${amount}` : `${sign}${amount}${NBSP}${symbol}`;
}
