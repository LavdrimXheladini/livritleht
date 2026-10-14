// `phone-verification` — a mover proves their contact phone with a 6-digit code (design/DECISIONS.md #19).
//   POST { action: 'send', phone, channel: 'sms' | 'whatsapp', locale } → { status: 'sent' }
//   POST { action: 'check', phone, code } → { status: 'approved' } | { status: 'wrong_code' }
// An approved code is recorded in public.phone_verifications (service role); Postgres accepts a
// company's contact phone only from that list. Codes come from Twilio Verify (TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID). Test numbers (PHONE_TEST_NUMBERS, e.g.
// "+38344000001=123456") take a fixed code and send nothing — for local development and the test
// project; never list a number someone could own. Signed-in users only (401); limited per account
// and per phone number (RATE_LIMITS.phoneCodeSend / phoneCodeCheck → 429).

import { z } from 'zod';

import { LOCALES, phoneSchema, type Locale } from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { insertRows } from '../_shared/service.ts';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), phone: phoneSchema, channel: z.enum(['sms', 'whatsapp']), locale: z.enum(LOCALES) }).strict(),
  z.object({ action: z.literal('check'), phone: phoneSchema, code: z.string().regex(/^\d{4,10}$/) }).strict(),
]);

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') ?? '';
const twilioReady = ACCOUNT_SID !== '' && AUTH_TOKEN !== '' && VERIFY_SID !== '';

/** "+38344000001=123456,+48500000001=123456" → test number → its code. */
const TEST_NUMBERS = new Map(
  (Deno.env.get('PHONE_TEST_NUMBERS') ?? '')
    .split(',')
    .map((entry) => entry.split('=').map((part) => part.trim()))
    .filter((pair): pair is [string, string] => pair.length === 2 && /^\+\d{8,15}$/.test(pair[0]!) && /^\d{4,10}$/.test(pair[1]!)),
);

/** Twilio Verify's message languages (Albanian has none: English; Serbian: the closest, Croatian). */
const TWILIO_LOCALE: Record<Locale, string> = { en: 'en', sq: 'en', pl: 'pl', sr: 'hr', de: 'de' };

async function twilio(path: string, form: Record<string, string>): Promise<Response> {
  return fetch(`https://verify.twilio.com/v2/Services/${VERIFY_SID}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Twilio's error code from an error answer (e.g. 60200 invalid number, 60203 too many sends). */
const twilioCode = async (res: Response) => ((await res.json().catch(() => ({}))) as { code?: number }).code;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('phone-verification: sign-in check failed', failure(e));
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
  const request = parsed.data;
  const testCode = TEST_NUMBERS.get(request.phone);

  if (request.action === 'send') {
    // Per account, and per number: one number can't be flooded with codes from many accounts.
    const limited =
      (await rateLimited(req, 'phoneCodeSend', who)) ??
      (await rateLimited(req, 'phoneCodeSend', { kind: 'user', userId: `phone:${request.phone}` }));
    if (limited) return limited;
    if (testCode) return json(req, { status: 'sent' });
    if (!twilioReady) return json(req, { error: 'codes_unavailable' }, 503);
    try {
      const res = await twilio('Verifications', { To: request.phone, Channel: request.channel, Locale: TWILIO_LOCALE[request.locale] });
      if (res.ok) return json(req, { status: 'sent' });
      const code = await twilioCode(res);
      if (code === 60200 || code === 60205 || code === 21211) return json(req, { error: 'invalid_phone' }, 400);
      if (code === 60203 || res.status === 429) return json(req, { error: 'rate_limited' }, 429, { 'Retry-After': '600' });
      console.error('phone-verification: send failed', res.status, code);
      return json(req, { error: 'send_failed' }, 502);
    } catch (e) {
      console.error('phone-verification: send failed', failure(e));
      return json(req, { error: 'send_failed' }, 502);
    }
  }

  const limited = await rateLimited(req, 'phoneCodeCheck', who);
  if (limited) return limited;
  let approved: boolean;
  let channel: 'sms' | 'whatsapp' | 'test' = 'test';
  if (testCode) {
    approved = request.code === testCode;
  } else {
    if (!twilioReady) return json(req, { error: 'codes_unavailable' }, 503);
    try {
      const res = await twilio('VerificationCheck', { To: request.phone, Code: request.code });
      // 404: no code pending for this number (expired, or already used).
      if (res.status === 404) return json(req, { status: 'wrong_code' });
      if (res.status === 429 || (await twilioCode(res.clone())) === 60202) {
        return json(req, { error: 'rate_limited' }, 429, { 'Retry-After': '600' });
      }
      if (!res.ok) throw new Error(`VerificationCheck ${res.status}`);
      const check = (await res.json()) as { status?: string; channel?: string };
      approved = check.status === 'approved';
      channel = check.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    } catch (e) {
      console.error('phone-verification: check failed', failure(e));
      return json(req, { error: 'unavailable' }, 502);
    }
  }
  if (!approved) return json(req, { status: 'wrong_code' });
  try {
    await insertRows('phone_verifications', [{ user_id: who.userId, phone: request.phone, channel, verified_at: new Date().toISOString() }], 'user_id,phone');
  } catch (e) {
    console.error('phone-verification: saving failed', failure(e));
    return json(req, { error: 'unavailable' }, 502);
  }
  return json(req, { status: 'approved' });
});
