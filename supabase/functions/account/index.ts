// `account` — the signed-in person's own data (design/DECISIONS.md #31; COMPLIANCE §9: people can
// download and delete their data, except records the law keeps).
//   POST { action: 'export' } → everything MoversHub keeps about them, as JSON (document files and the
//     photos of their moves as links valid for an hour)
//   POST { action: 'delete', password } → { status: 'deleted' } — the password is typed again, so a
//     session left open on someone else's phone can't delete the account
//   401 sign_in_required · 400 invalid_request | wrong_password · 403 admins_only_by_platform
//   409 records_kept (a move beyond a request, or a suspension: kept until they can be anonymised —
//   COMPLIANCE-TODO §14) · 429 rate_limited
// Deleting removes a mover's company (documents, files, vans, prices, work areas, reminders), the
// requests customers saved with that mover (never booked, so nothing to keep), and then the login,
// which takes the profile, the person's own requests, confirmed phones and register checks with it.

import {
  DELETABLE_JOB_STATUSES,
  JOB_PHOTO_BUCKET,
  accountRequestSchema,
} from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { serviceRows } from '../_shared/service.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DOCUMENTS = 'mover-documents';
const service = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

type AuthUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string; email_confirmed_at?: string };
type Company = { id: string } & Record<string, unknown>;

async function authUser(id: string): Promise<AuthUser> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: service, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`auth user ${res.status}`);
  return (await res.json()) as AuthUser;
}

/** The password typed again: Supabase Auth checks it (a wrong one: 400). */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(5000),
  });
  if (res.ok) return true;
  if (res.status === 400) return false;
  throw new Error(`password check ${res.status}`);
}

