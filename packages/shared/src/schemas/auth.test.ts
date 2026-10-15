import { describe, expect, it } from 'vitest';

import { emailSchema, passwordSchema, phoneSchema, signupMetadataSchema } from './auth';

describe('phoneSchema', () => {
  it('normalises spaces and dashes to E.164', () => {
    expect(phoneSchema.parse('+383 44 123-456')).toBe('+38344123456');
    expect(phoneSchema.parse(' +48 501 234 567 ')).toBe('+48501234567');
  });

  it('rejects numbers without country code', () => {
    expect(phoneSchema.safeParse('044123456').success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse(' Ana@Example.COM ')).toBe('ana@example.com');
  });
});

describe('passwordSchema (the same rules as Supabase Auth)', () => {
  const error = (value: string) => passwordSchema.safeParse(value).error?.issues[0]?.message;

  it('accepts 8+ characters with a letter and a digit', () => {
    for (const ok of ['movers2026', 'Prishtina 2026!', 'łódź2026x', 'a1a1a1a1']) expect(error(ok)).toBeUndefined();
  });

  it('says what is missing', () => {
    expect(error('abc12')).toBe('password_too_short');
    expect(error('onlyletters')).toBe('password_weak');
    expect(error('12345678')).toBe('password_weak');
    // Non-ASCII letters don't count as letters for Supabase Auth.
    expect(error('ëëëëëëë1')).toBe('password_weak');
  });

  it('counts bytes, not characters, against the 72-byte limit', () => {
    expect(error(`a1${'x'.repeat(70)}`)).toBeUndefined();
    expect(error(`a1${'x'.repeat(71)}`)).toBe('password_too_long');
    expect(error(`a1${'ë'.repeat(36)}`)).toBe('password_too_long'); // 38 characters, 74 bytes
  });
});

describe('signupMetadataSchema', () => {
  it('never allows admin self-signup', () => {
    expect(signupMetadataSchema.safeParse({ role: 'admin', locale: 'en' }).success).toBe(false);
    expect(signupMetadataSchema.safeParse({ role: 'mover', locale: 'sq' }).success).toBe(true);
  });
});
