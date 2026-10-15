import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { DEFAULT_LOCALE, isLocale } from '@movershub/i18n';

import { PASSWORD_OWED_COOKIE, parseOwed } from '@/lib/auth/password-owed';
import { createClient } from '@/lib/supabase/server';

// Landing point for the link in Supabase auth emails — what the cloud project sends until it has its
// own email provider with the code templates (design/DECISIONS.md #29). A link signs in like a code,
// so it also ends with choosing a password: `?purpose=register|recovery` (set by the website when it
// asks for the email) becomes the password-owed cookie the account page checks.
// - Default templates ({{ .ConfirmationURL }}) redirect here with `?code=` (PKCE).
// - Custom templates can link here directly with `?token_hash=…&type=email`.
// Always redirects to a fixed path — never to a URL taken from the query (no open redirect).

const emailOtpType = z.enum(['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']);

export async function GET(request: NextRequest, { params }: RouteContext<'/[lang]/auth/confirm'>) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const query = request.nextUrl.searchParams;

  const code = query.get('code');
  const tokenHash = query.get('token_hash');
  const type = emailOtpType.safeParse(query.get('type'));

  const supabase = await createClient();
  let signedIn = false;
  if (code) {
    signedIn = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type.success) {
    signedIn = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data })).error;
  }

  // Either way to the sign-in page: signed in by the link, it asks for the password owed first.
  const target = new URL(`/${locale}/login`, request.nextUrl.origin);
  if (!signedIn) target.searchParams.set('error', 'link_invalid');
  const response = NextResponse.redirect(target);
  if (signedIn) {
    const purpose = parseOwed(query.get('purpose')) ?? (type.success && type.data === 'recovery' ? 'recovery' : 'register');
    response.cookies.set(PASSWORD_OWED_COOKIE, purpose, { path: '/', maxAge: 86_400, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
  }
  return response;
}
