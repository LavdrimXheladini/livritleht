import { notFound } from 'next/navigation';

import { isLocale } from '@movershub/i18n';

import { UiKit } from './ui-kit';

// Internal component gallery for design review. Never available in production.
export default async function UiKitPage({ params }: PageProps<'/[lang]/dev/ui-kit'>) {
  const { lang } = await params;
  if (process.env.NODE_ENV === 'production' || !isLocale(lang)) notFound();
  return <UiKit locale={lang} />;
}
