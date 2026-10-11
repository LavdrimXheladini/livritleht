'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';

/** Selectable pill: crew size, class tabs, corridors, view toggles. */
export const chipVariants = cva('press inline-flex shrink-0 cursor-pointer items-center justify-center font-sans text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', {
  variants: {
    variant: {
      /** Crew pills, class tabs (prototype: 40px pill, green when selected). */
      pill: 'min-h-10 rounded-full border px-3.5 data-[selected=false]:border-stone-400 data-[selected=false]:bg-stone-50 data-[selected=false]:text-ink-900 data-[selected=false]:hover:border-ink-300 data-[selected=true]:border-brand-500 data-[selected=true]:bg-brand-500 data-[selected=true]:text-stone-50',
      /** Corridor buttons (squarer, sand fill, green outline when selected). */
      tile: 'min-h-11 rounded-md border-[1.5px] px-4 data-[selected=false]:border-stone-150 data-[selected=false]:bg-stone-150 data-[selected=false]:text-ink-600 data-[selected=false]:hover:border-stone-400 data-[selected=true]:border-brand-500 data-[selected=true]:bg-stone-50 data-[selected=true]:text-ink-900',
      /** Segmented toggle on dark ("Map / Van load"). */
      dark: 'min-h-9 rounded-full px-4 data-[selected=false]:text-sage-400 data-[selected=false]:hover:text-night-50 data-[selected=true]:bg-night-50 data-[selected=true]:text-ink-900',
    },
  },
  defaultVariants: { variant: 'pill' },
});

type ChipVariant = VariantProps<typeof chipVariants>['variant'];

export type ChipProps = ComponentProps<'button'> & VariantProps<typeof chipVariants> & { selected: boolean };

/** Stand-alone toggle (aria-pressed). Inside a ChipGroup, prefer the group's radio semantics. */
export function Chip({ className, variant, selected, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      className={cn(chipVariants({ variant }), className)}
      {...props}
    />
  );
}

export type ChipOption<T extends string | number> = { value: T; label: ReactNode };

export type ChipGroupProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly ChipOption<T>[];
  /** Accessible name of the group (visible label is optional — see `label`). */
  ariaLabel: string;
  /** Visible label before the chips, e.g. "Crew". */
  label?: ReactNode;
  variant?: ChipVariant;
  className?: string;
};

/** Single-choice group with radio semantics and arrow-key navigation (WAI-ARIA radiogroup). */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  label,
  variant = 'pill',
  className,
}: ChipGroupProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Roving tab stop: the selected chip, or the first one when nothing is selected yet.
  const tabStop = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5',
        variant === 'dark' && 'gap-1 rounded-full border border-night-600 bg-night-800 p-1',
        variant === 'tile' && 'gap-2',
        className,
      )}
    >
      {label ? <span className="mr-1 text-[13px] text-ink-600">{label}</span> : null}
      <div role="radiogroup" aria-label={ariaLabel} className="contents">
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === tabStop ? 0 : -1}
              data-selected={selected}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={chipVariants({ variant })}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Crew size picker: "Driver · +1 helper · +2 helpers" (labels come from i18n). */
export function CrewPills({
  value,
  onChange,
  labels,
  groupLabel,
  className,
}: {
  value: 1 | 2 | 3;
  onChange: (crew: 1 | 2 | 3) => void;
  labels: Record<1 | 2 | 3, string>;
  groupLabel: string;
  className?: string;
}) {
  return (
    <ChipGroup
      value={value}
      onChange={onChange}
      ariaLabel={groupLabel}
      label={groupLabel}
      options={([1, 2, 3] as const).map((n) => ({ value: n, label: labels[n] }))}
      className={className}
    />
  );
}
