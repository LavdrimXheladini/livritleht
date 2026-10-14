// `company-registry` — asks the official register about a mover's tax number (design/DECISIONS.md #19,
// COMPLIANCE §5 "registry lookup"):
//   POST { country, isBusiness, taxId, legalName } → { result, register, registeredName?, authoritative }
// - EU VAT numbers (Germany, Austria; Poland as fallback): VIES, the European Commission's service.
// - Poland: the Ministry of Finance's VAT white list (name, address, also VAT-exempt firms).
// - Switzerland: the federal UID register.
// `result`: match / mismatch (the register's name vs the typed one), valid (the register has no name to
// compare — German VAT numbers), not_found, unavailable (no answer). `authoritative`: "not found"
// means the number doesn't exist (VAT numbers, UIDs), not just "not VAT-registered" (a Polish NIP).
// Kosovo, Albania and North Macedonia have no register API → `{ result: 'manual' }`: MoversHub checks
// those by hand. Every answer is kept in public.company_registry_checks for the verification.
// Signed-in users only (401); RATE_LIMITS.companyRegistry per account (429).

import { z } from 'zod';

import {
  MOVER_COUNTRIES,
  TAX_ID_KINDS,
  matchId,
  sameCompanyName,
  type CompanyRegister,
} from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { insertRows } from '../_shared/service.ts';

const requestSchema = z
  .object({
    country: z.enum(MOVER_COUNTRIES),
    isBusiness: z.boolean(),
    taxId: z.string().trim().min(1).max(60),
    legalName: z.string().trim().min(2).max(160),
  })
  .strict();

type Found = { kind: 'found'; name: string | null; address: string | null } | { kind: 'not_found' } | { kind: 'unavailable' };

const TIMEOUT_MS = 8000;

/** VIES (EU VAT numbers). Germany shares no name or address ("---"). */
async function vies(countryCode: string, vatNumber: string): Promise<Found> {
  try {
    const res = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { kind: 'unavailable' };
    const body = (await res.json()) as { valid?: boolean; name?: string; address?: string };
    if (body.valid !== true) return { kind: 'not_found' };
    const known = (value?: string) => (value && value.trim() !== '---' && value.trim() !== '' ? value.trim().replace(/\s*\n\s*/g, ', ') : null);
    return { kind: 'found', name: known(body.name), address: known(body.address) };
  } catch (e) {
    console.error('company-registry: VIES failed', failure(e));
    return { kind: 'unavailable' };
  }
}

/** The Polish VAT white list (wl-api.mf.gov.pl): active and exempt VAT payers by NIP. */
async function polishWhiteList(nip: string): Promise<Found> {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { kind: 'unavailable' };
    const body = (await res.json()) as { result?: { subject?: { name?: string; workingAddress?: string | null; residenceAddress?: string | null } | null } };
    const subject = body.result?.subject;
    if (!subject) return { kind: 'not_found' };
    return { kind: 'found', name: subject.name ?? null, address: subject.workingAddress ?? subject.residenceAddress ?? null };
  } catch (e) {
    console.error('company-registry: white list failed', failure(e));
    return { kind: 'unavailable' };
  }
}

const xmlText = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml);
  return m ? m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : null;
};

/** The Swiss UID register (uid-wse.admin.ch, public GetByUID). An unknown UID answers with an empty result. */
async function swissUidRegister(uid: string): Promise<Found> {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:uid="http://www.uid.admin.ch/xmlns/uid-wse" xmlns:ech="http://www.ech.ch/xmlns/eCH-0097/5"><soapenv:Body><uid:GetByUID><uid:uid><ech:uidOrganisationIdCategorie>CHE</ech:uidOrganisationIdCategorie><ech:uidOrganisationId>${uid.slice(3)}</ech:uidOrganisationId></uid:uid></uid:GetByUID></soapenv:Body></soapenv:Envelope>`;
  try {
    const res = await fetch('https://www.uid-wse.admin.ch/V5.0/PublicServices.svc', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://www.uid.admin.ch/xmlns/uid-wse/IPublicServices/GetByUID"',
      },
      body: envelope,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { kind: 'unavailable' };
    const xml = await res.text();
    const name = xmlText(xml, 'organisationLegalName') ?? xmlText(xml, 'organisationName');
    if (!name) return { kind: 'not_found' };
    const street = [xmlText(xml, 'street'), xmlText(xml, 'houseNumber')].filter(Boolean).join(' ');
    const town = [xmlText(xml, 'swissZipCode'), xmlText(xml, 'town')].filter(Boolean).join(' ');
    return { kind: 'found', name, address: [street, town].filter(Boolean).join(', ') || null };
  } catch (e) {
    console.error('company-registry: UID register failed', failure(e));
    return { kind: 'unavailable' };
  }
}

/** Asks the register that knows this number; a Polish NIP goes to VIES when the white list can't answer. */
async function lookUp(register: CompanyRegister, taxId: string): Promise<{ register: CompanyRegister; found: Found }> {
  if (register === 'ch-uid') return { register, found: await swissUidRegister(taxId) };
  if (register === 'pl-white-list') {
    const found = await polishWhiteList(taxId);
    if (found.kind !== 'unavailable') return { register, found };
    return { register: 'vies', found: await vies('PL', taxId) };
  }
  // VIES wants the number without its country prefix ("DE136695976" → "136695976", "ATU…" → "U…").
  return { register, found: await vies(taxId.slice(0, 2), taxId.slice(2)) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('company-registry: sign-in check failed', failure(e));
    return json(req, { error: 'unavailable' }, 503);
  }
  if (who.kind !== 'user') return json(req, { error: 'sign_in_required' }, 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json(req, { error: 'invalid_request' }, 400);
  const { country, isBusiness, taxId: raw, legalName } = parsed.data;

  // The same rules as the app's form: a number that fits none of the country's formats is refused.
  const id = matchId(TAX_ID_KINDS[country][isBusiness ? 'business' : 'person'], raw);
  if (!id) return json(req, { error: 'invalid_number' }, 400);
  if (!id.kind.register) return json(req, { result: 'manual' });

  const limited = await rateLimited(req, 'companyRegistry', who);
  if (limited) return limited;

  const { register, found } = await lookUp(id.kind.register, id.value);
  const result =
    found.kind !== 'found'
      ? found.kind
      : found.name === null
        ? 'valid'
        : sameCompanyName(legalName, found.name)
          ? 'match'
          : 'mismatch';
  const registeredName = found.kind === 'found' ? found.name : null;
  try {
    await insertRows('company_registry_checks', [
      {
        user_id: who.userId,
        country,
        tax_id: id.value,
        register,
        result,
        typed_name: legalName,
        registered_name: registeredName?.slice(0, 300) ?? null,
        registered_address: found.kind === 'found' ? (found.address?.slice(0, 500) ?? null) : null,
      },
    ]);
  } catch (e) {
    // The answer still helps the mover now; the admin asks the register again if the record is missing.
    console.error('company-registry: saving the answer failed', failure(e));
  }
  return json(req, {
    result,
    register,
    ...(registeredName ? { registeredName } : {}),
    authoritative: id.kind.registerIsAuthoritative === true,
  });
});
