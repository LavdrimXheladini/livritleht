import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import type { CodePurpose } from './pending-sign-in';

/*
 * Every sign-in by a code ends with choosing a password (design/DECISIONS.md #17): to confirm a new
 * account, after "Forgot password?", and for "Create account" with an address that already has an
 * account. Until it is chosen the app shows nothing else — also after a restart, so the requirement is
 * kept on the device, not only in memory. The account's own data can't decide this: whoever creates a
 * login can write its metadata. On the server, a password set before the address was proven is cleared
 * when the owner confirms it (migration 20261013120000).
 */
const OWED_KEY = 'movershub.passwordOwed';
const owedSchema = z.object({ email: z.string(), purpose: z.enum(['register', 'recovery']) });
type Owed = z.infer<typeof owedSchema>;

let owed: Owed | null = null;

/** No device storage while Expo web pre-renders in Node. */
const hasStorage = () => typeof window !== 'undefined';

/** At launch: a password still owed from before the app closed. */
export async function restorePasswordOwed(): Promise<void> {
  if (!hasStorage()) return;
  try {
    const raw = await AsyncStorage.getItem(OWED_KEY);
    const saved = owedSchema.safeParse(raw ? JSON.parse(raw) : null);
    owed = saved.success ? saved.data : null;
  } catch {
    owed = null;
  }
}

/** Signed in by a code: a password is owed before anything else. */
export function owePassword(email: string, purpose: CodePurpose): void {
  owed = { email, purpose };
  if (hasStorage()) AsyncStorage.setItem(OWED_KEY, JSON.stringify(owed)).catch(() => undefined);
}

/** Why `email` still owes a password (null: it doesn't). */
export function passwordOwedBy(email: string | undefined): CodePurpose | null {
  return owed && email !== undefined && owed.email === email ? owed.purpose : null;
}

/** The password is chosen (or the person signed out): nothing is owed any more. */
export function settlePassword(): void {
  owed = null;
  if (hasStorage()) AsyncStorage.removeItem(OWED_KEY).catch(() => undefined);
}

/** The Supabase Auth error codes of password requests, as the app's error keys. */
export function passwordErrorKey(error: { code?: string | undefined; status?: number | undefined }): string {
  if (error.code === 'invalid_credentials' || error.code === 'email_not_confirmed') return 'wrong_credentials';
  if (error.code === 'weak_password') return 'password_weak';
  if (error.code === 'same_password') return 'same_password';
  if (error.status === 429) return 'too_many_attempts';
  return 'generic';
}

/**
 * Supabase Auth refuses a second email to the same existing address within a minute
 * (`over_email_send_rate_limit`) but never for an address without an account. Treated as sent: the
 * earlier code still works, and the answer stays the same for every address.
 */
export const isEmailResendLimit = (error: { code?: string | undefined }) => error.code === 'over_email_send_rate_limit';
