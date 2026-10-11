'use client';

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { VEHICLE_CLASSES, VEHICLE_CLASS_INFO, formatMoney, formatNumber, type Locale } from '@ranktrip/shared';
import { Button, CrewPills, SwapIcon, VehicleClassTile, cardVariants } from '@ranktrip/ui/web';

import { cn } from '@/lib/utils';

import { AddressField } from './address-field';
import { useLandingState } from './landing-state';

/**
 * Hero quote widget (design: Main.dc.html). Addresses come from address search; the server
 * returns the road distance and SAMPLE prices (design/DECISIONS.md #4) — nothing is priced in the
 * browser. Later the server `quote` function returns "from €X" per class from real movers, then a
 * specific mover + fixed total before payment (COMPLIANCE §1.1).
 */
export function QuoteWidget({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const { pickup, dropoff, cls, crew, setPlaces, setCls, setCrew, route, pending, error } = useLandingState();
  const [submitted, setSubmitted] = useState(false);
  const money = (cents: number) => formatMoney(cents, 'EUR', locale, { wholeUnits: true });
  const crewIndex = crew - 1;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(cardVariants({ variant: 'widget' }), 'mx-auto flex max-w-[980px] flex-col gap-4.5')}
    >
      <div className="flex flex-wrap items-stretch gap-3">
        <AddressField
          name="pickup"
          label={t('landing.quote.pickup')}
          placeholder={t('landing.quote.addressPlaceholder')}
          value={pickup}
          near={dropoff}
          locale={locale}
          onSelect={(p) => {
            setPlaces(p, dropoff);
            setSubmitted(false);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('landing.quote.swap')}
          className="self-center"
          onClick={() => {
            setPlaces(dropoff, pickup);
            setSubmitted(false);
          }}
        >
          <SwapIcon size={18} />
        </Button>
        <AddressField
          name="dropoff"
          label={t('landing.quote.dropoff')}
          placeholder={t('landing.quote.addressPlaceholder')}
          value={dropoff}
          near={pickup}
          locale={locale}
          onSelect={(d) => {
            setPlaces(pickup, d);
            setSubmitted(false);
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="-mt-2 mb-0 text-[13px] text-danger">
          {error === 'same_place' ? t('landing.quote.samePlace') : t('landing.quote.routeError')}
        </p>
      ) : null}

      <fieldset
        aria-busy={pending}
        className={cn(
          'm-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 border-0 p-0 transition-opacity',
          pending && 'opacity-60',
        )}
      >
        <legend className="sr-only">{t('landing.quote.classes')}</legend>
        {VEHICLE_CLASSES.map((k) => (
          <VehicleClassTile
            key={k}
            name={t(`vehicles.${k}.name`)}
            capacity={VEHICLE_CLASS_INFO[k].capacity}
            example={VEHICLE_CLASS_INFO[k].examples}
            fits={t(`vehicles.${k}.fits`)}
            pricePrefix={t('landing.quote.from')}
            priceLabel={money(route.prices[k][crewIndex][0])}
            selected={cls === k}
            onClick={() => setCls(k)}
          />
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-300 pt-4.5">
        <CrewPills
          value={crew}
          onChange={setCrew}
          groupLabel={t('landing.quote.crew')}
          labels={{ 1: t('landing.quote.crew1'), 2: t('landing.quote.crew2'), 3: t('landing.quote.crew3') }}
        />
        <div className="flex flex-wrap items-center gap-4.5">
          <div className={cn('text-right transition-opacity', pending && 'opacity-60')} aria-live="polite">
            <div className="text-[12.5px] text-ink-600">
              {t('landing.quote.summary', {
                kind: route.crossBorder ? t('landing.quote.crossBorder') : t('landing.quote.domestic'),
                km: formatNumber(route.km, locale),
                hours: route.hours,
              })}
            </div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-[13px] text-ink-600">{t('landing.quote.from')}</span>
              <span className="type-display text-[34px] leading-[1.1]">{money(route.prices[cls][crewIndex][0])}</span>
            </div>
          </div>
          <Button type="submit" size="lg">
            {t('landing.quote.seeMovers')}
          </Button>
        </div>
      </div>

      {submitted ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3.5 rounded-input bg-brand-500 px-4.5 py-3.5 text-stone-50"
        >
          <div className="flex items-center gap-3">
            <span className="size-2.5 shrink-0 rounded-full bg-accent-500 motion-safe:animate-pulse-ring" />
            <span className="text-[14.5px]">
              <strong className="font-semibold">{t('landing.quote.soonTitle')}</strong> {t('landing.quote.soonText')}
            </span>
          </div>
          <a href="#join" className="py-2.5 text-[14.5px] font-medium text-accent-300 no-underline hover:text-accent-200">
            {t('landing.quote.soonLink')}
          </a>
        </div>
      ) : null}

      <p className="m-0 text-xs text-ink-500">{t('landing.quote.note')}</p>
    </form>
  );
}
