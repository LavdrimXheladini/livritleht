import { describe, expect, it } from 'vitest';

import {
  RATE_LIMITS,
  bearerUserClaims,
  clientIp,
  isServerKey,
  memoryRateLimiter,
  rateLimitKey,
  rateLimitSubject,
  rateLimitUserKey,
  serverKeys,
} from './rate-limit';

declare const btoa: (data: string) => string;

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

describe('rate limits', () => {
  it('are the agreed budgets: 30 quotes per 10 minutes, 60 address searches per minute, few phone codes, 20 booking requests, 10 data requests, 60 job steps', () => {
    expect(RATE_LIMITS).toEqual({
      quote: { limit: 30, windowSeconds: 600 },
      addressSearch: { limit: 60, windowSeconds: 60 },
      phoneCodeSend: { limit: 5, windowSeconds: 3600 },
      phoneCodeCheck: { limit: 10, windowSeconds: 600 },
      companyRegistry: { limit: 20, windowSeconds: 600 },
      book: { limit: 20, windowSeconds: 600 },
      account: { limit: 10, windowSeconds: 600 },
      jobTransition: { limit: 60, windowSeconds: 600 },
    });
  });
});

describe('client IP', () => {
  it('on Supabase, trusts Cloudflare’s header, else the address the platform appended last', () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }), 'supabase')).toBe('203.0.113.7');
    // A client-sent X-Forwarded-For comes first; the real address is appended after it.
    expect(clientIp(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }), 'supabase')).toBe('203.0.113.7');
    expect(clientIp(headers({ 'x-forwarded-for': ' 203.0.113.7 ' }), 'supabase')).toBe('203.0.113.7');
  });

  it('on Vercel, reads the address Vercel wrote', () => {
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '198.51.100.4' }), 'vercel')).toBe('198.51.100.4');
    expect(clientIp(headers({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }), 'vercel')).toBe('198.51.100.4');
  });

  it('is null when no proxy recorded one', () => {
    expect(clientIp(headers({}), 'supabase')).toBeNull();
    expect(clientIp(headers({ 'x-forwarded-for': ' , ' }), 'vercel')).toBeNull();
  });
});