/** Every file in the company's folder of the private bucket (`<company>/<type>/<file>`). */
async function companyFiles(companyId: string): Promise<string[]> {
  const list = async (prefix: string) => {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${DOCUMENTS}`, {
      method: 'POST',
      headers: service,
      body: JSON.stringify({ prefix, limit: 1000 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`storage list ${res.status}`);
    return (await res.json()) as { name: string; id: string | null }[];
  };
  const files: string[] = [];
  for (const entry of await list(`${companyId}/`)) {
    // Folders (one per document type) have no id.
    if (entry.id) files.push(`${companyId}/${entry.name}`);
    else for (const file of await list(`${companyId}/${entry.name}/`)) if (file.id) files.push(`${companyId}/${entry.name}/${file.name}`);
  }
  return files;
}

async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ expiresIn: 3600 }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL?: string };
  return signedURL ? `${SUPABASE_URL}/storage/v1${signedURL}` : null;
}

/** Links valid for an hour to many files of a bucket, signed in one request (a move can have 40 photos). */
async function signedUrls(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!paths.length) return links;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ expiresIn: 3600, paths }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return links;
  for (const one of (await res.json()) as { path?: string | null; signedURL?: string | null }[]) {
    if (one.path && one.signedURL) links.set(one.path, `${SUPABASE_URL}/storage/v1${one.signedURL}`);
  }
  return links;
}

type Photo = { stage: string; path: string; taken_at: string };

const eq = (id: string) => `eq.${id}`;

async function exportData(user: AuthUser) {
  const [profile] = await serviceRows<Record<string, unknown>>('GET', `profiles?id=${eq(user.id)}&select=*`);
  const moves = await serviceRows<{ job_photos: Photo[] } & Record<string, unknown>>(
    'GET',
    `jobs?customer_id=${eq(user.id)}&select=*,pickup_lat,pickup_lon,dropoff_lat,dropoff_lon,quotes(*),job_offers(status,expires_at,created_at,answered_at),job_events(event,status,actor_role,created_at),job_photos(stage,path,taken_at),job_cancellations(cancelled_by,status_before,reason,scheduled_at,cancel_free_hours,cancel_late_pct,free_until,mover_price,currency,fee,fee_rule,created_at)&order=created_at.desc`,
  );
  const photoLinks = await signedUrls(JOB_PHOTO_BUCKET, moves.flatMap((m) => m.job_photos.map((p) => p.path)));
  const [company] = await serviceRows<Company>('GET', `mover_companies?owner_id=${eq(user.id)}&select=*`);
  const byCompany = async <T>(table: string, select = '*') =>
    company ? await serviceRows<T>('GET', `${table}?company_id=${eq(company.id)}&select=${select}`) : [];
  const documents = await byCompany<{ file_path: string } & Record<string, unknown>>('mover_documents');
  const vehicles = await byCompany<{ id: string }>('vehicles', '*,rate_cards(*)');
  return {
    exportedAt: new Date().toISOString(),
    about: 'Everything MoversHub keeps about your account (COMPLIANCE §9). Document and photo links work for one hour.',
    account: { id: user.id, email: user.email, createdAt: user.created_at, emailConfirmedAt: user.email_confirmed_at, lastSignInAt: user.last_sign_in_at },
    profile: profile ?? null,
    // Their moves with the log, the photos of the things (links) and a cancellation after acceptance.
    moves: moves.map((m) => ({ ...m, job_photos: m.job_photos.map((p) => ({ ...p, downloadUrl: photoLinks.get(p.path) ?? null })) })),
    moverCompany: company ?? null,
    documents: await Promise.all(documents.map(async (d) => ({ ...d, downloadUrl: await signedUrl(DOCUMENTS, d.file_path) }))),
    vehicles,
    serviceAreas: await byCompany('service_areas'),
    reminders: await serviceRows('GET', `mover_reminders?user_id=${eq(user.id)}&select=*&order=created_at.desc`),
    // Decisions about the company the mover was told of, and their appeals and complaints (COMPLIANCE §3).
    decisions: await byCompany(
      'suspensions',
      'id,kind,flagged_by,reason_text,is_serious_violation,notice_sent_at,effective_at,lifted_at,created_at&notice_sent_at=not.is.null&order=created_at.desc',
    ),
    appeals: await byCompany('mover_appeals', 'id,suspension_id,subject,text,status,decision_reason,created_at,resolved_at&order=created_at.desc'),
    // Which versions of the terms the account accepted, and when; notices of new terms to the company.
    // Job requests to the company and how they were answered (the moves' details stay the customers').
    jobRequests: company
      ? await serviceRows('GET', `job_offers?mover_company_id=${eq(company.id)}&select=job_id,status,expires_at,created_at,answered_at&order=created_at.desc`)
      : [],
    // The mover's own steps on move days, when they added photos (the photos themselves show the
    // customers' homes and things: they stay with the customers' data — GDPR art. 15(4)), and moves
    // cancelled after their acceptance, by either side.
    jobSteps: await serviceRows('GET', `job_events?actor_id=${eq(user.id)}&actor_role=eq.mover&select=job_id,event,status,created_at&order=created_at.desc`),
    photosAdded: await serviceRows('GET', `job_photos?uploaded_by=${eq(user.id)}&select=job_id,stage,taken_at&order=taken_at.desc`),
    cancellations: company
      ? await serviceRows(
          'GET',
          `job_cancellations?mover_company_id=${eq(company.id)}&select=job_id,cancelled_by,status_before,reason,fee,fee_rule,currency,created_at&order=created_at.desc`,
        )
      : [],
    termsAccepted: await serviceRows('GET', `terms_acceptances?user_id=${eq(user.id)}&select=accepted_at,terms_versions(audience,version,effective_at)&order=accepted_at.desc`),
    termsNotices: await byCompany('terms_notices', 'channel,sent_at,terms_versions(audience,version,effective_at)&order=sent_at.desc'),
    // MoversHub's decisions on the company's setup (who decided stays out: MoversHub's staff).
    reviewHistory: company
      ? await serviceRows('GET', `audit_log?entity_id=in.(${[company.id, ...documents.map((d) => d.id), ...vehicles.map((v) => v.id)].join(',')})&select=action,entity,entity_id,note,created_at&order=created_at.desc`)
      : [],
    confirmedPhones: await serviceRows('GET', `phone_verifications?user_id=${eq(user.id)}&select=*`),
    registerChecks: await serviceRows('GET', `company_registry_checks?user_id=${eq(user.id)}&select=*`),
  };
}

/**
 * Moves that are records to keep: anything beyond a saved request — except one cancelled before any
 * mover accepted it (nothing happened, nothing was paid).
 */
async function keptMoves(filter: string): Promise<boolean> {
  const moves = await serviceRows<{ status: string; job_offers: { status: string }[] }>(
    'GET',
    `jobs?${filter}&status=not.in.(${DELETABLE_JOB_STATUSES.join(',')})&select=status,job_offers(status)`,
  );
  return moves.some((m) => m.status !== 'CANCELLED' || m.job_offers.some((o) => o.status === 'accepted'));
}

/** What must be kept stops the deletion (until anonymising exists — COMPLIANCE-TODO §14). */
async function keptRecords(userId: string, companyId: string | null): Promise<boolean> {
  if (await keptMoves(`customer_id=${eq(userId)}`)) return true;
  if (!companyId) return false;
  const [asMover, suspensions] = await Promise.all([
    keptMoves(`chosen_mover_company_id=${eq(companyId)}`),
    serviceRows('GET', `suspensions?company_id=${eq(companyId)}&select=id&limit=1`),
  ]);
  return asMover || suspensions.length > 0;
}

async function deleteAccount(user: AuthUser, companyId: string | null): Promise<void> {
  if (companyId) {
    // Customers' requests with this mover, never booked or cancelled before any acceptance (keptRecords
    // checked): they can't be booked any more. Then the
    // mover's older prices on requests that moved on to another mover (the request itself stays).
    await serviceRows('DELETE', `jobs?chosen_mover_company_id=${eq(companyId)}&status=in.(${DELETABLE_JOB_STATUSES.join(',')},CANCELLED)&select=id`);
    await serviceRows('DELETE', `quotes?mover_company_id=${eq(companyId)}&select=id`);
    // The files first: once the company is gone, nothing would point to them.
    const files = await companyFiles(companyId);
    if (files.length) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${DOCUMENTS}`, {
        method: 'DELETE',
        headers: service,
        body: JSON.stringify({ prefixes: files }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`storage delete ${res.status}`);
    }
    // Documents, vans, prices, work areas and reminders go with the company.
    await serviceRows('DELETE', `mover_companies?id=${eq(companyId)}&select=id`);
  }
  // The login last: the profile, the person's own requests (and their quotes), confirmed phones and
  // register checks go with it.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: service, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`auth delete ${res.status}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('account: sign-in check failed', failure(e));
    return json(req, { error: 'unavailable' }, 503);
  }
  if (who.kind !== 'user') return json(req, { error: 'sign_in_required' }, 401);
  const limited = await rateLimited(req, 'account', who);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  const parsed = accountRequestSchema.safeParse(body);
  if (!parsed.success) return json(req, { error: 'invalid_request' }, 400);

  try {
    const user = await authUser(who.userId);
    if (parsed.data.action === 'export') return json(req, await exportData(user));

    const [profile] = await serviceRows<{ role: string | null }>('GET', `profiles?id=${eq(user.id)}&select=role`);
    // Admin accounts are given and taken by the platform.
    if (profile?.role === 'admin') return json(req, { error: 'admins_only_by_platform' }, 403);
    if (!user.email || !(await passwordMatches(user.email, parsed.data.password))) return json(req, { error: 'wrong_password' }, 400);
    const [company] = await serviceRows<Company>('GET', `mover_companies?owner_id=${eq(user.id)}&select=id`);
    if (await keptRecords(user.id, company?.id ?? null)) return json(req, { error: 'records_kept' }, 409);
    await deleteAccount(user, company?.id ?? null);
    return json(req, { status: 'deleted' });
  } catch (e) {
    console.error(`account ${parsed.data.action} failed`, failure(e));
    return json(req, { error: 'unavailable' }, 500);
  }
});
