import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { DEFAULT_LOCALE, isLocale } from '@movershub/i18n';

import { createClient } from '@/lib/supabase/server';

// Landing point for the sign-in link in Supabase auth emails.
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

  const target = new URL(signedIn ? `/${locale}/account` : `/${locale}/login`, request.nextUrl.origin);
  if (!signedIn) target.searchParams.set('error', 'link_invalid');
  return NextResponse.redirect(target);
}
