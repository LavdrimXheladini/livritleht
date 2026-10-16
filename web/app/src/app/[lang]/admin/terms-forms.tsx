'use client';

import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TermsAudience } from '@movershub/shared';

import { publishTerms, withdrawTerms, type DecisionResult } from './actions';

const field = 'rounded-input border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-ink-900';
const primary = 'rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-stone-50 disabled:opacity-60';
const outline = 'rounded-full border border-stone-400 px-4 py-2 text-sm font-medium text-ink-900 disabled:opacity-60';

function Problem({ state }: { state: DecisionResult | null }) {
  const { t } = useTranslation('admin');
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {t(`errors.${state.error}`, { defaultValue: t('errors.failed') })}
    </p>
  );
}

/**
 * Publish the text in the app as the next version (design/DECISIONS.md #34). `minDate`: the first day
 * it may apply from (movers: 15 days ahead once there is an earlier version); `first`: nothing
 * published yet (no "what changed" needed).
 */
export function PublishTermsForm({ lang, audience, minDate, first }: { lang: string; audience: TermsAudience; minDate: string; first: boolean }) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<DecisionResult | null, FormData>(publishTerms, null);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid={`publish-${audience}`}>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="audience" value={audience} />
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {audience === 'mover' ? t('terms.effectiveMover') : t('terms.effective')}
        <input type="date" name="effective" min={minDate} data-testid={`publish-${audience}-effective`} className={`${field} max-w-48`} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('terms.summary')}
        <textarea name="summary" required={!first} minLength={first ? undefined : 3} maxLength={2000} rows={3} data-testid={`publish-${audience}-summary`} className={field} />
      </label>
      <button type="submit" disabled={pending} data-testid={`publish-${audience}-send`} className={`${primary} self-start`}>
        {t('terms.publish')}
      </button>
      <Problem state={state} />
    </form>
  );
}

/** Withdraw a version that doesn't apply yet, with a note for the record. */
export function WithdrawTermsForm({ lang, versionId }: { lang: string; versionId: string }) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<DecisionResult | null, FormData>(withdrawTerms, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid={`withdraw-open-${versionId}`} className={`${outline} self-start`}>
        {t('terms.withdraw')}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="versionId" value={versionId} />
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('terms.withdrawNote')}
        <textarea name="note" required minLength={3} maxLength={1000} rows={2} data-testid={`withdraw-note-${versionId}`} className={field} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} data-testid={`withdraw-send-${versionId}`} className={primary}>
          {t('terms.withdrawSend')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-sm text-ink-700 underline">
          {t('cancel')}
        </button>
      </div>
      <Problem state={state} />
    </form>
  );
}
