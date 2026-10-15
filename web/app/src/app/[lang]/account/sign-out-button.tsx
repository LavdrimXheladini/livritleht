'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@movershub/shared';
import { Button } from '@movershub/ui/web';

import { settlePassword } from '@/lib/auth/password-owed';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      className="self-start"
      onClick={async () => {
        await createClient().auth.signOut();
        settlePassword();
        router.replace(`/${locale}`);
        router.refresh();
      }}
    >
      {t('common.signOut')}
    </Button>
  );
}
