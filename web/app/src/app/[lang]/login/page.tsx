import { notFound } from 'next/navigation';

import { isLocale } from '@movershub/i18n';

import { LoginForm } from './login-form';

export default async function LoginPage({ params }: PageProps<'/[lang]/login'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <LoginForm locale={lang} />
    </main>
  );
}
