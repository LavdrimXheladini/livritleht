import type { Locale } from './constants';

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

  return rules.symbolFirst ? `${sign}${symbol}${amount}` : `${sign}${amount}${NBSP}${symbol}`;
}
