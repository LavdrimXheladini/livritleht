import { OPERATOR, type Locale, type Operator } from '@movershub/shared';

import { contact } from './en/contact';
import { moverTerms } from './en/mover-terms';
import { privacy } from './en/privacy';
import { terms } from './en/terms';
import type { LegalBlock, LegalDocId, LegalText } from './types';

export * from './types';

/**
 * When the legal texts last changed. Change it with every change of a text (each page shows it).
 * DRAFTS: none of them has been checked by a lawyer yet (design/DECISIONS.md #33).
 */
export const LEGAL_UPDATED = '2026-10-16';

/** The texts exist in English only until the lawyer has checked them; then they are translated once. */
const TEXTS: Record<LegalDocId, Partial<Record<Locale, LegalText>> & { en: LegalText }> = {
  privacy: { en: privacy },
  terms: { en: terms },
  'mover-terms': { en: moverTerms },
  contact: { en: contact },
};

/** What a page shows where the operator's detail isn't known yet: a marked gap. */
const GAPS: Record<keyof Operator, string> = {
  legalName: '[company name — added once the company is registered]',
  address: '[registered address — added once the company is registered]',
  registration: '[register and number — added once the company is registered]',
  vatId: '[VAT number — added once the company is registered]',
  representative: '[representative — added once the company is registered]',
  email: '[contact email — added once MoversHub has its own address]',
  dataProtectionAuthority: '[the data protection authority where MoversHub is established — added once it is registered]',
  taxAuthority: '[the tax authority where MoversHub is established — added once it is registered]',
  consumerDisputeBody: '[the consumer dispute resolution body — to be named with the lawyer]',
  moverMediators: '[the mediators — to be named with the lawyer]',
};

const isOperatorKey = (key: string): key is keyof Operator => key in GAPS;

/** Fills {{legalName}}, {{email}} … with the operator's details, or a marked gap where one isn't known. */
export function fillOperator(text: string, operator: Operator = OPERATOR): string {
  return text.replace(/\{\{(\w+)\}\}/g, (token, key: string) => {
    if (!isOperatorKey(key)) throw new Error(`unknown legal placeholder ${token}`);
    return operator[key] ?? GAPS[key];
  });
}

const fillBlock = (block: LegalBlock, operator: Operator): LegalBlock =>
  typeof block === 'string' ? fillOperator(block, operator) : 'list' in block ? { list: block.list.map((item) => fillOperator(item, operator)) } : block;

/**
 * A legal page's text for a reader of `locale`, with the operator's details filled in. `locale` is
 * the language the text is in — English until it has been translated (the page says so).
 */
export function legalDocument(id: LegalDocId, locale: Locale, operator: Operator = OPERATOR): { text: LegalText; locale: Locale } {
  const texts = TEXTS[id];
  const textLocale: Locale = texts[locale] ? locale : 'en';
  const text = texts[textLocale] ?? texts.en;
  return {
    locale: textLocale,
    text: {
      intro: fillOperator(text.intro, operator),
      sections: text.sections.map((s) => ({ ...s, heading: fillOperator(s.heading, operator), blocks: s.blocks.map((b) => fillBlock(b, operator)) })),
    },
  };
}

/** Every sentence of every legal text, as written (for the wording checks). */
export function allLegalStrings(): string[] {
  const out: string[] = [];
  for (const texts of Object.values(TEXTS)) {
    for (const text of Object.values(texts)) {
      out.push(text.intro);
      for (const s of text.sections) {
        out.push(s.heading);
        for (const b of s.blocks) {
          if (typeof b === 'string') out.push(b);
          else if ('list' in b) out.push(...b.list);
        }
      }
    }
  }
  return out;
}
