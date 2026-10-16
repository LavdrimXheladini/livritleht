import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_LOCALE, isLocale } from '@movershub/i18n';
import { exportFileName } from '@movershub/shared';

import { callAccount } from '@/lib/account/call';

/**
 * "Download my data" (COMPLIANCE §9): everything MoversHub keeps about the signed-in account, as a JSON
 * file. Signed out: the sign-in page. A failure: back to the account page, which says so.
 */
export async function GET(request: NextRequest, { params }: RouteContext<'/[lang]/account/export'>) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const answer = await callAccount({ action: 'export' }).catch(() => undefined);
  if (answer === null) return NextResponse.redirect(new URL(`/${locale}/login`, request.nextUrl.origin));
  if (!answer?.ok) return NextResponse.redirect(new URL(`/${locale}/account?error=export`, request.nextUrl.origin));
  return new NextResponse(await answer.text(), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(new Date())}"`,
      // Personal data: never kept by a shared cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
