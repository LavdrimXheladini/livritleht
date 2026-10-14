import { z } from 'zod';

import { REGISTRATION_KINDS, TAX_ID_KINDS, matchId } from '../company-ids';
import type { MarketCountry } from '../market-rates';
import { emailSchema, phoneSchema } from './auth';

/**
 * Countries a mover's company can be registered and taxed in: the markets MoversHub prices
 * (MARKET_RATES), Kosovo first. Postgres stores any ISO code (test data uses others); the form offers these.
 */
export const MOVER_COUNTRIES = ['XK', 'AL', 'MK', 'PL', 'DE', 'AT', 'CH'] as const satisfies readonly MarketCountry[];
export type MoverCountry = (typeof MOVER_COUNTRIES)[number];

const text = (max: number) => z.string().trim().max(max, 'too_long');

/**
 * The company's address, chosen from the map search (OpenStreetMap) and confirmed by the mover:
 * the parts the map data has, the house number the mover may add, and the point on the map.
 */
export const companyAddressSchema = z.object({
  street: text(120).optional(),
  houseNumber: text(20).optional(),
  postcode: text(20).optional(),
  city: text(120).min(1, 'address_required'),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** The mover said "Yes, this is the address" for exactly these parts. */
  confirmed: z.boolean(),
});
export type CompanyAddress = z.infer<typeof companyAddressSchema>;

/** "Rr. Agim Ramadani 12, 10000 Prishtinë" — the address as customers and the admin read it. */
export function formatCompanyAddress(a: Pick<CompanyAddress, 'street' | 'houseNumber' | 'postcode' | 'city'>): string {
  const streetLine = [a.street, a.houseNumber].filter(Boolean).join(' ');
  const cityLine = [a.postcode, a.city].filter(Boolean).join(' ');
  return [streetLine, cityLine].filter(Boolean).join(', ');
}

const fields = z.object({
  /** A company or registered sole trader (preferred, §5) — or a private individual. */
  isBusiness: z.boolean(),
  legalName: text(160).min(2, 'legal_name_required'),
  /** From the business register (company-ids.ts: per country; not asked from private individuals). */
  registrationNo: text(60),
  taxId: text(60).min(3, 'tax_id_required'),
  country: z.enum(MOVER_COUNTRIES, 'country_required'),
  taxResidencyCountry: z.enum(MOVER_COUNTRIES, 'country_required'),
  address: companyAddressSchema.nullable().refine((a) => a !== null, 'address_required'),
  /** Must also be confirmed with a code (phone_verifications) — the form and Postgres check that. */
  contactPhone: phoneSchema,
  contactEmail: emailSchema,
  /** "I offer only legal services, and these details are correct" (DSA Art. 30 self-certification). */
  selfCertified: z.boolean().refine((v) => v, 'self_certification_required'),
});

// Rules between fields. Zod skips an object's refinements while any field is wrong; `when` runs each
// one as soon as the fields it reads are fine, so the form shows every problem at once.
type FieldName = keyof typeof fields.shape;
const whenParses = (...keys: FieldName[]) => {
  const mask: Partial<Record<FieldName, true>> = Object.fromEntries(keys.map((k) => [k, true]));
  const part = fields.pick(mask);
  return { when: (payload: { value: unknown }) => part.safeParse(payload.value).success };
};

type Fields = z.output<typeof fields>;
const taxKinds = (f: Pick<Fields, 'country' | 'isBusiness'>) => TAX_ID_KINDS[f.country][f.isBusiness ? 'business' : 'person'];
const registration = (f: Pick<Fields, 'country'>) => REGISTRATION_KINDS[f.country];

/**
 * The "Your company" form (COMPLIANCE §5: who the mover is, for customers — §4 — and for tax
 * reporting — §10). Messages are i18n keys (mover.company.errors, or auth.errors for phone/email).
 * Numbers are checked against their country's format and check digit (company-ids.ts) and stored in
 * one form; the official registers are asked by the `company-registry` function. Business rules stay
 * in Postgres: movers can't verify themselves, a change to the legal identity sends a verified company
 * back to verification, and the phone must be confirmed with a code.
 */
