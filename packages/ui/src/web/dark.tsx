import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps, ElementType, ReactNode } from 'react';

import { Pill } from './pill';

/* ── DarkPanel: night surfaces of the live map / ops UI ────────────────── */

export const darkPanelVariants = cva('font-sans text-night-50', {
  variants: {
    variant: {
      /** Dashboard side panels, timeline bar. */
      panel: 'rounded-panel border border-night-600 bg-night-800 p-3.5',
      /** Floating card over the map: translucent + blur. */
      overlay: 'rounded-lg border border-night-500 bg-night-900/88 p-4 backdrop-blur-sm',
      /** Small stat tile inside an overlay. */
      tile: 'rounded-md bg-night-800 p-2.5',
      /** Black device frame around the hero map. */
      frame: 'rounded-device bg-night-900 p-3 shadow-device',
    },
  },
  defaultVariants: { variant: 'panel' },
});

export type DarkPanelProps = ComponentProps<'div'> & VariantProps<typeof darkPanelVariants> & { as?: ElementType };

export function DarkPanel({ className, variant, as: Comp = 'div', ...props }: DarkPanelProps) {
  return <Comp data-slot="dark-panel" className={cn(darkPanelVariants({ variant }), className)} {...props} />;
}

/* ── ProgressBar ───────────────────────────────────────────────────────── */

export function ProgressBar({
  value,
  label,
  tone = 'accent',
  track = 'dark',
  size = 'sm',
  className,
}: {
  /** 0…1 */
  value: number;
  /** Accessible name, e.g. "Route progress". */
  label: string;
  /** `gradient` = copper fade used on the dashboard job card. */
  tone?: 'accent' | 'gradient';
  track?: 'dark' | 'light';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        'w-full overflow-hidden rounded-full',
        track === 'dark' ? 'bg-night-600' : 'bg-stone-300',
        size === 'xs' ? 'h-0.75' : size === 'sm' ? 'h-1' : 'h-1.25',
        className,
      )}
    >
      <div
        className={cn(
          'h-full transition-[width] duration-500 ease-out',
          tone === 'accent' ? 'bg-accent-500' : 'bg-linear-to-r from-accent-700 to-accent-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Gauge ─────────────────────────────────────────────────────────────── */

type GaugeProps =
  | {
      /** Speedometer arc (dashboard job card). */
      kind: 'arc';
      value: number;
      max: number;
      label: ReactNode;
      unit: ReactNode;
      className?: string;
    }
  | {
      /** Round "tank" filled from the bottom (van load). */
      kind: 'tank';
      /** 0…100 */
      percent: number;
      label: ReactNode;
      caption?: ReactNode;
      className?: string;
    };

export function Gauge(props: GaugeProps) {
  const tile = 'flex flex-col items-center rounded-input bg-night-700 p-2.5 font-sans text-night-50';
  if (props.kind === 'arc') {
    const pct = Math.min(100, Math.max(0, (props.value / props.max) * 100));
    const arc = 'M12 62 A40 40 0 1 1 92 62';
    return (
      <div className={cn(tile, props.className)}>
        <div className="self-start text-[11px] text-sage-400">{props.label}</div>
        <svg width="104" height="70" viewBox="0 0 104 70" aria-hidden="true">
          <path d={arc} fill="none" className="stroke-night-600" strokeWidth="7" strokeLinecap="round" pathLength={100} />
          <path
            d={arc}
            fill="none"
            className="stroke-accent-500 transition-[stroke-dasharray] duration-500"
            strokeWidth="7"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct.toFixed(1)} 100`}
          />
        </svg>
        <div className="-mt-7.5 text-lg font-semibold">{props.value}</div>
        <div className="text-[10.5px] text-sage-400">{props.unit}</div>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, props.percent));
  return (
    <div className={cn(tile, props.className)}>
      <div className="self-start text-[11px] text-sage-400">{props.label}</div>
      <div className="relative mt-1 size-16 overflow-hidden rounded-full border-2 border-night-600">
        <div
          className="absolute inset-x-0 bottom-0 bg-linear-to-b from-accent-500 to-accent-700 transition-[height] duration-500"
          style={{ height: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-stone-50 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
          {Math.round(pct)}%
        </div>
      </div>
      {props.caption ? <div className="mt-1.5 text-[10.5px] text-sage-400">{props.caption}</div> : null}
    </div>
  );
}

/* ── LiveMapCard: floating mover card over the live map ────────────────── */

export type LiveStat = { label: ReactNode; value: ReactNode; unit?: ReactNode };

export function LiveMapCard({
  title,
  status,
  subtitle,
  avatar,
  route,
  progress,
  progressLabel,
  stats,
  className,
}: {
  /**
   * The mover COMPANY name ("Your mover, …") — never a person's name (COMPLIANCE §4, §12).
   */
  title: ReactNode;
  /** "On the way" */
  status: ReactNode;
  /** Vehicle class · extra info */
  subtitle?: ReactNode;
  /** Two-letter monogram of the company. */
  avatar: ReactNode;
  /** "Prishtina → Prizren" */
  route: ReactNode;
  /** 0…1 */
  progress: number;
  /** Accessible name for the progress bar. */
  progressLabel: string;
  stats: readonly LiveStat[];
  className?: string;
}) {
  return (
    <DarkPanel variant="overlay" className={cn('flex w-[min(330px,calc(100%-40px))] flex-col gap-3', className)}>
      <div className="flex items-center gap-2.5">
        <div className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-night-600 text-sm font-semibold">
          {avatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{title}</span>
            <Pill tone="accent" size="sm">
              {status}
            </Pill>
          </div>
          {subtitle ? <div className="text-xs text-sage-400">{subtitle}</div> : null}
        </div>
      </div>
      <div className="flex justify-between text-[12.5px] text-stone-400">
        <span>{route}</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <ProgressBar value={progress} label={progressLabel} />
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <DarkPanel key={i} variant="tile">
            <div className="text-[11px] text-sage-400">{s.label}</div>
            <div className="mt-0.5 text-[15px] font-semibold whitespace-nowrap sm:text-[17px]">
              {s.value}
              {s.unit ? <span className="ml-1 text-[11px] font-normal text-sage-400">{s.unit}</span> : null}
            </div>
          </DarkPanel>
        ))}
      </div>
    </DarkPanel>
  );
}

/* ── Timeline: Booked → Mover assigned → Picked up → On the way → Delivered ─ */

export type TimelineStep = { label: ReactNode; sub?: ReactNode; state: 'done' | 'current' | 'todo' };

export function Timeline({ steps, label, className }: { steps: readonly TimelineStep[]; label: string; className?: string }) {
  return (
    <DarkPanel variant="panel" className={cn('px-5 py-4', className)}>
      <ol aria-label={label} className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 p-0">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5" aria-current={s.state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'mt-0.75 size-3 shrink-0 rounded-full',
                s.state === 'done' && 'bg-night-50',
                s.state === 'current' && 'bg-accent-500 ring-4 ring-accent-500/18',
                s.state === 'todo' && 'border-2 border-brand-300',
              )}
            />
            <div>
              <div className={cn('text-[13px] font-medium', s.state === 'todo' ? 'text-night-300' : 'text-night-50')}>
                {s.label}
              </div>
              {s.sub ? <div className="mt-0.5 text-[11.5px] text-sage-400">{s.sub}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </DarkPanel>
  );
}
