// How Supabase Auth's answers to sign-in requests read, for the app and the website alike: the error
// keys under `auth.errors` in @movershub/i18n.

/** The Supabase Auth error codes of password requests, as error keys (`auth.errors.*`). */
export function passwordErrorKey(error: { code?: string | undefined; status?: number | undefined }): string {
  if (error.code === 'invalid_credentials' || error.code === 'email_not_confirmed') return 'wrong_credentials';
  if (error.code === 'weak_password') return 'password_weak';
  if (error.code === 'same_password') return 'same_password';
  if (error.status === 429) return 'too_many_attempts';
  return 'generic';
}

/**
 * Supabase Auth refuses a second email to the same address within a minute. Treated as sent: the
 * earlier code still works, and the answer stays the same for every address. The same error code also
 * means the project's hourly email budget is used up ("email rate limit exceeded"): then nothing was
 * sent for anyone, so that one is not treated as sent.
 */
export const isPerAddressResendLimit = (error: { code?: string | undefined; message?: string | undefined }) =>
  error.code === 'over_email_send_rate_limit' && !/email rate limit exceeded/i.test(error.message ?? '');
