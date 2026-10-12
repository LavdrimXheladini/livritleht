import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { isLocale, resolveLocale } from '@movershub/shared';

import { supabaseKey, supabaseUrl } from './lib/supabase/env';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Every page lives under /[lang]. Redirect bare paths to the browser's language.
  const firstSegment = pathname.split('/')[1] ?? '';
  if (!isLocale(firstSegment)) {
    const preferred = request.headers.get('accept-language')?.split(',')[0];
    const url = request.nextUrl.clone();
    url.pathname = `/${resolveLocale(preferred)}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // 2. Refresh the Supabase session cookie so Server Components see a valid token.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Skip Next internals, API routes and files with an extension (favicon, images…).
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
