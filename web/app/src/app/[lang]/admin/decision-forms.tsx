'use client';

import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { answerAppeal, lift, suspend, type DecisionResult } from './actions';

const textarea = 'rounded-input border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-ink-900';
const primary = 'rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-stone-50 disabled:opacity-60';
const danger = 'rounded-full bg-danger px-4 py-2 text-sm font-medium text-stone-50 disabled:opacity-60';
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
 * Suspend the mover, or end their account (COMPLIANCE §3): the reasons go to the mover as written. A
 * suspension applies now; an account ends 30 days after this notice — now only for a serious violation.
 */
export function SuspendForm({ lang, companyId }: { lang: string; companyId: string }) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<DecisionResult | null, FormData>(suspend, null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'suspension' | 'termination'>('suspension');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="decide-open" className={`${outline} self-start`}>
        {t('decide.open')}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="decide-form">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="companyId" value={companyId} />
      <fieldset className="flex flex-col gap-1 text-sm text-ink-900">
        <legend className="mb-1 text-ink-600">{t('decide.kind')}</legend>
        {(['suspension', 'termination'] as const).map((k) => (
          <label key={k} className="flex items-start gap-2">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} data-testid={`decide-kind-${k}`} className="mt-1" />
            <span>
              {t(`decide.kinds.${k}`)} <span className="text-ink-600">— {t(`decide.when.${k}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === 'termination' ? (
        <label className="flex items-start gap-2 text-sm text-ink-900">
          <input type="checkbox" name="serious" data-testid="decide-serious" className="mt-1" />
          <span>{t('decide.serious')}</span>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('decide.reason')}
        <textarea name="reason" required minLength={10} maxLength={4000} rows={4} data-testid="decide-reason" className={textarea} />
      </label>
      <p className="text-sm text-ink-600">{t('decide.reviewed')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} data-testid="decide-send" className={danger}>
          {t(`decide.send.${kind}`)}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-sm text-ink-700 underline">
          {t('cancel')}
        </button>
      </div>
      <Problem state={state} />
    </form>
  );
}

/** Lift a decision now, with a note for the record. */
export function LiftForm({ lang, companyId, suspensionId }: { lang: string; companyId: string; suspensionId: string }) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<DecisionResult | null, FormData>(lift, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid={`lift-open-${suspensionId}`} className={`${outline} self-start`}>
        {t('lift.open')}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="suspensionId" value={suspensionId} />
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('lift.note')}
        <textarea name="note" required minLength={3} maxLength={1000} rows={2} data-testid={`lift-note-${suspensionId}`} className={textarea} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} data-testid={`lift-send-${suspensionId}`} className={primary}>
          {t('lift.send')}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-sm text-ink-700 underline">
          {t('cancel')}
        </button>
      </div>
      <Problem state={state} />
    </form>
  );
}

/**
 * Answer an appeal or a complaint with the reasons the mover reads. Upholding an appeal lifts its
 * decision; for a complaint, the two buttons say whether MoversHub agrees.
 */
export function AnswerForm({ lang, companyId, appealId, complaint }: { lang: string; companyId: string; appealId: string; complaint: boolean }) {
  const { t } = useTranslation('admin');
  const [state, action, pending] = useActionState<DecisionResult | null, FormData>(answerAppeal, null);
  const hidden = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="appealId" value={appealId} />
    </>
  );
  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`answer-${appealId}`}>
      {hidden}
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('answer.reason')}
        <textarea name="reason" required minLength={10} maxLength={4000} rows={3} data-testid={`answer-reason-${appealId}`} className={textarea} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="upheld" value="true" disabled={pending} data-testid={`answer-uphold-${appealId}`} className={primary}>
          {complaint ? t('answer.agree') : t('answer.uphold')}
        </button>
        <button type="submit" name="upheld" value="false" disabled={pending} data-testid={`answer-reject-${appealId}`} className={outline}>
          {complaint ? t('answer.disagree') : t('answer.reject')}
        </button>
      </div>
      <Problem state={state} />
    </form>
  );
}
