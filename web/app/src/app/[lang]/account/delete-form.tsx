'use client';

import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@movershub/ui/web';

import { deleteAccount, type DeleteResult } from './actions';

/** "Delete my account": what goes, the password typed again, and why not when it can't (COMPLIANCE §9). */
export function DeleteAccountForm({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<DeleteResult, FormData>(deleteAccount, null);
  const error = state?.error;
  const message =
    error === 'password_required'
      ? t('auth.errors.password_required')
      : error === 'wrong_password'
        ? t('account.wrongPassword')
        : error === 'records_kept'
          ? t('account.recordsKept')
          : error === 'admins_only_by_platform'
            ? t('account.adminNo')
            : error
              ? t('common.errorGeneric')
              : null;
  return (
    <form action={action} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="lang" value={lang} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-600">{t('auth.passwordLabel')}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(message)}
          aria-describedby="delete-hint"
          className="min-h-12 rounded-input border border-stone-300 bg-stone-50 px-4 text-base text-ink-900 outline-none focus:border-brand-500"
        />
        <span id="delete-hint" className="text-[13px] text-ink-600">
          {t('account.deleteHint')}
        </span>
      </label>
      {message ? (
        <p role="alert" data-testid="delete-error" className="m-0 text-sm text-danger">
          {message}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" className="self-start" disabled={pending}>
        {pending ? t('common.loading') : t('account.deleteButton')}
      </Button>
    </form>
  );
}
