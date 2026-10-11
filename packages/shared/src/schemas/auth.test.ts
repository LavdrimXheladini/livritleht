import { describe, expect, it } from 'vitest';

import { otpRequestSchema, phoneSchema, signupMetadataSchema } from './auth';

describe('phoneSchema', () => {
  it('normalises spaces and dashes to E.164', () => {
    expect(phoneSchema.parse('+383 44 123-456')).toBe('+38344123456');
    expect(phoneSchema.parse(' +48 501 234 567 ')).toBe('+48501234567');
  });

  it('rejects numbers without country code', () => {
    expect(phoneSchema.safeParse('044123456').success).toBe(false);
  });
});

describe('otpRequestSchema', () => {
  it('lowercases email', () => {
    expect(otpRequestSchema.parse({ channel: 'email', email: ' Ana@Example.COM ' })).toEqual({
      channel: 'email',
      email: 'ana@example.com',
    });
  });
});

describe('signupMetadataSchema', () => {
  it('never allows admin self-signup', () => {
    expect(signupMetadataSchema.safeParse({ role: 'admin', locale: 'en' }).success).toBe(false);
    expect(signupMetadataSchema.safeParse({ role: 'mover', locale: 'sq' }).success).toBe(true);
  });
});
