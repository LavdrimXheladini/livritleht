'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SelfSignupRole } from '@movershub/shared';
import { Button } from '@movershub/ui/web';

import { createClient } from '@/lib/supabase/client';

import { RoleRadios } from '../login/role-radios';

/** An account without a side yet chooses it (`public.choose_role`: customer or mover, never admin). */
export function RoleChooser() {
  const { t } = useTranslation();
  const router = useRouter();
  const [role, setRole] = useState<SelfSignupRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (role === null) {
          setError(t('auth.errors.choose_role'));
          return;
        }
        setBusy(true);
        const { error: failed } = await createClient().rpc('choose_role', { p_role: role });
        setBusy(false);
        if (failed) {
          setError(t('common.errorGeneric'));
          return;
        }
        router.refresh();
      }}
    >
      <RoleRadios
        value={role}
        onChange={(r) => {
          setRole(r);
          setError(null);
        }}
        error={error ?? undefined}
      />
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t('common.loading') : t('common.continue')}
      </Button>
    </form>
  );
}

/** "Switch to the mover side" / "…customer side" — as at the bottom of each home in the app. */
export function SwitchSide({ to }: { to: SelfSignupRole }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const { error } = await createClient().rpc('choose_role', { p_role: to });
          setBusy(false);
          setFailed(Boolean(error));
          if (!error) router.refresh();
        }}
      >
        {to === 'mover' ? t('customer.switchToMover') : t('mover.switchToCustomer')}
      </Button>
      {failed ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {t('common.errorGeneric')}
        </p>
      ) : null}
    </div>
  );
}
