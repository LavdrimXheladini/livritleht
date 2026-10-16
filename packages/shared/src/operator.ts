// Who runs MoversHub: the platform's operator, named on the legal pages (privacy policy, terms,
// contact and legal notice — design/DECISIONS.md #33) and wherever MoversHub gives its contact.
// The one place to fill in once the company exists. `null` = not known yet: the pages show a marked
// gap instead. Business details only — never a person's private address or email.

export type Operator = {
  /** The company's registered name. */
  legalName: string | null;
  /** Its registered address, on one line. */
  address: string | null;
  /** The register it is entered in and its number there, e.g. "KRS 0000123456". */
  registration: string | null;
  /** Its VAT number (NIP in Poland). */
  vatId: string | null;
  /** Who represents it (e.g. its managing director). */
  representative: string | null;
  /** The address people, movers and authorities write to (also the DSA point of contact). */
  email: string | null;
  /** The data protection authority that oversees the operator (where it is established). */
  dataProtectionAuthority: string | null;
  /** The tax authority it reports movers' earnings to (DAC7). */
  taxAuthority: string | null;
  /** Out-of-court dispute resolution: for consumers, and the mediators for movers (P2B Regulation, Art. 12). */
  consumerDisputeBody: string | null;
  moverMediators: string | null;
};

// COMPLIANCE-TODO: §14 — the company isn't registered yet (Poland planned); fill these in with the
// lawyer once it is.
export const OPERATOR: Operator = {
  legalName: null,
  address: null,
  registration: null,
  vatId: null,
  representative: null,
  email: null,
  dataProtectionAuthority: null,
  taxAuthority: null,
  consumerDisputeBody: null,
  moverMediators: null,
};