describe('who a limit counts against', () => {
  it('is the IPv4 address itself, also when written as IPv6', () => {
    expect(rateLimitSubject('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitSubject('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('is the /64 network for IPv6, however the address is written', () => {
    const net = '2001:db8:12:34::/64';
    expect(rateLimitSubject('2001:db8:12:34::1')).toBe(net);
    expect(rateLimitSubject('2001:0DB8:0012:0034:aaaa:bbbb:cccc:dddd')).toBe(net);
    expect(rateLimitSubject('2001:db8:12:34:ffff::9%eth0')).toBe(net);
    expect(rateLimitSubject('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(rateLimitSubject('::1')).toBe('0:0:0:0::/64');
  });

  it('keeps anything it cannot read as it is, without throwing', () => {
    for (const odd of ['unknown', '1:2:3:4:5:6:7:8:9', '1::2::3', '1:2:3:4:5:6:7::8:9', 'zz::1']) {
      expect(rateLimitSubject(odd)).toBe(odd);
    }
  });

  it('keys each endpoint separately, and unknown callers share one key', () => {
    expect(rateLimitKey('quote', '203.0.113.7')).toBe('quote:203.0.113.7');
    expect(rateLimitKey('addressSearch', '2001:db8:12:34::1')).toBe('addressSearch:2001:db8:12:34::/64');
    expect(rateLimitKey('quote', null)).toBe('quote:unknown');
  });

  it('keys a signed-in user by account, apart from every IP key', () => {
    const id = '4b9f0c8e-1d2a-4c3b-9e8f-0123456789ab';
    expect(rateLimitUserKey('addressSearch', id)).toBe(`addressSearch:user:${id}`);
    expect(rateLimitUserKey('quote', id)).not.toBe(rateLimitUserKey('addressSearch', id));
    expect(rateLimitUserKey('quote', id)).not.toBe(rateLimitKey('quote', 'user'));
  });
});

describe('signed-in user token (unverified claims)', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  // UTF-8 bytes, like a real token.
  const b64url = (value: object) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const token = (claims: object) => `Bearer ${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url(claims)}.c2lnbmF0dXJl`;
  const user = { sub: 'user-1', role: 'authenticated', exp: now / 1000 + 3600 };

  it('reads the user and expiry of a signed-in user token', () => {
    expect(bearerUserClaims(token(user), now)).toEqual({ sub: 'user-1', exp: user.exp });
  });

  it('decodes base64url: "-" and "_" (e.g. from "~", "?" or accented letters in the metadata)', () => {
    const header = token({ ...user, user_metadata: { name: '>>>???', city: 'Prizrenë' } });
    const payload = header.split('.')[1] ?? '';
    expect(payload).toMatch(/-/);
    expect(payload).toMatch(/_/);
    expect(bearerUserClaims(header, now)).toEqual({ sub: 'user-1', exp: user.exp });
  });

  it('is null for anything that cannot be a signed-in user', () => {
    for (const header of [
      null,
      '',
      'Bearer sb_publishable_abc123',
      token({ role: 'anon', exp: user.exp }),
      token({ ...user, role: 'service_role' }),
      token({ ...user, sub: '' }),
      token({ ...user, exp: now / 1000 - 1 }),
      token({ sub: 'user-1', role: 'authenticated' }),
      'Bearer a.not-json.c',
      `Basic ${b64url(user)}`,
    ]) {
      expect(bearerUserClaims(header, now)).toBeNull();
    }
  });
});

describe('in-memory limiter (fallback)', () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it('allows up to the limit, then blocks until the window has passed', () => {
    let t = 0;
    const hit = memoryRateLimiter(() => t);
    expect([hit('a', rule), hit('a', rule), hit('a', rule), hit('a', rule)]).toEqual([true, true, true, false]);
    t = 59_999;
    expect(hit('a', rule)).toBe(false);
    t = 60_000;
    expect(hit('a', rule)).toBe(true);
  });

  it('counts every key on its own', () => {
    const hit = memoryRateLimiter(() => 0);
    for (let i = 0; i < 3; i++) hit('a', rule);
    expect(hit('a', rule)).toBe(false);
    expect(hit('b', rule)).toBe(true);
  });

  it('never holds more than its cap of keys', () => {
    let t = 0;
    const hit = memoryRateLimiter(() => t, 100);
    for (let i = 0; i < 1000; i++) {
      t = i;
      hit(`ip-${i}`, rule);
    }
    // The newest keys are still counted.
    for (let i = 0; i < 3; i++) hit('ip-999', rule);
    expect(hit('ip-999', rule)).toBe(false);
  });
});

describe('server keys', () => {
  it('reads the named secret keys and the legacy service-role key', () => {
    expect(serverKeys('{"default":"sb_secret_a","ci":"sb_secret_b"}', 'legacy-jwt')).toEqual(['sb_secret_a', 'sb_secret_b', 'legacy-jwt']);
    expect(serverKeys(undefined, '')).toEqual([]);
    expect(serverKeys('not json', 'legacy-jwt')).toEqual(['legacy-jwt']);
    expect(serverKeys('{"default":"","n":3}', undefined)).toEqual([]);
  });

  it('recognises only an exact secret key', () => {
    const keys = ['sb_secret_abc', 'legacy-jwt'];
    expect(isServerKey('sb_secret_abc', keys)).toBe(true);
    expect(isServerKey('legacy-jwt', keys)).toBe(true);
    for (const other of [null, '', 'sb_secret_ab', 'sb_secret_abd', 'sb_publishable_abc', 'SB_SECRET_ABC']) {
      expect(isServerKey(other, keys)).toBe(false);
    }
    expect(isServerKey('anything', [])).toBe(false);
  });
});
