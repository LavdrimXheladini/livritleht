import type { Session } from '@supabase/supabase-js';

import { signedInWithPassword } from './pending-sign-in';

/**
 * Set in the account's user metadata when the person saves a password in the app. The code is
 * needed once, to confirm the email; after that people sign in with email and password, so a
 * signed-in account without one is asked to create it first (design/DECISIONS.md #17). Only a
 * hint for the app's screens — what anyone may do is enforced on the server.
 */
export const PASSWORD_SET = 'password_set';

/** Whether the signed-in account has a password: saved in the app, or just used to sign in. */
export function hasPassword(session: Session | null): boolean {
  if (!session) return false;
  return session.user.user_metadata?.[PASSWORD_SET] === true || signedInWithPassword(session.user.email);
}

/** The Supabase Auth error codes of password requests, as the app's error keys. */
export function passwordErrorKey(error: { code?: string | undefined; status?: number | undefined }): string {
  if (error.code === 'invalid_credentials' || error.code === 'email_not_confirmed') return 'wrong_credentials';
  if (error.code === 'weak_password') return 'password_weak';
  if (error.code === 'same_password') return 'same_password';
  if (error.status === 429) return 'too_many_attempts';
  return 'generic';
}
