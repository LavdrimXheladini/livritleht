'use client';

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { VEHICLE_CLASSES, formatMoney, formatNumber, type Locale, type VehicleClass } from '@ranktrip/shared';
import { Card, ChipGroup } from '@ranktrip/ui/web';

import { demoPlace } from '@/lib/geo/types';
import type { Corridor, ExampleCurves } from '@/lib/landing-types';

import { useLandingState } from './landing-state';

// Chart box (viewBox 1000×340). Y axis: €0…€1,500.
const X = (km: number, maxKm: number) => 40 + (km / maxKm) * 950;
const Y_MAX_CENTS = 150_000;
const Y = (cents: number) => Math.max(14, 300 - (cents / Y_MAX_CENTS) * 280);

/**
 * Vehicle name inside the sentence: lowercase mid-sentence ("A large van for…"), but keep the
 * capital when the translation starts with it (pl, sr) and always in German (nouns are capitalised).
 */
const inSentence = (name: string, locale: Locale, sentence: string) =>
  locale === 'de' || sentence.startsWith('<veh>') ? name : name.toLocaleLowerCase(locale);

/**
 * "Know the price" chart. Renders the EXAMPLE curves computed on the server
 * (lib/landing-example.ts) — the browser only looks values up, it never prices anything.
 */
export function PricingChart({
  locale,
  curves,
  stepKm,
  maxKm,
  corridors,
}: {
  locale: Locale;
  curves: ExampleCurves;
  stepKm: number;
  maxKm: number;
  corridors: readonly Corridor[];
}) {
  const { t } = useTranslation();
  // Class and route are shared with the quote widget (design: one selection drives everything).
  const { cls, setCls, setPlaces, route } = useLandingState();
  const snap = (d: number) => Math.min(maxKm, Math.max(stepKm, Math.round(d / stepKm) * stepKm));
  const [km, setKm] = useState(snap(route.km));
  const [corridor, setCorridor] = useState<string>('');
  // Follow the quote's distance whenever a new route comes back from the server.
  const [routeShown, setRouteShown] = useState(route);
  if (route !== routeShown) {
    setRouteShown(route);
    setKm(snap(route.km));
  }
  const keyOf = (c: Corridor) => `${c.from}>${c.to}`;

  const at = (c: VehicleClass, d: number) => curves[c][Math.round(d / stepKm)] ?? 0;
  const priceCents = at(cls, km);
  const fmt = (cents: number) => formatMoney(cents, 'EUR', locale, { wholeUnits: true });

  const line = (c: VehicleClass) => {
    const pts: string[] = [];
    for (let d = 0; d <= maxKm; d += 40) pts.push(`${d ? 'L' : 'M'}${X(d, maxKm).toFixed(1)} ${Y(at(c, d)).toFixed(1)}`);
    return pts.join(' ');
  };
  // Selected class drawn last so it sits on top.
  const order = [...VEHICLE_CLASSES.filter((c) => c !== cls), cls];
  const markerX = X(km, maxKm);
  const markerY = Y(priceCents);

  return (
    <>
      <Card variant="widget" className="mx-auto mt-13 max-w-[900px] rounded-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <p className="m-0 max-w-[520px] text-[clamp(20px,2.2vw,26px)] leading-[1.3] tracking-[-0.01em]">
            <Trans
              i18nKey="landing.pricing.sentence"
              values={{
                vehicle: inSentence(t(`vehicles.${cls}.name`), locale, t('landing.pricing.sentence')),
                km: formatNumber(km, locale),
                price: fmt(priceCents),
              }}
              components={{
                veh: <span className="font-semibold text-brand-500" />,
                price: <span className="rounded-sm bg-brand-500 px-1.5 text-stone-50" />,
              }}
            />
          </p>
          <ChipGroup
            ariaLabel={t('landing.pricing.classes')}
            value={cls}
            onChange={setCls}
            options={VEHICLE_CLASSES.map((c) => ({ value: c, label: t(`vehicles.${c}.short`) }))}
          />
        </div>

        <svg viewBox="0 0 1000 340" className="mt-7 block h-auto w-full" role="img" aria-label={t('landing.pricing.chart')}>
          <g className="stroke-stone-300" strokeWidth="1">
            {[40_000, 80_000, 120_000].map((c) => (
              <line key={c} x1="40" x2="990" y1={Y(c)} y2={Y(c)} />
            ))}
          </g>
          <line x1="40" x2="990" y1="300" y2="300" className="stroke-ink-300" />
          <g className="fill-ink-500 font-sans text-xs">
            {[0, 40_000, 80_000, 120_000].map((c) => (
              <text key={c} x="0" y={Y(c) + 4}>
                {formatMoney(c, 'EUR', locale, { compact: true })}
              </text>
            ))}
            {[0, 400, 800, 1200, 1600].map((d, i) => (
              <text key={d} x={i === 4 ? 940 : X(d, maxKm)} y="324">
                {i === 0 ? `0 km` : formatNumber(d, locale)}
              </text>
            ))}
          </g>
          {order.map((c) => (
            <path
              key={c}
              d={line(c)}
              fill="none"
              strokeLinecap="round"
              strokeWidth={c === cls ? 3 : 1.5}
              className={c === cls ? 'stroke-brand-500' : 'stroke-sage-500'}
            />
          ))}
          <line x1={markerX} x2={markerX} y1="20" y2="300" className="stroke-brand-500" strokeDasharray="3 5" />
          <circle cx={markerX} cy={markerY} r="14" className="fill-brand-500/15" />
          <circle cx={markerX} cy={markerY} r="6" className="fill-brand-500" />
        </svg>

        <label className="mt-4.5 flex items-center gap-4 text-[13px] text-ink-600">
          <span className="shrink-0">{t('landing.pricing.distance')}</span>
          <input
            type="range"
            min={stepKm}
            max={maxKm}
            step={stepKm}
            value={km}
            onChange={(e) => {
              setKm(Number(e.target.value));
              setCorridor('');
            }}
            className="min-h-11 flex-1 cursor-pointer accent-ink-900"
          />
          <span className="w-17.5 shrink-0 text-right font-semibold text-ink-900">{formatNumber(km, locale)} km</span>
        </label>
      </Card>

      <ChipGroup
        variant="tile"
        ariaLabel={t('landing.pricing.corridors')}
        value={corridor}
        onChange={(key) => {
          const c = corridors.find((x) => keyOf(x) === key);
          if (!c) return;
          setCorridor(key);
          setPlaces(demoPlace(c.from, t(`places.${c.from}`)), demoPlace(c.to, t(`places.${c.to}`)));
        }}
        options={corridors.map((c) => ({
          value: keyOf(c),
          label: `${t(`places.${c.from}`)} → ${t(`places.${c.to}`)}`,
        }))}
        className="mx-auto mt-7 max-w-[900px] justify-center"
      />
      <p className="mx-auto mt-3.5 mb-0 max-w-[640px] text-center text-xs text-ink-500">{t('landing.pricing.hint')}</p>
    </>
  );
}
