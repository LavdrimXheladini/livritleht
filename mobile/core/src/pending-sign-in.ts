import type { SelfSignupRole } from '@movershub/shared';

/** The two tabs of the signed-out screen: sign in with a password, or create an account. */
export type AuthMode = 'login' | 'register';

/** Why a code was emailed: to confirm a new account (or open an existing one), or to set a new password. */
export type CodePurpose = 'register' | 'recovery';

/**
 * What the person asked for on the signed-out screens: the email the code went to, why, and (when
 * creating an account) the role they picked. Kept in memory only — never in a route or URL, where
 * the address would land in the browser's history and server logs (COMPLIANCE §9).
 */
export type PendingSignIn = { email: string; purpose: CodePurpose; role: SelfSignupRole | null };

let pending: PendingSignIn | null = null;

export const setPendingSignIn = (next: PendingSignIn | null) => {
  pending = next;
};
export const getPendingSignIn = (): PendingSignIn | null => pending;

/**
 * The pending sign-in, but only if it belongs to the account that is now signed in — in the browser
 * version another tab can sign in someone else. A pending sign-in for another email is dropped.
 */
export function pendingSignInFor(email: string | undefined): PendingSignIn | null {
  if (pending && pending.email !== email) pending = null;
  return pending;
}

/** The role the person asked for last (on the chooser too), for the "already has an account" notice. */
export function rememberRequestedRole(role: SelfSignupRole) {
  if (pending) pending = { ...pending, role };
}

/** The address typed on the signed-out screens, carried between them (in memory, never in a URL). */
let draftEmail = '';
let draftVersion = 0;

/** Typed on sign in / create account. */
export const setDraftEmail = (email: string) => {
  draftEmail = email;
};
/** Typed on another screen ("Forgot password?"): the sign-in form takes it over when it shows again. */
export const adoptDraftEmail = (email: string) => {
  draftEmail = email;
  draftVersion += 1;
};
/** Signed in or out: the next person on this device starts with an empty field. */
export const clearDraftEmail = () => adoptDraftEmail('');
export const getDraftEmail = (): string => draftEmail;
export const getDraftVersion = (): number => draftVersion;
