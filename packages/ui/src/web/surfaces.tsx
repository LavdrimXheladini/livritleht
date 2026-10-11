import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps, ElementType, ReactNode } from 'react';

import { Pill } from './pill';

/* ── Card ─────────────────────────────────────────────────────────────── */

export const cardVariants = cva('font-sans text-ink-900', {
  variants: {
    variant: {
      /** Stat cards ("Upfront." / "Live." / "By card."). */
      paper: 'rounded-card bg-stone-50 p-5.5 shadow-card',
      /** Quote widget, pricing chart: hairline border + large soft shadow. */
      widget: 'rounded-xl border border-stone-300 bg-stone-50 p-5.5 shadow-sheet',
      /** Market cards: bordered frame around an inset image. */
      outline: 'rounded-card border border-stone-300 bg-stone-50 p-2',
      /** Highlighted note inside a sheet (story preview). */
      inset: 'rounded-lg bg-stone-150 p-4',
    },
    /** Hover: rise 4px with a deeper shadow. */
    lift: { true: 'lift', false: '' },
  },
  defaultVariants: { variant: 'paper', lift: false },
});

export type CardProps = ComponentProps<'div'> & VariantProps<typeof cardVariants> & { as?: ElementType };

export function Card({ className, variant, lift, as: Comp = 'div', ...props }: CardProps) {
  return <Comp data-slot="card" className={cn(cardVariants({ variant, lift }), className)} {...props} />;
}

/* ── Sheet: full-width rounded page section ────────────────────────────── */

export const sheetVariants = cva('mx-auto w-full max-w-[1400px] font-sans', {
  variants: {
    tone: {
      /** Most sections */
      paper: 'bg-stone-50 text-ink-900',
      /** Hero */
      cream: 'bg-stone-100 text-ink-900',
      /** "Built for real moves." */
      sand: 'bg-stone-150 text-ink-900',
      /** Footer */
      brand: 'bg-brand-500 text-night-50',
    },
    /** Footer sheets are only rounded at the top. */
    corners: { all: 'rounded-sheet', top: 'rounded-t-sheet' },
    padding: {
      none: '',
      /** 96px vertical, gutter on the sides */
      section: 'px-6 py-24',
      /** Story paragraph: 110px vertical */
      roomy: 'px-6 py-27.5',
      /** Horizontal rails manage their own side padding */
      flush: 'py-24',
    },
  },
  defaultVariants: { tone: 'paper', corners: 'all', padding: 'section' },
});

export type SheetProps = ComponentProps<'section'> & VariantProps<typeof sheetVariants> & { as?: ElementType };

export function Sheet({ className, tone, corners, padding, as: Comp = 'section', ...props }: SheetProps) {
  return <Comp data-slot="sheet" className={cn(sheetVariants({ tone, corners, padding }), className)} {...props} />;
}

/* ── SectionTitle ──────────────────────────────────────────────────────── */

export function SectionTitle({
  title,
  subtitle,
  as: Heading = 'h2',
  size = 'section',
  align = 'center',
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  /** `hero` = clamp(44px, 7vw, 96px); `section` = clamp(34px, 4.4vw, 52px). */
  size?: 'hero' | 'section';
  align?: 'center' | 'left';
  className?: string;
}) {
  return (
    <div className={cn(align === 'center' ? 'text-center' : 'text-left', className)}>
      <Heading
        className={cn(
          // hyphens use <html lang>: long German compounds break instead of overflowing on phones
          'type-display m-0 text-balance break-words hyphens-auto',
          size === 'hero' ? 'text-hero mx-auto max-w-[1000px]' : 'text-section',
        )}
      >
        {title}
      </Heading>
      {subtitle ? (
        <p
          className={cn(
            'text-ink-600',
            size === 'hero'
              ? 'mx-auto mt-6.5 max-w-[600px] text-[19px] leading-normal text-ink-700'
              : 'mt-3.5 text-base',
            align === 'center' && size === 'section' && 'mx-auto max-w-[520px] leading-normal',
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/* ── StatCard ──────────────────────────────────────────────────────────── */

export function StatCard({
  tag,
  word,
  line,
  note,
  className,
}: {
  /** Small pill at the top ("Pricing"). */
  tag: ReactNode;
  /** Big display word ("Upfront."). */
  word: ReactNode;
  line: ReactNode;
  /** Italic footnote. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <Card variant="paper" lift className={cn('flex min-h-[230px] flex-col', className)}>
      <Pill tone="neutral">{tag}</Pill>
      <div className="mt-auto">
        <div className="type-display text-[40px] leading-none">{word}</div>
        <div className="mt-1 text-[15px]">{line}</div>
        {note ? <div className="mt-3.5 text-[13px] leading-[1.45] text-ink-600 italic">{note}</div> : null}
      </div>
    </Card>
  );
}
