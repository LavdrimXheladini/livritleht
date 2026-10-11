import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

const primary = 'bg-brand-500 text-stone-50 hover:bg-brand-600';

export const buttonVariants = cva(
  'press inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-sans font-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Deep-green pill — main call to action ("Get a price", "Request movers"). */
        primary,
        /** shadcn/ui components ask for `default`; same look as primary. */
        default: primary,
        /** Stone pill ("I have a van"). */
        secondary: 'bg-stone-300 text-ink-900 hover:bg-stone-400',
        /** No fill (nav language switcher, low-emphasis actions). */
        ghost: 'bg-transparent text-ink-900 hover:bg-stone-200',
        /** Light surface with a hairline border (swap button, pickers). */
        outline: 'border border-stone-400 bg-stone-50 text-ink-900 hover:border-ink-300',
        /** Copper — live/active actions ("Accept job", "Share live link", "Join waitlist"). */
        accent: 'bg-accent-500 font-semibold text-ink-900 hover:bg-accent-300',
        /** Outline on dark surfaces ("Decline", "Call mover"). */
        'outline-dark': 'border border-brand-300 bg-transparent text-night-50 hover:border-night-400 hover:bg-night-700',
        link: 'h-auto min-h-0 rounded-none px-0 text-ink-900 underline underline-offset-4 hover:text-ink-600',
        destructive: 'bg-danger text-stone-50 hover:opacity-90',
      },
      size: {
        sm: 'min-h-10 px-3.5 text-[13px]',
        md: 'min-h-11 px-5 text-sm',
        lg: 'min-h-13 px-6.5 text-[15px]',
        /** Square 48px control with input radius (swap pickup/drop-off). */
        icon: 'size-12 rounded-input p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next `<Link>`) with button styles. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
