import { describe, expect, it } from 'vitest';

import { formatMoney, formatNumber, formatTenths } from './money';

const NBSP = ' ';

describe('formatMoney', () => {
  it('formats whole euros without decimals', () => {
    expect(formatMoney(16200, 'EUR', 'en')).toBe('€162');
    expect(formatMoney(16200, 'EUR', 'sq')).toBe(`162${NBSP}€`);
  });

  it('keeps cents when present', () => {
    expect(formatMoney(16250, 'EUR', 'en')).toBe('€162.50');
    expect(formatMoney(16205, 'EUR', 'de')).toBe(`162,05${NBSP}€`);
  });

  it('groups thousands per language', () => {
    expect(formatMoney(120000, 'EUR', 'en')).toBe('€1,200');
    expect(formatMoney(120000, 'EUR', 'de')).toBe(`1.200${NBSP}€`);
    expect(formatMoney(100000, 'PLN', 'pl')).toBe(`1000${NBSP}zł`); // Polish groups from 5 digits
    // Letter symbols after the amount even in English; € stays in front.
    expect(formatMoney(78100, 'PLN', 'en')).toBe(`781${NBSP}zł`);
    expect(formatMoney(28000, 'CHF', 'en')).toBe(`280${NBSP}CHF`);
    expect(formatMoney(440900, 'ALL', 'en')).toBe(`4,409${NBSP}L`);
    expect(formatMoney(1000000, 'PLN', 'pl')).toBe(`10${NBSP}000${NBSP}zł`);
  });

  it('has a compact form for chart axes', () => {
    expect(formatMoney(120000, 'EUR', 'en', { compact: true })).toBe('€1.2K');
    expect(formatMoney(40000, 'EUR', 'en', { compact: true })).toBe('€400');
    expect(formatMoney(120000, 'EUR', 'sr', { compact: true })).toBe(`1.200${NBSP}€`);
  });

  it('gives the same output in every language without relying on Intl data', () => {
    for (const l of ['en', 'sq', 'pl', 'sr', 'de'] as const) {
      expect(formatMoney(14100, 'EUR', l)).toMatch(/141/);
    }
  });

  it('rejects floats (money must be integer cents)', () => {
    expect(() => formatMoney(162.5, 'EUR', 'en')).toThrow();
  });
});

describe('formatNumber', () => {
  it('groups per language', () => {
    expect(formatNumber(1200, 'en')).toBe('1,200');
    expect(formatNumber(1200, 'sr')).toBe('1.200');
    expect(formatNumber(1200, 'pl')).toBe('1200');
    expect(formatNumber(82, 'de')).toBe('82');
  });
});

describe('formatTenths', () => {
  it('uses the language decimal separator', () => {
    expect(formatTenths(53, 'en')).toBe('5.3');
    expect(formatTenths(53, 'sq')).toBe('5,3');
    expect(formatTenths(130, 'de')).toBe('13,0');
    expect(formatTenths(4, 'pl')).toBe('0,4');
  });
});
