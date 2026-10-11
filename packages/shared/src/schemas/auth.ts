import { z } from 'zod';

import { LOCALES, SELF_SIGNUP_ROLES } from '../constants';

/** E.164, e.g. +38344123456 (Kosovo), +48501234567 (Poland). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'invalid_phone'));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('invalid_email'));

export const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, 'invalid_code');

export const otpRequestSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('phone'), phone: phoneSchema }),
  z.object({ channel: z.literal('email'), email: emailSchema }),
]);
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('phone'), phone: phoneSchema, code: otpCodeSchema }),
  z.object({ channel: z.literal('email'), email: emailSchema, code: otpCodeSchema }),
]);
export type OtpVerify = z.infer<typeof otpVerifySchema>;

/** Metadata sent with sign-up; read by the `handle_new_user` trigger. */
export const signupMetadataSchema = z.object({
  role: z.enum(SELF_SIGNUP_ROLES),
  locale: z.enum(LOCALES),
});
export type SignupMetadata = z.infer<typeof signupMetadataSchema>;
