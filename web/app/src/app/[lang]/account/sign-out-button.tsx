'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@movershub/shared';

import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace(`/${locale}`);
        router.refresh();
      }}
      className="self-start rounded-md border border-ink-300 px-4 py-2 font-medium text-ink-700 hover:bg-ink-50"
    >
      {t('common.signOut')}
    </button>
  );
}
