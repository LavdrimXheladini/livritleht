'use client';

import { createContext, use, useRef, useState, useTransition, type ReactNode } from 'react';

import type { Place, VehicleClass } from '@movershub/shared';

import { quoteRoute } from '@/app/[lang]/quote-action';
import type { RouteQuote } from '@/lib/landing-types';

export type Crew = 1 | 2 | 3;
export type QuoteError = 'same_place' | 'invalid' | 'unavailable';

/**
 * The quote built in the hero widget. The live map, the mover phone and the pricing chart all
 * mirror it ("Mirrors the quote you built above." — design). Prices come from the server action;
 * nothing is priced in the browser.
 */
type LandingState = {
  pickup: Place;
  dropoff: Place;
  cls: VehicleClass;
  crew: Crew;
  /** Last successful quote (kept while a new one loads). */
  route: RouteQuote;
  pending: boolean;
  error: QuoteError | null;
  setPlaces: (pickup: Place, dropoff: Place) => void;
  setCls: (cls: VehicleClass) => void;
  setCrew: (crew: Crew) => void;
};

const Ctx = createContext<LandingState | null>(null);

export function LandingStateProvider({
  initialPickup,
  initialDropoff,
  initialRoute,
  children,
}: {
  initialPickup: Place;
  initialDropoff: Place;
  initialRoute: RouteQuote;
  children: ReactNode;
}) {
  const [[pickup, dropoff], setPair] = useState<[Place, Place]>([initialPickup, initialDropoff]);
  const [route, setRoute] = useState(initialRoute);
  const [error, setError] = useState<QuoteError | null>(null);
  // The design's default class, unless no mover offers it on the starting route.
  const [cls, setCls] = useState<VehicleClass>(() =>
    initialRoute.prices.LARGE_VAN[1] ? 'LARGE_VAN' : (firstOffered(initialRoute) ?? 'LARGE_VAN'),
  );
  const [crew, setCrew] = useState<Crew>(2);
  const [pending, startTransition] = useTransition();
  // Only the latest request may update the quote (answers can arrive out of order).
  const latest = useRef(0);

  const setPlaces = (nextPickup: Place, nextDropoff: Place) => {
    setPair([nextPickup, nextDropoff]);
    const id = ++latest.current;
    startTransition(async () => {
      try {
        const result = await quoteRoute({ pickup: nextPickup, dropoff: nextDropoff });
        if (id !== latest.current) return;
        if (result.ok) {
          setRoute(result.route);
          setError(null);
          // Keep a class that movers offer on this route (e.g. no trucks in a small town).
          setCls((current) => (result.route.prices[current][1] ? current : (firstOffered(result.route) ?? current)));
        } else {
          setError(result.error);
        }
      } catch {
        if (id === latest.current) setError('unavailable');
      }
    });
  };

  return (
    <Ctx value={{ pickup, dropoff, cls, crew, route, pending, error, setPlaces, setCls, setCrew }}>{children}</Ctx>
  );
}

/** First class with an offer for the default crew, for when the selected class has none. */
export function firstOffered(route: RouteQuote): VehicleClass | undefined {
  return (Object.keys(route.prices) as VehicleClass[]).find((cls) => route.prices[cls][1]);
}

export function useLandingState(): LandingState {
  const ctx = use(Ctx);
  if (!ctx) throw new Error('useLandingState must be used inside <LandingStateProvider>');
  return ctx;
}
