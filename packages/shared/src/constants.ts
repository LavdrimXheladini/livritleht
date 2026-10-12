// Enum values mirror the Postgres enums in supabase/migrations. Change both together.

export const USER_ROLES = ['customer', 'mover', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles a user may pick for themselves at sign-up. `admin` is only granted server-side. */
export const SELF_SIGNUP_ROLES = ['customer', 'mover'] as const satisfies readonly UserRole[];
export type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number];

/** Vehicle categories only — prices come from each mover's own rate card (COMPLIANCE §1.1). */
export const VEHICLE_CLASSES = ['SMALL', 'VAN', 'LARGE_VAN', 'BOX', 'TRUCK'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export const JOB_TYPES = ['ITEM', 'SMALL_MOVE', 'FULL_MOVE', 'CROSS_BORDER'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  'DRAFT',
  'QUOTED',
  'BOOKED',
  'OFFERED',
  'ACCEPTED',
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'AT_DROPOFF',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses during which the mover app shares GPS (COMPLIANCE §9.1). */
export const GPS_ACTIVE_STATUSES = [
  'EN_ROUTE_TO_PICKUP',
  'AT_PICKUP',
  'IN_TRANSIT',
  'AT_DROPOFF',
] as const satisfies readonly JobStatus[];

/** `sr` covers Serbian, Croatian, Bosnian and Montenegrin UI; `de` serves the diaspora corridors. */
export const LOCALES = ['en', 'sq', 'pl', 'sr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Map any BCP-47 tag (e.g. `sq-XK`, `hr-HR`, `bs`) to a supported locale. */
export function resolveLocale(tag: string | null | undefined): Locale {
  const lang = tag?.toLowerCase().split(/[-_]/)[0];
  if (!lang) return DEFAULT_LOCALE;
  if ((LOCALES as readonly string[]).includes(lang)) return lang as Locale;
  // Serbian UI covers Croatian, Bosnian and Montenegrin.
  if (lang === 'hr' || lang === 'bs' || lang === 'me' || lang === 'cnr') return 'sr';
  return DEFAULT_LOCALE;
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Currencies a rate card may use. Corridor (cross-border) jobs are always priced in EUR (COMPLIANCE §11). */
export const CURRENCIES = ['EUR', 'PLN', 'CHF', 'ALL', 'MKD', 'RSD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** People loading and unloading, including the mover: 1 = mover only, 2 = mover + 1 helper, 3 = mover + 2 helpers. */
export const CREW_SIZES = [1, 2, 3] as const;
export type CrewSize = (typeof CREW_SIZES)[number];

/** Platform commission on the mover's price, whole percent (COMPLIANCE §1 ALLOWED). */
export const PLATFORM_TAKE_RATE_PCT = { domestic: 20, crossBorder: 15 } as const;

/** MoversHub's customer booking fee: a flat amount per currency, or a percent of the mover's price. */
export type BookingFeeRule =
  | { kind: 'flat'; amountByCurrency: Partial<Record<Currency, number>> }
  | { kind: 'percent'; pct: number };

/**
 * The customer booking fee — always its own line next to the mover's price (COMPLIANCE §1 ALLOWED).
 * Amount not decided yet (design/DECISIONS.md #6): `null` = shown as "to be announced", not charged.
 */
export const BOOKING_FEE_RULE: BookingFeeRule | null = null;

/**
 * Display facts per vehicle class (COMPLIANCE §1.1 table). Categories only — never prices.
 * Names and "fits" text are translated in @movershub/i18n under `vehicles.<CLASS>`.
 */
export const VEHICLE_CLASS_INFO: Record<VehicleClass, { capacity: string; examples: string }> = {
  SMALL: { capacity: '≤ 3 m³', examples: 'Caddy · Berlingo' },
  VAN: { capacity: '~6 m³', examples: 'Transit Custom · Vivaro' },
  LARGE_VAN: { capacity: '12–15 m³', examples: 'Sprinter · Ducato · Crafter' },
  BOX: { capacity: '18–22 m³', examples: 'Luton · ≤ 3.5 t' },
  TRUCK: { capacity: '30 m³+', examples: '> 3.5 t' },
};
