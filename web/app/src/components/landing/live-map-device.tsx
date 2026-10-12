'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DarkPanel, LiveMapCard, VanIcon } from '@movershub/ui/web';

import { alongLine, compassPoint } from '@/lib/geo/line';
import { routeLabel, stopName } from '@/lib/route-label';
import { cn } from '@/lib/utils';

import { useLandingState } from './landing-state';
import { RouteMap } from './route-map';

// Illustration shown until the real map has drawn (and kept if maps can't load): a stylised
// route in a 1200×520 box, same look as the design.
const SKETCH: readonly (readonly [number, number])[] = [
  [140, 420], [250, 395], [330, 310], [470, 290], [560, 210], [720, 195], [830, 140], [1000, 110],
];
const LOOP_MS = 50_000;

function sketchAlong(t: number) {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < SKETCH.length; i++) {
    const d = Math.hypot(SKETCH[i]![0] - SKETCH[i - 1]![0], SKETCH[i]![1] - SKETCH[i - 1]![1]);
    seg.push(d);
    total += d;
  }
  let goal = total * t;
  const done: [number, number][] = [[...SKETCH[0]!]];
  for (let i = 1; i < SKETCH.length; i++) {
    const [ax, ay] = SKETCH[i - 1]!;
    const [bx, by] = SKETCH[i]!;
    const d = seg[i - 1]!;
    if (goal <= d) {
      const f = d ? goal / d : 0;
      const p: [number, number] = [ax + (bx - ax) * f, ay + (by - ay) * f];
      done.push(p);
      return { p, done };
    }
    goal -= d;
    done.push([bx, by]);
  }
  return { p: [...SKETCH[SKETCH.length - 1]!] as [number, number], done };
}

