import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type { ComponentProps } from 'react';

/** Static label: section tags, status badges, capacity chips. Not interactive — see Chip. */
export const pillVariants = cva('inline-flex shrink-0 items-center gap-1 self-start font-sans whitespace-nowrap', {
  variants: {
    tone: {
      /** "Pricing", "Next" */
      neutral: 'bg-stone-300 text-ink-900',
      /** "Launch market" */
      brand: 'bg-brand-500 text-stone-50',
      /** "On the way", "Corridors" — live / highlighted */
      accent: 'bg-accent-500 font-semibold text-ink-900',
      /** "● Online" on dark */
      'accent-soft': 'bg-accent-900 text-accent-300',
      /** Job chips inside the mover phone */
      dark: 'bg-night-500 text-night-50',
      /** "Loading" status on dark */
      'dark-muted': 'bg-night-600 text-night-50',
    },
    shape: {
      round: 'rounded-full',
      /** Squarer chip used on dark job cards. */
      tag: 'rounded-sm',
    },
    size: {
      sm: 'px-1.75 py-0.5 text-[10.5px]',
      md: 'px-2.5 py-1 text-xs',
    },
  },
  defaultVariants: { tone: 'neutral', shape: 'round', size: 'md' },
});

export type PillProps = ComponentProps<'span'> & VariantProps<typeof pillVariants>;

export function Pill({ className, tone, shape, size, ...props }: PillProps) {
  return <span data-slot="pill" className={cn(pillVariants({ tone, shape, size }), className)} {...props} />;
}
