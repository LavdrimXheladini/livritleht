import { describe, expect, it } from 'vitest';

import { LOCALES, OPERATOR, type Operator } from '@movershub/shared';

import { LEGAL_DOCS, fillOperator, isLegalDoc, legalDocument } from './index';

const known: Operator = {
  legalName: 'MoversHub sp. z o.o.',
  address: 'ul. Przykładowa 1, 00-001 Warszawa, Poland',
  registration: 'KRS 0000000000',
  vatId: 'PL0000000000',
  representative: 'A. Person',
  email: 'hello@movershub.example',
  dataProtectionAuthority: 'UODO',
  taxAuthority: 'KAS',
  consumerDisputeBody: 'a body',
  moverMediators: 'two mediators',
};

const strings = (id: (typeof LEGAL_DOCS)[number], operator?: Operator) => {
  const { text } = legalDocument(id, 'en', operator);
  return [text.intro, ...text.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => (typeof b === 'string' ? [b] : 'list' in b ? b.list : []))])];
};

describe('legal texts', () => {
  it('name the operator, or show a marked gap while a detail is not known', () => {
    expect(OPERATOR.legalName).toBeNull(); // COMPLIANCE-TODO §14: not registered yet
    expect(legalDocument('contact', 'en').text.sections[0]!.blocks[0]).toEqual({
      list: expect.arrayContaining(['Operator: [company name — added once the company is registered]']),
    });
    expect(strings('contact', known)).toContain('Email: hello@movershub.example');
  });

  it('use only known placeholders, and none is left once filled', () => {
    for (const id of LEGAL_DOCS) {
      const filled = strings(id, known).join('\n');
      expect(filled).not.toMatch(/\{\{|\}\}/);
    }
    expect(() => fillOperator('{{nope}}')).toThrow('unknown legal placeholder');
  });

  it('are in English until translated, for every language', () => {
    for (const locale of LOCALES) {
      for (const id of LEGAL_DOCS) expect(legalDocument(id, locale).locale).toBe('en');
    }
  });

  it('point only to the other legal pages', () => {
    for (const id of LEGAL_DOCS) {
      const pointers = legalDocument(id, 'en').text.sections.flatMap((s) => s.blocks.flatMap((b) => (typeof b === 'object' && 'see' in b ? [b.see] : [])));
      expect(pointers.length).toBeGreaterThan(0);
      expect(pointers.every((p) => isLegalDoc(p) && p !== id)).toBe(true);
    }
  });

  it('give the mover terms the same ranking rules as the public page (COMPLIANCE §3)', () => {
    const ranking = strings('mover-terms').join('\n');
    expect(ranking).toContain('lowest first');
    expect(ranking).toContain('no mover can pay for a better place');
    expect(ranking).toContain('declining jobs never moves you down');
    expect(ranking).toContain('20%');
    expect(ranking).toContain('at least 15 days before it applies');
    expect(ranking).toContain('at least 30 days after you are told');
  });
});
