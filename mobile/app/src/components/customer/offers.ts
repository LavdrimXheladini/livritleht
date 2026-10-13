import { classFrom, type ClassFrom } from '@movershub/mobile';
import { VEHICLE_CLASSES, formatMoney, type CrewSize, type Locale, type Place, type VehicleClass } from '@movershub/shared';

// Reading the server's quote. Every price is computed on the server from a mover's own rate card
// (COMPLIANCE §1.1); the app only looks prices up and formats them — it never computes one.

/** The `quote` function's answer, as `useQuote` returns it. */
export type LiveQuote = Parameters<typeof classFrom>[0];

/** Per class: the lowest offer for the crew size, or null when no mover offers that class here. */
export type ClassOffers = Record<VehicleClass, ClassFrom | null>;

export function offersFor(quote: LiveQuote, crew: CrewSize, pickup: Place): ClassOffers {
  return Object.fromEntries(VEHICLE_CLASSES.map((k) => [k, classFrom(quote, k, crew, pickup)])) as ClassOffers;
}

/**
 * The mover's own price, to the cent: "€162", "€149.42", "781 zł". Never rounded — "from" must
 * equal the lowest mover quote (COMPLIANCE §13), not a whole euro above or below it.
 */
export const priceText = (offer: ClassFrom, locale: Locale) => formatMoney(offer.moverPrice, offer.currency, locale);