const path = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function useProgress(): number {
  const [t, setT] = useState(0.62);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now() - 0.18 * LOOP_MS;
    let last = 0;
    const tick = (now: number) => {
      // ~12 fps is plenty for a slow-moving van and keeps the main thread quiet.
      if (now - last > 80) {
        setT(((now - start) % LOOP_MS) / LOOP_MS);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return t;
}

/** Hero "live tracking" device; `dashboardHref` links to the full "Live moves" dashboard. */
export function LiveMapDevice({ dashboardHref }: { dashboardHref?: string }) {
  const { t: tr } = useTranslation();
  // Mirrors the quote built above (addresses, road route, vehicle class).
  const { pickup, dropoff, cls, route: sample } = useLandingState();
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const t = useProgress();

  const geo = alongLine(sample.geometry, t);
  const sketch = sketchAlong(t);
  const leftKm = Math.max(1, Math.round(sample.km * (1 - t)));
  const etaTotalMin = Math.max(1, Math.round(((sample.km * (1 - t)) / 70) * 60));
  const eta =
    etaTotalMin < 60
      ? `${etaTotalMin} ${tr('landing.map.min')}`
      : `${Math.floor(etaTotalMin / 60)} h ${etaTotalMin % 60} ${tr('landing.map.min')}`;
  const speed = Math.round(62 + 18 * Math.sin(t * 40));
  const showSketch = mapState !== 'ready';

  return (
    <DarkPanel variant="frame" className="@container relative mx-auto max-w-[1300px]">
      <div className="relative h-[clamp(420px,46vw,560px)] overflow-hidden rounded-card bg-night-700">
        {/* Stylised placeholder / fallback */}
        <div aria-hidden="true" className={cn('absolute inset-0 transition-opacity duration-700', !showSketch && 'opacity-0')}>
          <svg viewBox="0 0 1200 520" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <g className="stroke-night-600" strokeWidth="10" fill="none">
              <path vectorEffect="non-scaling-stroke" d="M0 470 C200 440 300 400 420 350 S700 300 1200 260" />
              <path vectorEffect="non-scaling-stroke" d="M0 120 C180 140 380 180 520 160 S900 60 1200 40" />
              <path vectorEffect="non-scaling-stroke" d="M300 0 C320 140 360 300 330 520" />
              <path vectorEffect="non-scaling-stroke" d="M760 0 C720 160 740 340 800 520" />
            </g>
            <g className="stroke-night-600/60" strokeWidth="2" fill="none">
              {[
                'M0 60 L1200 140', 'M0 220 L1200 180', 'M0 300 L1200 360', 'M0 390 L1200 420', 'M100 0 L60 520',
                'M200 0 L240 520', 'M460 0 L500 520', 'M590 0 L560 520', 'M900 0 L930 520', 'M1040 0 L1000 520',
                'M640 0 L1200 330', 'M0 520 L560 0', 'M120 330 L420 240 L620 300 L1150 240',
              ].map((d) => (
                <path key={d} vectorEffect="non-scaling-stroke" d={d} />
              ))}
            </g>
            <path d={path(SKETCH)} className="stroke-brand-300" strokeWidth="4" fill="none" strokeDasharray="2 8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={path(sketch.done)} className="stroke-accent-500" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="absolute top-[80.7%] left-[11.6%] size-3.5 -translate-1/2 rounded-full border-3 border-night-700 bg-stone-50" />
          <div className="absolute top-[21%] left-[83.3%] flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1">
            <span className="rounded-sm bg-stone-50 px-2.5 py-1.25 text-xs font-semibold whitespace-nowrap text-ink-900">
              {tr('landing.map.dropoff', { place: stopName(dropoff, pickup) })}
            </span>
            <svg width="18" height="22" viewBox="0 0 18 22">
              <path d="M9 21s7-7 7-12A7 7 0 0 0 2 9c0 5 7 12 7 12Z" className="fill-stone-50" />
              <circle cx="9" cy="9" r="2.5" className="fill-night-700" />
            </svg>
          </div>
          <span
            className="absolute flex size-8.5 -translate-1/2 items-center justify-center rounded-full bg-accent-500 text-ink-900 motion-safe:animate-pulse-ring"
            style={{ left: `${((sketch.p[0] / 1200) * 100).toFixed(2)}%`, top: `${((sketch.p[1] / 520) * 100).toFixed(2)}%` }}
          >
            <VanIcon size={18} strokeWidth={2.2} />
          </span>
        </div>

        {/* Real map (OpenStreetMap tiles), drawn on top once loaded */}
        {mapState !== 'failed' ? (
          <div className={cn('absolute inset-0 transition-opacity duration-700', showSketch && 'opacity-0')}>
            <RouteMap
              geometry={sample.geometry}
              van={geo.point}
              done={geo.done}
              dropoffLabel={tr('landing.map.dropoff', { place: stopName(dropoff, pickup) })}
              onReady={() => setMapState('ready')}
              onFail={() => setMapState('failed')}
            />
          </div>
        ) : null}

        <LiveMapCard
          className="absolute top-5 left-5"
          title={tr('landing.map.company')}
          status={tr('landing.map.status')}
          subtitle={tr('landing.map.subtitle', { vehicle: tr(`vehicles.${cls}.name`) })}
          avatar="EM"
          route={routeLabel(pickup, dropoff, (city) => tr('landing.quote.withinCity', { city }))}
          progress={t}
          progressLabel={tr('landing.map.progress')}
          stats={[
            { label: tr('landing.map.speed'), value: speed, unit: tr('landing.map.kmh') },
            { label: tr('landing.map.left'), value: leftKm, unit: tr('landing.map.km') },
            { label: tr('landing.map.eta'), value: eta },
          ]}
        />

        {/* compass */}
        <div
          aria-hidden="true"
          className="absolute top-5 right-5 hidden size-19 items-center justify-center rounded-full border border-brand-300 bg-night-900 sm:flex"
        >
          <div className="flex size-14 items-center justify-center rounded-full border-4 border-night-600 text-[13px] font-bold text-stone-50">
            {compassPoint(geo.bearing)}
          </div>
        </div>

      </div>

      {/* Below the map on narrow screens (the map's licence credit wraps there); over the map's bottom
          edge when wide, left of the credit (~360px, bottom-right). */}
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-2 pt-2.5 pb-1 text-xs text-sage-400 @3xl:pointer-events-none @3xl:absolute @3xl:right-100 @3xl:bottom-7 @3xl:left-8 @3xl:z-10 @3xl:p-0">
        <span>{tr('landing.map.footer')}</span>
        {dashboardHref ? (
          <a href={dashboardHref} className="pointer-events-auto text-accent-300 no-underline hover:text-accent-200">
            {tr('landing.map.dashboard')}
          </a>
        ) : null}
      </div>
    </DarkPanel>
  );
}
