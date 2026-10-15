// Every sign-in by a code ends with choosing a password (design/DECISIONS.md #17) — on the website as
// in the app. Until it is chosen, the account page sends the person back to it, also after a reload:
// the requirement is a cookie (the server pages read it), set before the code is checked — like the
// app's `owePassword`, which also stores it first. The account's own data can't decide this: whoever
// creates a login can write its metadata.

export const PASSWORD_OWED_COOKIE = 'mh_password_owed';

/** After the code of "Create account" (a first password), or of "Forgot password?" (a new one). */
export type OwedPurpose = 'register' | 'recovery';

export function parseOwed(value: string | undefined | null): OwedPurpose | null {
  return value === 'register' || value === 'recovery' ? value : null;
}

/** In the browser: a password is owed (before the code is checked). One day at most. */
export function owePassword(purpose: OwedPurpose): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${PASSWORD_OWED_COOKIE}=${purpose}; path=/; max-age=86400; samesite=lax${secure}`;
}

/** In the browser: nothing is owed any more (password chosen, signed in with a password, or signed out). */
export function settlePassword(): void {
  document.cookie = `${PASSWORD_OWED_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
