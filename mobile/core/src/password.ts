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

/**
 * A code is being used: a password is owed before anything else. Stored before the sign-in happens,
 * so other tabs of the browser version (they hear about the sign-in) find it too.
 */
export async function owePassword(email: string, purpose: CodePurpose): Promise<void> {
  owed = { email, purpose };
  if (hasStorage()) await AsyncStorage.setItem(OWED_KEY, JSON.stringify(owed)).catch(() => undefined);
}

/** Why `email` still owes a password (null: it doesn't). */
export function passwordOwedBy(email: string | undefined): CodePurpose | null {
  return owed && email !== undefined && owed.email === email ? owed.purpose : null;
}

/** The password is chosen (or the person signed out, or the code was wrong): nothing is owed any more. */
export async function settlePassword(): Promise<void> {
  owed = null;
  if (hasStorage()) await AsyncStorage.removeItem(OWED_KEY).catch(() => undefined);
}

export { isPerAddressResendLimit, passwordErrorKey } from '@movershub/shared';
