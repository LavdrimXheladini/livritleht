'use client';

import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { review, type ReviewResult } from './actions';

/**
 * Approve, or ask for changes with a note for the mover — for a company, a document or a van that
 * waits for a check. Postgres has the last word (e.g. a company with something missing isn't approved).
 */
export function ReviewButtons({
  lang,
  kind,
  id,
  companyId,
  testId,
}: {
  lang: string;
  kind: 'company' | 'document' | 'vehicle';
  id: string;
  companyId: string;
  testId: string;
}) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<ReviewResult | null, FormData>(review, null);
  const [asking, setAsking] = useState(false);
  const hidden = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="companyId" value={companyId} />
    </>
  );

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {asking ? (
        <form action={action} className="flex flex-col gap-2">
          {hidden}
          <input type="hidden" name="verified" value="false" />
          <label className="flex flex-col gap-1 text-sm text-ink-600">
            {t('noteLabel')}
            <textarea
              name="note"
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              data-testid={`${testId}-note`}
              className="rounded-input border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-ink-900"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} data-testid={`${testId}-send`} className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-900 disabled:opacity-60">
              {t('sendNote')}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-full px-3 py-2 text-sm text-ink-700 underline">
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={action}>
            {hidden}
            <input type="hidden" name="verified" value="true" />
            <button type="submit" disabled={pending} data-testid={`${testId}-approve`} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-stone-50 disabled:opacity-60">
              {t('approve')}
            </button>
          </form>
          <button type="button" onClick={() => setAsking(true)} data-testid={`${testId}-ask`} className="rounded-full border border-stone-400 px-4 py-2 text-sm font-medium text-ink-900">
            {t('askForChanges')}
          </button>
        </div>
      )}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${state.error}`, { defaultValue: t('errors.failed') })}
          {state.missing?.length ? ` ${state.missing.map((m) => t(`missing.${m}`, { defaultValue: m })).join(', ')}.` : null}
        </p>
      ) : null}
    </div>
  );
}
