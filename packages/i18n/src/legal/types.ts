// The legal pages' text, shared by the website and the app (design/DECISIONS.md #33).

/** The legal pages: privacy policy, terms for customers, terms for movers, contact and legal notice. */
export const LEGAL_DOCS = ['privacy', 'terms', 'mover-terms', 'contact'] as const;
export type LegalDocId = (typeof LEGAL_DOCS)[number];
export const isLegalDoc = (value: string): value is LegalDocId => (LEGAL_DOCS as readonly string[]).includes(value);

/**
 * A paragraph, a bulleted list, or a pointer to another legal page. Text may hold the operator's
 * details as {{legalName}}, {{address}}, {{email}} … (see `Operator`): filled in by `legalDocument`.
 */
export type LegalBlock = string | { list: string[] } | { see: LegalDocId };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalText = {
  /** What the page is about, in a sentence or two, above the sections. */
  intro: string;
  sections: LegalSection[];
};
