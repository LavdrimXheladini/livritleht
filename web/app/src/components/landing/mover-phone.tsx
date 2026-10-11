'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMoney, type Locale } from '@ranktrip/shared';
import { Button, CheckIcon, Pill } from '@ranktrip/ui/web';

import { routeLabel, stopName } from '@/lib/route-label';

import { useLandingState } from './landing-state';

/**
 * Mover app job request (design mockup) — mirrors the quote built in the hero widget.
 * COMPLIANCE: price from the mover's own card, "Payout" wording (§12), exact address only after
 * accepting (§9.1), declining has no consequence (§2). Sample numbers come from the server matrix.
 */
export function MoverPhone({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const { pickup, dropoff, cls, crew, route } = useLandingState();
  const [state, setState] = useState<'pending' | 'accepted' | 'declined'>('pending');
  // The cheapest offer in the chosen class — the mover's own price and their payout (§12 "Payout").
  const offer = route.prices[cls][crew - 1];
  const money = (c: number | undefined) => (c === undefined ? '—' : formatMoney(c, offer?.currency ?? 'EUR', locale, { wholeUnits: true }));
  // Only the city / neighbourhood before the mover accepts — never the street (COMPLIANCE §9.1).
  const routeText = routeLabel(pickup, dropoff, (city) => t('landing.quote.withinCity', { city }));

  return (
    <div className="mx-auto w-full max-w-[360px] flex-[0_1_360px]">
      <div className="mx-auto w-[330px] max-w-full rounded-phone bg-night-900 p-2.5 shadow-device">
        <div className="flex min-h-[600px] flex-col gap-3.5 rounded-[calc(var(--radius-phone)-8px)] bg-night-700 px-4.5 py-5.5 text-night-50">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-sage-400">{t('landing.movers.phone.app')}</span>
            <Pill tone="accent-soft" size="sm" className="px-2.25 py-1 text-[11px]">
              {t('landing.movers.phone.online')}
            </Pill>
          </div>

          {state === 'pending' ? (
            <>
              <div className="type-display text-2xl">{t('landing.movers.phone.newRequest')}</div>
              <div className="flex flex-col gap-3 rounded-card border border-night-500 bg-night-800 p-4">
                <div className="relative h-30 overflow-hidden rounded-input bg-night-800">
                  <svg viewBox="0 0 300 120" className="absolute inset-0 size-full" aria-hidden="true">
                    <path d="M0 90 L300 70 M60 0 L90 120 M200 0 L180 120 M0 30 L300 50" className="stroke-night-600" strokeWidth="6" />
                    <path d="M30 95 C90 80 110 40 170 45 S240 30 270 25" className="stroke-accent-500" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <circle cx="30" cy="95" r="6" className="fill-stone-50" />
                    <circle cx="270" cy="25" r="6" className="fill-accent-500" />
                  </svg>
                </div>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-semibold">{routeText}</span>
                  <span className="shrink-0 text-sage-400">{route.km} km</span>
                </div>
                <div className="-mt-1.5 text-[11.5px] text-sage-400">{t('landing.movers.phone.district')}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="dark" shape="tag">{t(`vehicles.${cls}.name`)}</Pill>
                  <Pill tone="dark" shape="tag">{t(`landing.movers.phone.crew${crew}`)}</Pill>
                  <Pill tone="dark" shape="tag">
                    {t(`landing.quote.${route.scope}`)}
                  </Pill>
                </div>
                <div className="flex items-end justify-between gap-3 border-t border-night-500 pt-3">
                  <div>
                    <div className="text-[11.5px] text-sage-400">{t('landing.movers.phone.payout')}</div>
                    <div className="type-display text-[30px] leading-tight text-accent-300">{money(offer?.payout)}</div>
                  </div>
                  <div className="text-right text-[11.5px] whitespace-pre-line text-sage-400">
                    {t('landing.movers.phone.breakdown', { price: money(offer?.moverPrice), pct: route.takeRatePct })}
                  </div>
                </div>
              </div>
              <div className="mt-auto flex gap-2.5">
                <Button variant="outline-dark" size="lg" className="min-w-0 flex-1 px-4 whitespace-normal" onClick={() => setState('declined')}>
                  {t('landing.movers.phone.decline')}
                </Button>
                <Button variant="accent" size="lg" className="min-w-0 flex-[1.4] px-4 whitespace-normal" onClick={() => setState('accepted')}>
                  {t('landing.movers.phone.accept')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div role="status" className="my-auto flex flex-col items-center gap-3.5 text-center">
                {state === 'accepted' ? (
                  <span className="flex size-18 items-center justify-center rounded-full bg-accent-500 text-ink-900">
                    <CheckIcon size={32} strokeWidth={2.5} />
                  </span>
                ) : null}
                <div className="type-display text-2xl">
                  {state === 'accepted' ? t('landing.movers.phone.acceptedTitle') : t('landing.movers.phone.declinedTitle')}
                </div>
                <div className="text-sm leading-normal text-sage-400">
                  {state === 'accepted'
                    ? t('landing.movers.phone.acceptedText', { place: stopName(pickup, dropoff) })
                    : t('landing.movers.phone.declinedText')}
                </div>
              </div>
              <Button variant="outline-dark" size="lg" onClick={() => setState('pending')}>
                {state === 'accepted' ? t('landing.movers.phone.back') : t('landing.movers.phone.showAgain')}
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="mt-3.5 mb-0 text-center text-xs text-ink-500">{t('landing.movers.phone.caption')}</p>
    </div>
  );
}
