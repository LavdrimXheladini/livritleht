import { z } from 'zod';

// The shape of the legal pages' text (the texts themselves: packages/i18n/src/legal; design/DECISIONS.md
// #33). Here so the published versions of the terms (public.terms_versions.content, #34) are checked
// with the same shape when the app reads them back.

/** The legal pages: privacy policy, terms for customers, terms for movers, contact and legal notice. */
export const LEGAL_DOCS = ['privacy', 'terms', 'mover-terms', 'contact'] as const;
export type LegalDocId = (typeof LEGAL_DOCS)[number];
export const isLegalDoc = (value: string): value is LegalDocId => (LEGAL_DOCS as readonly string[]).includes(value);

/**
 * A paragraph, a bulleted list, or a pointer to another legal page. Text may hold the operator's
 * details as {{legalName}}, {{address}}, {{email}} … (see `Operator`), filled in before it is shown.
 */
export const legalBlockSchema = z.union([z.string(), z.object({ list: z.array(z.string()) }), z.object({ see: z.enum(LEGAL_DOCS) })]);
export type LegalBlock = z.infer<typeof legalBlockSchema>;

export const legalSectionSchema = z.object({ id: z.string(), heading: z.string(), blocks: z.array(legalBlockSchema) });
export type LegalSection = z.infer<typeof legalSectionSchema>;

export const legalTextSchema = z.object({
  /** What the page is about, in a sentence or two, above the sections. */
  intro: z.string(),
  sections: z.array(legalSectionSchema),
});
export type LegalText = z.infer<typeof legalTextSchema>;