export const moverCompanyFormSchema = fields
  .refine((f) => matchId(taxKinds(f), f.taxId) !== null, {
    path: ['taxId'],
    error: 'tax_id_format',
    ...whenParses('country', 'isBusiness', 'taxId'),
  })
  .refine(
    (f) => {
      const rule = registration(f);
      return !f.isBusiness || rule.rule !== 'required' || f.registrationNo !== '';
    },
    { path: ['registrationNo'], error: 'registration_no_required', ...whenParses('country', 'isBusiness', 'registrationNo') },
  )
  .refine(
    (f) => {
      const rule = registration(f);
      return !f.isBusiness || rule.rule === 'sameAsTax' || f.registrationNo === '' || matchId(rule.kinds, f.registrationNo) !== null;
    },
    { path: ['registrationNo'], error: 'registration_no_format', ...whenParses('country', 'isBusiness', 'registrationNo') },
  )
  .refine((f) => f.address?.confirmed === true, { path: ['address'], error: 'address_confirm', ...whenParses('address') })
  .refine((f) => f.address?.countryCode === f.country, {
    path: ['address'],
    error: 'address_wrong_country',
    ...whenParses('address', 'country'),
  })
  // Numbers as stored: no spaces, one form (e.g. "PL 526-025-09-95" → "5260250995"); Albania's NIPT
  // and Switzerland's UID are the registration number too.
  .transform((f) => {
    const taxId = matchId(taxKinds(f), f.taxId)?.value ?? f.taxId;
    const rule = registration(f);
    const registrationNo = !f.isBusiness
      ? ''
      : rule.rule === 'sameAsTax'
        ? taxId
        : f.registrationNo === ''
          ? ''
          : (matchId(rule.kinds, f.registrationNo)?.value ?? f.registrationNo);
    return { ...f, taxId, registrationNo, address: f.address! };
  });
export type MoverCompanyFormInput = z.input<typeof moverCompanyFormSchema>;
export type MoverCompanyForm = z.output<typeof moverCompanyFormSchema>;

/** What the database keeps of the address besides its text: the parts and the point. */
export const companyAddressDetailsSchema = companyAddressSchema.omit({ confirmed: true });
export type CompanyAddressDetails = z.infer<typeof companyAddressDetailsSchema>;

/** The columns a mover may write on `mover_companies` (its column grants), from the checked form. */
export function moverCompanyColumns(form: MoverCompanyForm) {
  const { confirmed: _confirmed, ...details } = form.address;
  return {
    is_business: form.isBusiness,
    legal_name: form.legalName,
    registration_no: form.registrationNo === '' ? null : form.registrationNo,
    tax_id: form.taxId,
    country: form.country,
    tax_residency_country: form.taxResidencyCountry,
    address: formatCompanyAddress(details),
    address_details: details satisfies CompanyAddressDetails,
    address_point: `SRID=4326;POINT(${details.lon} ${details.lat})`,
    contact_phone: form.contactPhone,
    contact_email: form.contactEmail,
  };
}

/** The mover's own company row, as the app reads it (RLS: the owner only). */
export const moverCompanyRowSchema = z.object({
  id: z.uuid(),
  is_business: z.boolean(),
  legal_name: z.string(),
  registration_no: z.string().nullable(),
  tax_id: z.string().nullable(),
  country: z.string(),
  tax_residency_country: z.string().nullable(),
  address: z.string().nullable(),
  address_details: companyAddressDetailsSchema.nullable().catch(null),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  verification_status: z.enum(['pending', 'verified', 'rejected']),
  self_certification_at: z.string().nullable(),
});
export type MoverCompanyRow = z.infer<typeof moverCompanyRowSchema>;
export const MOVER_COMPANY_COLUMNS = Object.keys(moverCompanyRowSchema.shape).join(', ');

const moverCountry = (code: string | null | undefined): MoverCountry | undefined =>
  (MOVER_COUNTRIES as readonly string[]).includes(code ?? '') ? (code as MoverCountry) : undefined;

/**
 * The form's starting values: the saved company, or an empty form with the account's email.
 * A country outside the list starts unselected, so the mover picks one; an address saved without
 * its place on the map must be chosen again.
 */
export function moverCompanyFormDefaults(row: MoverCompanyRow | null, accountEmail: string): Partial<MoverCompanyFormInput> {
  if (!row) {
    return {
      isBusiness: true,
      legalName: '',
      registrationNo: '',
      taxId: '',
      address: null,
      contactPhone: '',
      contactEmail: accountEmail,
      selfCertified: false,
    };
  }
  const country = moverCountry(row.country);
  const sameAsTax = country !== undefined && REGISTRATION_KINDS[country].rule === 'sameAsTax';
  return {
    isBusiness: row.is_business,
    legalName: row.legal_name,
    registrationNo: sameAsTax ? '' : (row.registration_no ?? ''),
    taxId: row.tax_id ?? '',
    country,
    taxResidencyCountry: moverCountry(row.tax_residency_country ?? row.country),
    address: row.address_details ? { ...row.address_details, confirmed: true } : null,
    contactPhone: row.contact_phone ?? '',
    contactEmail: row.contact_email ?? accountEmail,
    selfCertified: row.self_certification_at !== null,
  };
}
