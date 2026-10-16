/*
 * A message for the sign-in screen the moment someone is signed out by something other than "Sign out"
 * — e.g. "Your account is deleted." Shown once: the screen takes it, and it is gone. In memory only.
 */
let notice: string | null = null;

export function setSignedOutNotice(message: string | null): void {
  notice = message;
}

/** The message, once (then cleared). */
export function takeSignedOutNotice(): string | null {
  const message = notice;
  notice = null;
  return message;
}
