'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@movershub/i18n';
import { formatMoney, formatNumber, formatTenths } from '@movershub/shared';
import { Button, CardIcon, DarkPanel, Gauge, LogoMark, Pill, ProgressBar, Timeline, VanIcon, WarningIcon } from '@movershub/ui/web';

import { alongLine, compassPoint } from '@/lib/geo/line';
import type { DemoItem, LiveJob } from '@/lib/live-demo-types';
import {
  advance,
  cargoSlots,
  etaMinutes,
  leftKm,
  simSpeedKmh,
  simStatus,
  timelineStates,
  vanLoad,
  type SimStatus,
} from '@/lib/live-sim';
import { cn } from '@/lib/utils';

import { LiveMovesMap } from './live-moves-map';

const TICK_MS = 100;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia('(prefers-reduced-motion: reduce)');
      q.addEventListener('change', onChange);
      return () => q.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** "Live moves" ops dashboard on simulated jobs (design: Tracking.dc.html; data: lib/live-demo.ts). */
export function LiveDashboard({ locale, jobs, homeHref }: { locale: Locale; jobs: readonly LiveJob[]; homeHref: string }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [sel, setSel] = useState(0);
  const [view, setView] = useState<'map' | 'load'>('map');
  /** null = automatic (runs unless the visitor prefers reduced motion). */
  const [playing, setPlaying] = useState<boolean | null>(null);
  const running = playing ?? !reducedMotion;
  const [ts, setTs] = useState(() => jobs.map((j) => j.startT));
  const [item, setItem] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  const [note, setNote] = useState<'call' | 'shared' | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTs((prev) => prev.map((t0, i) => advance(t0, jobs[i]!.ratePerS, TICK_MS / 1000)));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, jobs]);

  // Stable between ticks: the map refits its view only when the selection or the jobs change.
  const mapJobs = useMemo(
    () => jobs.map((j) => ({ geometry: j.geometry, vanLabel: t('dashboard.job.focus', { id: j.id, from: j.from, to: j.to }) })),
    [jobs, t],
  );
  const positions = useMemo(() => jobs.map((j, i) => alongLine(j.geometry, ts[i]!)), [jobs, ts]);

  const job = jobs[sel]!;
  const t0 = ts[sel]!;
  const status = simStatus(t0);
  const load = vanLoad(job);
  const volume = t('dashboard.job.volume', { used: formatTenths(load.usedTenths, locale), cap: formatNumber(job.capacityM3, locale) });
  const company = t(`dashboard.companies.${job.company}`);
  const vehicle = t(`vehicles.${job.vehicleClass}.name`);
  const left = leftKm(job, t0);
  const eta = formatEta(etaMinutes(job, t0), t);
  const totalCents = jobs.reduce((sum, j) => sum + j.moverPriceCents, 0);

  const select = (i: number) => {
    setSel(i);
    setItem(0);
    setNote(null);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard can be blocked (permissions, http); the note below still explains the demo.
    }
    setNote('shared');
  };

  const stepStates = timelineStates(t0);
  const steps = [
    { label: t('dashboard.timeline.booked'), sub: t('dashboard.timeline.cardSaved') },
    { label: t('dashboard.timeline.accepted'), sub: company },
    { label: t('dashboard.timeline.pickedUp'), sub: job.from },
    { label: t('dashboard.timeline.onTheWay'), sub: t('dashboard.job.left', { km: formatNumber(left, locale) }) },
    { label: t('dashboard.timeline.delivered'), sub: job.to },
  ].map((s, i) => ({ ...s, state: stepStates[i]! }));

  return (
    <div className="min-h-full flex-1 bg-night-950 p-3 font-sans text-night-50 sm:p-5">
      <div className="mx-auto flex max-w-350 flex-col gap-3.5 rounded-[28px] border border-night-600 bg-night-900 p-3.5 lg:flex-row">
        <Rail homeHref={homeHref} />

        <main className="flex min-w-0 flex-1 flex-col gap-3.5">
          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <ul aria-label={t('dashboard.stats.label')} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              <StatPill label={t('dashboard.stats.live')} value={formatNumber(jobs.length, locale)} />
              <StatPill label={t('dashboard.stats.online')} value={formatNumber(new Set(jobs.map((j) => j.company)).size, locale)} />
              <StatPill label={t('dashboard.stats.gmv')} value={formatMoney(totalCents, 'EUR', locale, { wholeUnits: true })} />
              <li>
                <span className="inline-flex rounded-full border border-accent-800 bg-accent-900 px-2.5 py-1.5 text-xs text-accent-300">
                  {t('dashboard.stats.simulated')}
                </span>
              </li>
            </ul>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPlaying(!running)}
                aria-pressed={!running}
                className="press flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-night-600 bg-night-800 px-3.5 text-[13px] text-night-50 hover:border-night-400"
              >
                {running ? <PauseIcon /> : <PlayIcon />}
                {running ? t('dashboard.pause') : t('dashboard.play')}
              </button>
              <div className="flex items-center gap-2 rounded-full border border-night-600 bg-night-800 py-1 pr-3 pl-1">
                <span aria-hidden="true" className="flex size-7.5 items-center justify-center rounded-full bg-night-600 text-xs font-semibold">
                  OP
                </span>
                <span className="text-[12.5px]">{t('dashboard.ops')}</span>
              </div>
            </div>
          </div>

          {/* Title + view toggle */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="m-0 font-display text-[28px] leading-none font-semibold tracking-[-0.035em]">{t('dashboard.title')}</h1>
              <p className="m-0 mt-1.5 text-[12.5px] text-sage-400">{t('dashboard.subtitle')}</p>
            </div>
            <div role="group" aria-label={t('dashboard.views.label')} className="flex gap-1 rounded-full border border-night-600 bg-night-800 p-1">
              {(['map', 'load'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'min-h-9 cursor-pointer rounded-full border-0 px-4 text-[13px]',
                    view === v ? 'bg-night-50 text-ink-900' : 'bg-transparent text-sage-400 hover:text-night-50',
                  )}
                >
                  {t(`dashboard.views.${v}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3.5">
            {/* Map / van load panel */}
            <section
              aria-label={t(`dashboard.views.${view}`)}
              className="@container relative min-h-150 min-w-0 flex-[999_1_520px] overflow-hidden rounded-panel border border-night-600 bg-night-800"
            >
              {/* Stays mounted under the van-load view so the map keeps its tiles and position. */}
              <div className="absolute inset-0 bg-night-700" inert={view !== 'map'}>
                {mapFailed ? (
                  <p className="m-0 flex size-full items-center justify-center p-10 text-center text-sm text-sage-400">
                    {t('dashboard.map.unavailable')}
                  </p>
                ) : (
                  <LiveMovesMap
                    jobs={mapJobs}
                    positions={positions}
                    selected={sel}
                    onSelect={select}
                    onFail={() => setMapFailed(true)}
                    labels={{
                      zoomIn: t('dashboard.map.zoomIn'),
                      zoomOut: t('dashboard.map.zoomOut'),
                      gestureWindows: t('dashboard.map.gestureWindows'),
                      gestureMac: t('dashboard.map.gestureMac'),
                      gestureMobile: t('dashboard.map.gestureMobile'),
                    }}
                  />
                )}

                {/* Floating job card */}
                <DarkPanel variant="overlay" className="absolute top-4 left-4 z-10 flex w-[min(340px,calc(100%-32px))] flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9.5 shrink-0 items-center justify-center rounded-md bg-night-600 text-accent-500">
                      <VanIcon size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{job.id}</span>
                        <StatusPill status={status} />
                      </div>
                      <div className="truncate text-xs text-sage-400">{t('dashboard.job.subtitle', { vehicle, company })}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between gap-2 text-[12.5px]">
                      <span>{t('dashboard.job.route', { from: job.from, to: job.to })}</span>
                      <span className="font-mono whitespace-nowrap">
                        {formatNumber(job.km, locale)} {t('dashboard.job.km')}
                      </span>
                    </div>
                    <ProgressBar value={t0} label={t('dashboard.job.progress')} tone="gradient" size="md" className="mt-2" />
                    <div className="mt-1.5 flex justify-between text-[11.5px] text-sage-400">
                      <span>{t('dashboard.job.eta', { time: eta })}</span>
                      <span>{t('dashboard.job.left', { km: formatNumber(left, locale) })}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Gauge kind="arc" value={simSpeedKmh(job, t0)} max={130} label={t('dashboard.job.speed')} unit={t('dashboard.job.kmh')} />
                    <Gauge kind="tank" percent={load.percent} label={t('dashboard.job.load')} caption={volume} />
                  </div>
                  {job.crossBorder ? (
                    <div className="flex items-center gap-2 rounded-md border border-accent-800 bg-accent-900 px-2.75 py-2.25 text-xs text-accent-300">
                      <WarningIcon size={14} className="shrink-0" />
                      {t(job.customsNotice ? 'dashboard.job.crossBorderCustoms' : 'dashboard.job.crossBorder', { pct: job.takeRatePct })}
                    </div>
                  ) : null}
                </DarkPanel>

                {/* Compass */}
                <div
                  role="img"
                  aria-label={t('dashboard.map.heading', { dir: compassPoint(positions[sel]!.bearing) })}
                  className="absolute top-4 right-4 z-10 hidden size-21 items-center justify-center rounded-full border border-night-600 bg-night-700 sm:flex"
                >
                  <div className="flex size-15.5 items-center justify-center rounded-full border-5 border-night-600 text-sm font-bold">
                    {compassPoint(positions[sel]!.bearing)}
                  </div>
                </div>

                {/* Above the map credit (bottom-right; two lines on phones) until the panel is wide enough for both on one line. */}
                <p className="pointer-events-none absolute bottom-17 left-4 z-10 m-0 text-[11.5px] text-night-300 @md:bottom-11 @3xl:bottom-3.5">
                  {t('dashboard.map.hint')}
                </p>
              </div>

              {view === 'load' ? (
                <VanLoad job={job} vehicle={vehicle} volume={volume} item={item} onItem={setItem} />
              ) : null}
            </section>

            {/* Side panel */}
            <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
              <DarkPanel className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1 pt-0.5 pb-1.5">
                  <h2 className="m-0 text-sm font-semibold">{t('dashboard.jobs.title')}</h2>
                  <span className="text-[11.5px] text-sage-400">
                    {t('dashboard.jobs.count', { shown: formatNumber(jobs.length, locale), total: formatNumber(jobs.length, locale) })}
                  </span>
                </div>
                {jobs.map((j, i) => (
                  <button
                    key={j.id}
                    type="button"
                    aria-pressed={i === sel}
                    onClick={() => select(i)}
                    className={cn(
                      'flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-[14px] border p-3 text-left text-night-50 transition-colors',
                      i === sel ? 'border-accent-500 bg-night-700' : 'border-night-600 bg-night-800 hover:border-night-400',
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="font-mono text-[12.5px]">{j.id}</span>
                      <StatusPill status={simStatus(ts[i]!)} />
                    </span>
                    <span className="text-[13.5px] font-medium">{t('dashboard.job.route', { from: j.from, to: j.to })}</span>
                    <span className="flex w-full justify-between gap-2 text-[11.5px] text-sage-400">
                      <span className="truncate">
                        {t('dashboard.job.subtitle', { vehicle: t(`vehicles.${j.vehicleClass}.name`), company: t(`dashboard.companies.${j.company}`) })}
                      </span>
                      <span className="whitespace-nowrap">{formatMoney(j.moverPriceCents, j.currency, locale, { wholeUnits: true })}</span>
                    </span>
                    <ProgressBar value={ts[i]!} label={t('dashboard.job.progress')} size="xs" />
                  </button>
                ))}
              </DarkPanel>

              <DarkPanel className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-1.5">
                  <h2 className="m-0 text-sm font-semibold">{t('dashboard.items.title', { n: formatNumber(job.items.length, locale) })}</h2>
                  <span className="text-[11.5px] text-sage-400">{volume}</span>
                </div>
                {job.items.map((it, k) => (
                  <ItemRow key={`${job.id}-${k}`} it={it} code={itemCode(k)} open={item === k} onPick={() => setItem(k)} locale={locale} />
                ))}
                {/* Side by side when both labels fit (en), stacked otherwise (de "Umzugsunternehmen anrufen"). */}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button variant="outline-dark" size="sm" className="min-h-11 grow basis-auto" onClick={() => setNote('call')}>
                    {t('dashboard.actions.call')}
                  </Button>
                  <Button variant="accent" size="sm" className="min-h-11 grow basis-auto" onClick={() => void share()}>
                    {note === 'shared' ? t('dashboard.actions.copied') : t('dashboard.actions.share')}
                  </Button>
                </div>
                <p aria-live="polite" className="m-0 min-h-4 px-1 text-[11.5px] text-sage-400">
                  {note === 'call' ? t('dashboard.actions.callNote') : note === 'shared' ? t('dashboard.actions.shareNote') : ''}
                </p>
              </DarkPanel>
            </aside>
          </div>

          <Timeline steps={steps} label={t('dashboard.timeline.label')} />
          <p className="m-0 px-1 text-[11.5px] text-night-300">{t('dashboard.note')}</p>
        </main>
      </div>
    </div>
  );
}

const itemCode = (k: number) => `IT-${String(k + 1).padStart(2, '0')}`;

/** Just the two texts it needs: the full typed `t` makes TypeScript give up ("excessively deep"). */
type EtaT = (key: 'dashboard.job.min' | 'dashboard.job.hm', options: Record<string, number>) => string;

function formatEta(min: number, t: EtaT) {
  return min < 60 ? t('dashboard.job.min', { m: min }) : t('dashboard.job.hm', { h: Math.floor(min / 60), m: min % 60 });
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-full border border-night-600 bg-night-800 px-2.5 py-1.5 text-xs">
      {label} <b className="font-semibold text-stone-50">{value}</b>
    </li>
  );
}

function StatusPill({ status }: { status: SimStatus }) {
  const { t } = useTranslation();
  return (
    <Pill tone={status === 'onTheWay' ? 'accent' : 'dark-muted'} size="sm">
      {t(`dashboard.status.${status}`)}
    </Pill>
  );
}

function ItemRow({ it, code, open, onPick, locale }: { it: DemoItem; code: string; open: boolean; onPick: () => void; locale: Locale }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onPick}
      className={cn(
        'flex min-h-11 cursor-pointer flex-col rounded-input border px-3 py-2.75 text-left text-night-50 transition-colors',
        open ? 'border-night-400 bg-night-700' : 'border-transparent bg-transparent hover:border-night-500',
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[13px] font-medium">{itemName(it, t)}</span>
        <span className="font-mono text-[11px] text-sage-400">{code}</span>
      </span>
      {open ? (
        <>
          <span className="mt-2 grid w-full grid-cols-3 gap-2 text-[11.5px] text-sage-400">
            <Detail label={t('dashboard.items.size')}>{it.size === 'mixed' ? t('dashboard.items.mixed') : (it.size ?? '—')}</Detail>
            <Detail label={t('dashboard.items.volume')}>{formatTenths(it.volumeTenthsM3, locale)} m³</Detail>
            <Detail label={t('dashboard.items.room')}>{it.room ? t(`dashboard.rooms.${it.room}`) : '—'}</Detail>
          </span>
          {it.fragile ? (
            <span className="mt-2 block w-full rounded-sm border border-night-400 bg-night-700 px-2.25 py-1.75 text-[11.5px] text-sage-300">
              {t('dashboard.items.fragileNote')}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span>
      {label}
      <br />
      <b className="font-medium text-night-50">{children}</b>
    </span>
  );
}

/** Only the item names: with the full typed `t` the template key makes TypeScript give up ("excessively deep"). */
type ItemNameT = (key: `dashboard.itemNames.${DemoItem['key']}`) => string;

function itemName(it: DemoItem, t: ItemNameT): string {
  const name = t(`dashboard.itemNames.${it.key}`);
  return it.count ? `${name} ×${it.count}` : name;
}

function VanLoad({
  job,
  vehicle,
  volume,
  item,
  onItem,
}: {
  job: LiveJob;
  vehicle: string;
  volume: string;
  item: number;
  onItem: (k: number) => void;
}) {
  const { t } = useTranslation();
  const slots = cargoSlots(job);
  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-4 overflow-auto bg-night-800 p-5.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="m-0 text-[15px] font-semibold">{t('dashboard.load.title', { vehicle })}</h2>
          <p className="m-0 mt-0.5 text-xs text-sage-400">{t('dashboard.load.subtitle', { volume })}</p>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0 text-[11.5px] text-sage-400">
          <Legend className="bg-accent-500">{t('dashboard.load.selected')}</Legend>
          <Legend className="bg-sage-500">{t('dashboard.load.fragile')}</Legend>
          <Legend className="bg-brand-300">{t('dashboard.load.item')}</Legend>
        </ul>
      </div>
      {/* Side view of the van: cargo grid + cab */}
      <div className="flex min-w-150 items-end">
        <div className="flex-1 rounded-[14px_0_0_6px] border-2 border-r-0 border-brand-300 bg-night-800 p-2.5">
          <div className="grid grid-cols-6 grid-rows-[repeat(3,70px)] gap-1.5">
            {slots.map((slot, n) => {
              if (slot.item === null) {
                return (
                  <span
                    key={n}
                    className="flex flex-col justify-end rounded-sm border border-dashed border-brand-300 p-1.75 text-[11px] text-night-300"
                  >
                    {t('dashboard.load.free')}
                  </span>
                );
              }
              const it = job.items[slot.item]!;
              const on = slot.item === item;
              const first = n === 0 || slots[n - 1]!.item !== slot.item;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={itemName(it, t)}
                  aria-pressed={on}
                  // An item spanning several slots is one control for keyboard / screen reader users.
                  aria-hidden={first ? undefined : true}
                  tabIndex={first ? 0 : -1}
                  onClick={() => onItem(slot.item)}
                  className={cn(
                    'flex cursor-pointer flex-col items-start justify-between overflow-hidden rounded-sm border p-1.75 text-left',
                    on
                      ? 'border-accent-500 bg-accent-500 text-ink-900'
                      : it.fragile
                        ? 'border-sage-500/60 bg-brand-400 text-sage-300'
                        : 'border-night-500 bg-night-600 text-stone-400',
                  )}
                >
                  <span className="font-mono text-[10.5px]">{itemCode(slot.item)}</span>
                  {first ? <span className="text-[11px] leading-tight opacity-85">{itemName(it, t)}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div aria-hidden="true" className="relative h-42.5 w-27.5 rounded-[0_40px_10px_0] border-2 border-brand-300 bg-night-700">
          <div className="absolute top-4 right-3 h-11.5 w-13 rounded-[4px_26px_4px_4px] border-2 border-brand-300" />
        </div>
      </div>
      <div aria-hidden="true" className="-mt-3.5 flex min-w-150 gap-50 pl-15">
        <span className="size-11 rounded-full border-6 border-night-600 bg-night-700" />
        <span className="size-11 rounded-full border-6 border-night-600 bg-night-700" />
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.25">
      <span className={cn('inline-block size-2.25 rounded-[2px]', className)} />
      {children}
    </li>
  );
}

function Rail({ homeHref }: { homeHref: string }) {
  const { t } = useTranslation();
  const soon = t('dashboard.rail.soon');
  const items: { key: 'bookings' | 'movers' | 'payouts' | 'settings'; icon: ReactNode }[] = [
    { key: 'bookings', icon: <CalendarIcon /> },
    { key: 'movers', icon: <VanIcon size={19} /> },
    { key: 'payouts', icon: <CardIcon size={19} /> },
    { key: 'settings', icon: <GearIcon /> },
  ];
  return (
    <nav aria-label={t('dashboard.rail.label')} className="flex items-center gap-2.5 lg:w-14 lg:flex-col lg:py-2">
      <a
        href={homeHref}
        aria-label={t('dashboard.rail.home')}
        className="flex size-10 items-center justify-center rounded-[12px] bg-accent-500 text-ink-900"
      >
        <LogoMark size={20} />
      </a>
      <div className="w-1 lg:h-2.5" />
      <span
        aria-current="page"
        title={t('dashboard.rail.map')}
        className="flex size-11 items-center justify-center rounded-[12px] bg-night-600 text-night-50"
      >
        <MapIcon />
        <span className="sr-only">{t('dashboard.rail.map')}</span>
      </span>
      {items.map(({ key, icon }) => (
        <button
          key={key}
          type="button"
          disabled
          title={`${t(`dashboard.rail.${key}`)} · ${soon}`}
          aria-label={`${t(`dashboard.rail.${key}`)} (${soon})`}
          className="flex size-11 items-center justify-center rounded-[12px] border-0 bg-transparent text-sage-400 disabled:cursor-not-allowed"
        >
          {icon}
        </button>
      ))}
    </nav>
  );
}

const svgProps = {
  width: 19,
  height: 19,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const MapIcon = () => (
  <svg {...svgProps}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);
const CalendarIcon = () => (
  <svg {...svgProps}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);
const GearIcon = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 14H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" className="fill-current" aria-hidden="true">
    <rect x="5" y="4" width="5" height="16" rx="1" />
    <rect x="14" y="4" width="5" height="16" rx="1" />
  </svg>
);
const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" className="fill-current" aria-hidden="true">
    <path d="M6 4v16l14-8z" />
  </svg>
);
