import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

export type VehicleClassTileProps = Omit<ComponentProps<'button'>, 'children'> & {
  /** "Large van" */
  name: ReactNode;
  /** Capacity chip, "13 m³" */
  capacity: ReactNode;
  /** Typical vehicles, "Sprinter · Crafter 3.5t" */
  example: ReactNode;
  /** What fits, "1–2 bedroom home" */
  fits: ReactNode;
  /**
   * Pre-formatted price line from the SERVER quote, e.g. "€162" — the lowest
   * available mover quote in this class (COMPLIANCE §1.1). Never computed on the client.
   * Omit when no mover is available; `unavailable` is shown instead.
   */
  priceLabel?: ReactNode;
  /** Small label above the price, e.g. "from" (design/DECISIONS.md #2: small "from" + big price). */
  pricePrefix?: ReactNode;
  /** "4 movers" — number of offers behind the price. */
  offersLabel?: ReactNode;
  /** Shown instead of a price when no mover offers this class (tile is disabled). */
  unavailable?: ReactNode;
  /** Placeholder in the price slot before a quote exists, e.g. "—" (tile stays selectable). Explain it once outside the tiles. */
  hint?: ReactNode;
  selected: boolean;
};

/** One vehicle class in the quote widget. The platform defines classes, never prices. */
export function VehicleClassTile({
  name,
  capacity,
  example,
  fits,
  priceLabel,
  pricePrefix,
  offersLabel,
  unavailable,
  hint,
  selected,
  className,
  disabled,
  ...props
}: VehicleClassTileProps) {
  const noOffers = priceLabel === undefined && hint === undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected}
      disabled={disabled ?? noOffers}
      className={cn(
        'press flex min-h-11 cursor-pointer flex-col gap-0.75 rounded-input border px-4 py-3.5 text-left font-sans outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        selected
          ? 'border-brand-500 bg-brand-500 text-stone-50'
          : 'border-stone-400 bg-stone-50 text-ink-900 hover:border-ink-300 disabled:hover:border-stone-400',
        className,
      )}
      {...props}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">{name}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.75 text-xs',
            selected ? 'bg-accent-500 text-ink-900' : 'bg-stone-300 text-ink-700',
          )}
        >
          {capacity}
        </span>
      </span>
      <span className="text-[12.5px] opacity-72">{example}</span>
      <span className="text-[12.5px] opacity-72">{fits}</span>
      {noOffers ? (
        <span className="mt-auto pt-1.5 text-[13px] opacity-72">{unavailable}</span>
      ) : priceLabel === undefined ? (
        <span className="type-display mt-auto pt-1.5 text-[22px] leading-tight opacity-40">{hint}</span>
      ) : (
        <span className="mt-auto flex flex-col pt-1.5">
          {pricePrefix ? <span className="text-[11px] leading-none opacity-72">{pricePrefix}</span> : null}
          <span className="type-display text-[22px] leading-tight whitespace-nowrap">{priceLabel}</span>
          {offersLabel ? <span className="mt-0.5 text-xs opacity-72">{offersLabel}</span> : null}
        </span>
      )}
    </button>
  );
}
