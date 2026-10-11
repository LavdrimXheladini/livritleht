import type { Metadata } from 'next';
import { Archivo, Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';

import { LOCALES, isLocale } from '@ranktrip/i18n';

import { BackToTop } from '@/components/back-to-top';
import { I18nProvider } from '@/components/i18n-provider';
import { SmoothScroll } from '@/components/smooth-scroll';
import { getT } from '@/lib/i18n';

import './globals.css';

// Font families come from packages/ui/tokens.json (`fonts`); theme.css reads these CSS variables.
// latin-ext covers Albanian (ë, ç), Polish (ł, ż …), Serbian Latin (š, č, đ) and German (ß).
const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin', 'latin-ext'], axes: ['wdth'] });
const geist = Geist({ variable: '--font-geist', subsets: ['latin', 'latin-ext'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'latin-ext'] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: t('common.appName'), description: t('landing.hero.subtitle') };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html
      lang={lang}
      className={`${archivo.variable} ${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={lang}>
          {children}
          <SmoothScroll />
          <BackToTop />
        </I18nProvider>
      </body>
    </html>
  );
}
