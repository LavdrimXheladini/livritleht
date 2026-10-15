import { z } from 'zod';

import { LOCALES, SELF_SIGNUP_ROLES } from '../constants';

/** E.164, e.g. +38344123456 (Kosovo), +48501234567 (Poland) — a mover's contact phone. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'invalid_phone'));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('invalid_email'));

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'invalid_code');

/** Passwords: the same rules as Supabase Auth's (config.toml `minimum_password_length`, `password_requirements`). */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads only the first 72 bytes, so Supabase Auth refuses longer passwords. */
const PASSWORD_MAX_BYTES = 72;
/** UTF-8 bytes, without TextEncoder (not in every runtime this package runs in). */
const utf8Bytes = (value: string) => encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, '_').length;

/** A new password: at least 8 characters, with an ASCII letter and a digit ("letters_digits"). */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'password_too_short')
  .refine((value) => utf8Bytes(value) <= PASSWORD_MAX_BYTES, 'password_too_long')
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), 'password_weak');

/** Signing in only needs a password: older ones may predate today's rules. */
export const signInPasswordSchema = z.string().min(1, 'password_required');

/**
 * Metadata sent with sign-up; the `handle_new_user` trigger reads the locale. A `role` sent here is
 * ignored: the user chooses it after the first sign-in (`public.choose_role`), once the email is proven.
 */
export const signupMetadataSchema = z.object({
  role: z.enum(SELF_SIGNUP_ROLES).optional(),
  locale: z.enum(LOCALES),
});
export type SignupMetadata = z.infer<typeof signupMetadataSchema>;
