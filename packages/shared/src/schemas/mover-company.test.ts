import { describe, expect, it } from 'vitest';

import { MARKET_RATES } from '../market-rates';
import {
  MOVER_COUNTRIES,
  formatCompanyAddress,
  moverCompanyColumns,
  moverCompanyFormDefaults,
  moverCompanyFormSchema,
  type CompanyAddress,
  type MoverCompanyFormInput,
  type MoverCompanyRow,
} from './mover-company';

const prishtina: CompanyAddress = {
  street: 'Rr. Agim Ramadani',
  houseNumber: '12',
  postcode: '10000',
  city: 'Prishtinë',
  countryCode: 'XK',
  lat: 42.6629,
  lon: 21.1655,
  confirmed: true,
};

const business: MoverCompanyFormInput = {
  isBusiness: true,
  legalName: ' Lëvizje Shpk ',
  registrationNo: '810123456',
  taxId: '601 234 567',
  country: 'XK',
  taxResidencyCountry: 'XK',
  address: prishtina,
  contactPhone: '+383 44 123 456',
  contactEmail: 'Info@Levizje.example',
  selfCertified: true,
};

const errors = (input: Partial<MoverCompanyFormInput>) =>
  Object.fromEntries(
    (moverCompanyFormSchema.safeParse({ ...business, ...input }).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('moverCompanyFormSchema', () => {
  it('accepts a complete business and stores it tidied (trimmed name, numbers without spaces, E.164 phone)', () => {
    const form = moverCompanyFormSchema.parse(business);
    expect(form.legalName).toBe('Lëvizje Shpk');
    expect(form.taxId).toBe('601234567');
    expect(form.contactPhone).toBe('+38344123456');
    expect(form.contactEmail).toBe('info@levizje.example');
  });

  it('checks the tax number against the country: format and check digit', () => {
    const poland = { country: 'PL', taxResidencyCountry: 'PL', registrationNo: '0000028860', address: { ...prishtina, countryCode: 'PL' } } as const;
    expect(errors({ ...poland, taxId: 'PL 774-000-14-54' })).toEqual({});
    expect(moverCompanyFormSchema.parse({ ...business, ...poland, taxId: 'PL 774-000-14-54' }).taxId).toBe('7740001454');
    expect(errors({ ...poland, taxId: '7740001455' })).toEqual({ taxId: 'tax_id_format' });
    expect(errors({ taxId: '12345' })).toEqual({ taxId: 'tax_id_format' }); // Kosovo: 8–10 digits
  });

  it("uses Albania's NIPT and Switzerland's UID as the registration number too", () => {
    const albania = { country: 'AL', taxResidencyCountry: 'AL', taxId: 'k52224002a', registrationNo: '', address: { ...prishtina, countryCode: 'AL' } } as const;
    const form = moverCompanyFormSchema.parse({ ...business, ...albania });
    expect([form.taxId, form.registrationNo]).toEqual(['K52224002A', 'K52224002A']);
  });

  it('asks a business for its registration number where every business has one, in its format', () => {
    expect(errors({ registrationNo: '' })).toEqual({ registrationNo: 'registration_no_required' });
    expect(errors({ registrationNo: 'ABC' })).toEqual({ registrationNo: 'registration_no_format' });
    expect(errors({ isBusiness: false, registrationNo: '' })).toEqual({});
  });

  it('lets German and Austrian sole traders leave the commercial register number out', () => {
    const germany = { country: 'DE', taxResidencyCountry: 'DE', taxId: 'DE136695976', address: { ...prishtina, countryCode: 'DE' } } as const;
    expect(errors({ ...germany, registrationNo: '' })).toEqual({});
    expect(errors({ ...germany, registrationNo: 'HRB 123456' })).toEqual({});
    expect(errors({ ...germany, registrationNo: '123456' })).toEqual({ registrationNo: 'registration_no_format' });
  });

  it('accepts a personal tax number from a private person only', () => {
    const poland = { country: 'PL', taxResidencyCountry: 'PL', registrationNo: '', address: { ...prishtina, countryCode: 'PL' } } as const;
    expect(errors({ ...poland, isBusiness: false, taxId: '44051401359' })).toEqual({});
    expect(errors({ ...poland, registrationNo: '0000028860', taxId: '44051401359' })).toEqual({ taxId: 'tax_id_format' });
  });

  it('needs an address chosen on the map, confirmed, in the country of registration', () => {
    expect(errors({ address: null })).toEqual({ address: 'address_required' });
    expect(errors({ address: { ...prishtina, confirmed: false } })).toEqual({ address: 'address_confirm' });
    expect(errors({ address: { ...prishtina, countryCode: 'AL' } })).toEqual({ address: 'address_wrong_country' });
  });

  it('reports every problem at once', () => {
    expect(errors({ registrationNo: '', legalName: '', selfCertified: false, address: null })).toEqual({
      legalName: 'legal_name_required',
      registrationNo: 'registration_no_required',
      address: 'address_required',
      selfCertified: 'self_certification_required',
    });
  });

  it('needs the self-certification and countries from the list', () => {
    expect(errors({ selfCertified: false })).toEqual({ selfCertified: 'self_certification_required' });
    expect(errors({ country: undefined as never })).toEqual({ country: 'country_required' });
    expect(errors({ taxResidencyCountry: 'PT' as never })).toEqual({ taxResidencyCountry: 'country_required' });
  });

  it('refuses a phone without country code and a wrong email (the sign-in texts)', () => {
    expect(errors({ contactPhone: '044 123 456', contactEmail: 'info@' })).toEqual({
      contactPhone: 'invalid_phone',
      contactEmail: 'invalid_email',
    });
  });

  it('limits every field to what the database allows', () => {
    expect(errors({ legalName: 'x'.repeat(161) })).toEqual({ legalName: 'too_long' });
  });
});

describe('moverCompanyColumns', () => {
  it('writes only the columns movers may change (never the verification or Stripe), the address by parts and as a point', () => {
    const columns = moverCompanyColumns(moverCompanyFormSchema.parse(business));
    expect(Object.keys(columns).sort()).toEqual([
      'address',
      'address_details',
      'address_point',
      'contact_email',
      'contact_phone',
      'country',
      'is_business',
      'legal_name',
      'registration_no',
      'tax_id',
      'tax_residency_country',
    ]);
    expect(columns.address).toBe('Rr. Agim Ramadani 12, 10000 Prishtinë');
    expect(columns.address_point).toBe('SRID=4326;POINT(21.1655 42.6629)');
    expect(columns.address_details).not.toHaveProperty('confirmed');
  });

  it('keeps no registration number for a private individual', () => {
    expect(moverCompanyColumns(moverCompanyFormSchema.parse({ ...business, isBusiness: false })).registration_no).toBeNull();
  });
});

describe('formatCompanyAddress', () => {
  it('leaves out the parts the map data has no value for', () => {
    expect(formatCompanyAddress({ street: 'Rruga e Kavajës', city: 'Tiranë' })).toBe('Rruga e Kavajës, Tiranë');
    expect(formatCompanyAddress({ city: 'Gjilan', postcode: '60000' })).toBe('60000 Gjilan');
  });
});

describe('moverCompanyFormDefaults', () => {
  it('starts empty with the account email, as a business', () => {
    expect(moverCompanyFormDefaults(null, 'ana@example.com')).toMatchObject({ isBusiness: true, contactEmail: 'ana@example.com', address: null, selfCertified: false });
  });

  it('fills in the saved company; a country outside the list, or an address without its point, must be chosen again', () => {
    const row: MoverCompanyRow = {
      id: '00000000-0000-4000-8000-000000000001',
      is_business: true,
      legal_name: 'Arta Mudanças Lda',
      registration_no: '123',
      tax_id: '456',
      country: 'PT',
      tax_residency_country: null,
      address: 'Rua Augusta 1, Lisboa',
      address_details: null,
      contact_phone: null,
      contact_email: null,
      verification_status: 'pending',
      self_certification_at: '2026-10-14T09:00:00Z',
    };
    expect(moverCompanyFormDefaults(row, 'ana@example.com')).toMatchObject({
      legalName: 'Arta Mudanças Lda',
      country: undefined,
      taxResidencyCountry: undefined,
      address: null,
      contactEmail: 'ana@example.com',
      selfCertified: true,
    });
  });

  it('shows a saved address as confirmed, and no separate registration number where the NIPT is one', () => {
    const { confirmed: _c, ...details } = { ...prishtina, countryCode: 'AL' };
    const row: MoverCompanyRow = {
      id: '00000000-0000-4000-8000-000000000002',
      is_business: true,
      legal_name: 'Lëvizje Shpk',
      registration_no: 'K52224002A',
      tax_id: 'K52224002A',
      country: 'AL',
      tax_residency_country: 'AL',
      address: 'Rr. Agim Ramadani 12, 10000 Prishtinë',
      address_details: details,
      contact_phone: '+355691234567',
      contact_email: 'info@levizje.example',
      verification_status: 'verified',
      self_certification_at: '2026-10-14T09:00:00Z',
    };
    expect(moverCompanyFormDefaults(row, 'ana@example.com')).toMatchObject({ registrationNo: '', address: { ...details, confirmed: true } });
  });
});

it('offers exactly the countries MoversHub prices', () => {
  expect([...MOVER_COUNTRIES].sort()).toEqual(Object.keys(MARKET_RATES).sort());
});
