# CLAUDE.md — MoversHub

MoversHub is a **two-sided moving marketplace** for Europe (start: Kosovo/Balkans + Poland). Customers book movers with a van for single items, small moves, full moves and cross-border moves. UX is Lugg-style: pick a vehicle class → upfront price → book → live tracking. MoversHub is a **pure middleman**: movers are independent businesses, they set their own rates, and Stripe holds the money.

> **Before any change to pricing, jobs, payments, mover accounts, bookings, tracking or personal data, read `COMPLIANCE.md`.** Its MUST / MUST NOT rules are product requirements. If a task conflicts with them, stop and explain instead of implementing.

---

## 1. Stack

One language end to end: **TypeScript (strict)**.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Shared types, one CI |
| Customer app | **Expo (React Native) + Expo Router** | iOS + Android from one codebase, OTA updates |
| Mover app | **Separate Expo app** | Background location permission only in this app (cleaner store review), different UX |
| Web (booking site, tracking links, admin) | **Next.js (App Router)** | SEO for booking pages, public tracking page, admin panel |
| Backend | **Supabase** (Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions) — **EU region: Ireland (eu-west-1)**, project ref `nsczjynvatkfwmcnuaii` | Managed Postgres, row-level security, realtime for tracking, private storage for documents |
| Server logic | **Supabase Edge Functions (Deno/TS)** + Postgres functions | Pricing engine, Stripe webhooks, job state machine — never in the client |
| Validation | **Zod** in `packages/shared` | Same schemas on client and server |
| Data fetching | **TanStack Query** + `supabase-js` | Caching, retries, realtime invalidation |
| Forms | **React Hook Form + Zod** | |
| UI mobile | **NativeWind** (Tailwind for RN) | Same mental model as web |
| UI web | **Tailwind + shadcn/ui** | |
| Maps & routing | **Now (no Google billing yet, owner decision 2026-10-11):** free OpenStreetMap stack behind one provider interface (`web/app/src/lib/geo/provider.ts`, server-side only) — **Photon** (address search), **OSRM demo server** (road routes; fair-use, NOT for production), **MapLibre GL + OpenFreeMap** tiles (web map, dark style from tokens). `GEO_PROVIDER=fixture` for tests. **Planned:** Google Places + Routes (`@vis.gl/react-google-maps` web, `react-native-maps` mobile) once billing is set up — add a `google` provider, UI unchanged | Free now; Google later for best Balkan address coverage |
| GPS tracking | `expo-location` + `expo-task-manager` (background updates, Android foreground service) → **Supabase Realtime Broadcast** | Live position without writing every ping to the DB |
| Payments | **Stripe Connect (Express accounts)**, SetupIntent at booking, off-session PaymentIntent at completion, `application_fee_amount` | Licensed provider holds and splits money |
| Push | **Expo Notifications** | |
| SMS (tracking links, OTP) | **Twilio** | |
| i18n | **i18next** — `en`, `sq`, `pl`, `sr` (covers sr/hr/bs/me), `de` (diaspora corridors DE/AT/CH) | |
| Errors | **Sentry** (mobile + web + edge functions) | |
| Analytics | **PostHog EU cloud**, only after consent | GDPR |
| Mobile builds | **EAS Build / EAS Submit / EAS Update** | |
| Web hosting | **Vercel**, functions region `dub1` (Dublin, next to the database) | |
| CI | **GitHub Actions** | |
| Tests | **Vitest** (unit), **Playwright** (web E2E + API tests), **Maestro** (mobile E2E), **pgTAP** (DB/RLS tests) | |

Do not add new frameworks or replace any of these without asking.

---

## 2. Repo structure

```
movershub/
├─ web/                # WEB PLATFORM
│  ├─ app/             # Next.js: booking site under /[lang], /t/[token] tracking page, /admin  (@movershub/web)
│  └─ e2e/             # Playwright tests (web + API)                                          (@movershub/e2e)
├─ mobile/             # MOBILE PLATFORM
│  ├─ customer/        # Expo app: booking, payment, live tracking                              (@movershub/customer)
│  ├─ mover/           # Expo app: onboarding, rate cards, jobs, GPS                            (@movershub/mover)
│  ├─ core/            # Shared Expo code: Supabase client, auth, fonts, login/verify screens   (@movershub/mobile)
│  └─ maestro/         # Mobile E2E flows
├─ packages/           # SHARED BY BOTH PLATFORMS
│  ├─ shared/          # Zod schemas, types, constants (vehicle classes, job statuses), retention.config
│  ├─ pricing/         # Pure pricing engine (no I/O) — used by edge function + tests
│  ├─ ui/              # Design tokens (tokens.json → theme.css for web, tailwind-preset.js for mobile), fonts
│  └─ i18n/            # Translation files
├─ supabase/
│  ├─ migrations/      # SQL migrations (only way to change schema)
│  ├─ functions/       # Edge functions: quote, book, job-transition, stripe-webhook, tracking-token
│  ├─ seed.sql         # Test data: movers, vehicles, rate cards, customers
│  └─ tests/           # pgTAP tests for RLS and DB functions
├─ scripts/            # dev-prep.mjs: regenerates theme.css + clears stale bundler caches before dev/build
├─ design/             # Design handoff (reference only)
├─ COMPLIANCE.md
└─ CLAUDE.md
```

---

## 3. Core data model (Postgres)

- `profiles` — id (auth user), role (`customer` | `mover` | `admin`), name, phone, locale
- `mover_companies` — legal_name, registration_no, tax_id, tax_residency_country (DAC7), address, country, is_business, verification_status, stripe_account_id, stripe_onboarding_complete, self_certification_at
- `mover_documents` — company_id, type (`id`, `registration`, `insurance`, `cmr`, `licence`), file_path (private bucket), expires_at, verified_at
- `vehicles` — company_id, class (`SMALL` | `VAN` | `LARGE_VAN` | `BOX` | `TRUCK`), plate, max_weight_kg, volume_m3, has_tail_lift, tachograph (bool), active
- `rate_cards` — vehicle_id, currency, base_fee, per_km, per_labor_minute_1_helper, per_labor_minute_2_helpers, per_labor_minute_3_helpers, min_price, floor_without_lift_fee, heavy_item_fee, assembly_per_item, long_distance_threshold_km, long_distance_per_km, confirmed_by_mover_at
- `service_areas` — company_id, geography (PostGIS polygon or center + radius_km)
- `jobs` — customer_id, type (`ITEM` | `SMALL_MOVE` | `FULL_MOVE` | `CROSS_BORDER`), vehicle_class, helpers, scheduled_at, status, pickup/dropoff (address + `geography(Point)`), floors + has_lift per stop, items (jsonb), distance_km, est_labor_min, chosen_mover_company_id, chosen_vehicle_id
- `quotes` — job_id, vehicle_id, mover_company_id, line_items (jsonb), mover_price, booking_fee, platform_commission, total, currency, expires_at
- `job_offers` — job_id, mover_company_id, status (`offered` | `accepted` | `declined` | `expired`)
- `price_adjustments` — job_id, amount, reason, photo_path, status (`pending` | `approved` | `rejected`)
- `job_photos` — job_id, stage (`pickup` | `dropoff`), path, taken_at
- `location_breadcrumbs` — job_id, point, recorded_at (sparse, ~every 60 s)
- `tracking_links` — job_id, token, expires_at
- `payments` — job_id, setup_intent_id, payment_intent_id, status, amount, application_fee, currency
- `reviews` — job_id (must be COMPLETED), rating, text, verified
- `disputes`, `audit_log`
- `waitlist` — email (unique, case-insensitive), locale, created_at. Insert-only via API (landing footer); read only via service role. Retention: `waitlist` in retention.config
- `suspensions` — company_id, kind (`restriction` | `suspension` | `termination`), flagged_by (`algorithm` | `customer_report` | `admin`), reason_text (required), is_serious_violation, reviewed_by (human admin, required before effect), notice_sent_at, effective_at (≥ notice_sent_at + 30 days for termination unless serious violation), lifted_at
- `mover_appeals` — company_id, suspension_id (nullable), subject (`restriction` | `suspension` | `termination` | `document_rejection` | `other`), text, attachment_path, status (`open` | `under_review` | `upheld` | `rejected`), reviewed_by, decision_reason, created_at, resolved_at
- `terms_versions` — audience (`mover` | `customer`), version, locale, document_path, published_at, effective_at (mover terms: ≥ published_at + 15 days)
- `terms_notices` — company_id, terms_version_id, channel (`email` | `in_app`), sent_at
- `terms_acceptances` — user_id, terms_version_id, accepted_at (a mover who rejects new terms can terminate before effective_at)
- `dac7_quarterly_totals` — company_id, year, quarter, currency, total_payouts, total_fees_withheld, job_count (computed from `payments`; source for the annual DAC7 export)

Rules:
- **RLS on every table.** Customers see only their jobs; movers see offers in their area (district only, no exact address) and jobs they accepted; admins via service role in edge functions.
- Money in **integer minor units (cents)** + `currency`. Never floats.
- All schema changes via `supabase/migrations`. Regenerate types after: `pnpm db:types`.

**Retention (`packages/shared/src/retention.config.ts`)** — single source of truth for how long each kind of data is kept, read by a scheduled cleanup function. One entry per category: `job_photos`, `location_breadcrumbs`, `tracking_links`, `mover_documents` (after offboarding), `price_adjustments` photos, `audit_log`, tax/accounting records (`payments`, `dac7_quarterly_totals`). Each entry: `{ keepDays, from: 'job_completed' | 'expired' | 'account_closed' | 'created', holdIfDisputeOpen }`; `keepDays: null` means undecided and cleanup skips it. Data tied to an open dispute/claim is never deleted. Exact periods are not decided yet — mark them `// COMPLIANCE-TODO: §14` until the lawyer confirms.

---

## 4. Pricing engine (`packages/pricing`)

Pure function, fully unit-tested. Runs **only on the server** (edge function `quote`). The client never sends a price.

**Inputs:** job (stops, distance_km from Routes API, floors, has_lift, items, helpers, vehicle_class) + one vehicle's `rate_card`.

**Labor estimate (minutes):**
```
est_labor_min =
    sum(item.handling_minutes for each item)         // from item catalogue in packages/shared
  + sum(floor_penalty_min × floors for stops without lift)
  + travel_buffer_min (loading/unloading setup)
  then adjusted for helpers (more helpers → fewer minutes, but per-minute rate rises)
```

**Price for one mover's vehicle:**
```
mover_price =
    base_fee
  + per_km × distance_km
  + per_labor_minute[helpers] × est_labor_min
  + floor_without_lift_fee × floors_without_lift
  + heavy_item_fee × heavy_items
  + assembly_per_item × assembly_items
  + long_distance_per_km × max(0, distance_km − long_distance_threshold_km)
mover_price = max(mover_price, min_price)

booking_fee         = platform fee (shown separately)
total               = mover_price + booking_fee
platform_commission = round(mover_price × take_rate)   // 20% domestic, 15% cross-border
mover_payout        = mover_price − platform_commission
```

**Vehicle-class screen:** for each class, run the engine for every eligible vehicle (class match, mover active + verified + Stripe ready, service area covers pickup, available at scheduled_at, insurance valid; cross-border also needs CMR + tachograph rules) → show `from €min` and the number of offers. Customer then picks a mover or "Book best offer". The quote is saved in `quotes` and expires (e.g., 15 min).

Distance = route distance between stops at quote time. Traffic/detours never change the price. Changes after booking go through `price_adjustments` (customer must approve).

---

## 5. Job state machine

```
DRAFT → QUOTED → BOOKED (card saved via SetupIntent)
      → OFFERED → ACCEPTED (mover accepted)
      → EN_ROUTE_TO_PICKUP   ← GPS ON
      → AT_PICKUP (pickup photos required)
      → IN_TRANSIT
      → AT_DROPOFF (dropoff photos required)
      → COMPLETED            ← GPS OFF, off-session charge, payout after confirm/48 h
      ↘ CANCELLED (any time before COMPLETED, per cancellation policy)  ← GPS OFF
      ↘ DISPUTED (after COMPLETED, holds payout)
```
Transitions only via the `job-transition` edge function, which checks role, current status and required data (photos, etc.), and writes `audit_log`.

---

## 6. Map and GPS tracking

**Mover app**
- Request foreground permission, then background permission, with an explanation screen first.
- On `EN_ROUTE_TO_PICKUP`: `Location.startLocationUpdatesAsync` (task via `expo-task-manager`), accuracy balanced, every ~5–10 s or 25 m, Android foreground service notification "Sharing location with customer for job #…".
- Each update → Supabase Realtime **Broadcast** on channel `job:{jobId}` (`{lat, lng, heading, speed, ts}`). Every ~60 s also insert a row in `location_breadcrumbs`.
- On `COMPLETED` / `CANCELLED`: `stopLocationUpdatesAsync`. Also stop if the app detects the job is no longer active.

**Customer app + web**
- Map with pickup/drop-off pins, route polyline (from Routes API), mover marker animated between updates, ETA (Routes API from mover position, throttled to once per ~30 s).
- Subscribe to `job:{jobId}`; RLS/authorization: only the job's customer, the assigned mover, and valid tracking-link holders.
- Public tracking page `web/app/src/app/[lang]/t/[token]` — validates `tracking_links.token` + `expires_at`, shows map + ETA + mover company name only.

**Job offers map (mover app):** shows pickup **district** area, not exact address, until accepted.

---

## 7. Stripe flow

1. **Mover onboarding:** create Express account → Account Link → mover completes KYC on Stripe → `account.updated` webhook sets `stripe_onboarding_complete`.
2. **Booking:** create Stripe Customer + **SetupIntent** (`usage: 'off_session'`) → customer confirms card (3DS if needed) → job `BOOKED`.
3. **Completion:** create **PaymentIntent** with `off_session: true, confirm: true`, `amount = total + approved adjustments`, `application_fee_amount = platform_commission + booking_fee`, `transfer_data.destination = mover stripe_account_id`.
4. **Failure:** `payment_intent.payment_failed` → notify customer to complete payment in-app.
5. **Disputes:** `charge.dispute.created` → job `DISPUTED`, admin review.
6. Webhook function `stripe-webhook`: verify signature, idempotent by `event.id`, Stripe is source of truth.

Use Stripe **test mode** + `stripe listen` locally. Never store card or bank data.

---

## 8. Commands

```
pnpm install
pnpm dev                 # all apps
pnpm dev:customer        # Expo customer app
pnpm dev:mover           # Expo mover app
pnpm dev:web             # Next.js
supabase start           # local Postgres/Auth/Storage/Realtime
supabase db reset        # apply migrations + seed
pnpm db:types            # generate TS types from DB
pnpm test                # Vitest
pnpm test:db             # pgTAP
pnpm e2e                 # Playwright
pnpm e2e:mobile          # Maestro
pnpm lint && pnpm typecheck
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```
Local setup: copy `.env.example` → `web/app/.env.local` and `mobile/{customer,mover}/.env` with the Supabase URL + publishable key. Dev ports: web 3000, customer 8081, mover 8082. Every dev/start/build runs `scripts/dev-prep.mjs` first (regenerates `theme.css`, clears Next/Metro caches when the lockfile, tokens or configs changed) — don't bypass it with raw `next dev` / `expo start`. Local sign-in: test phones `+383 44 000 001` (customer) / `+48 500 000 001` (mover), code `123456`; email codes appear in Mailpit (http://127.0.0.1:54324). Playwright browsers: `pnpm --filter @movershub/e2e install-browsers`.

Framework notes (newer than most training data — read the bundled docs before changing):
- Next.js 16: `src/proxy.ts` replaces middleware; Cache Components are on, so anything reading cookies (Supabase session) must sit inside `<Suspense>`. Docs: `node_modules/next/dist/docs/`.
- Expo SDK 57: add native packages with `npx expo install`, never plain `pnpm add`. Routes guarded with `Stack.Protected`.
- NativeWind 4 uses Tailwind **3** (mobile); the web uses Tailwind **4**. Colors come from `packages/ui/tokens.json`.

---

## 9. Conventions

- TypeScript `strict`, no `any`. Shared types from `packages/shared`.
- Business rules on the server (edge functions / Postgres), never trusted from the client.
- Every new table: RLS policy + pgTAP test.
- Every new edge function: Zod input validation, auth check, Vitest/Playwright API test.
- Every user-facing string through i18n; follow the wording rules in `COMPLIANCE.md` §12 (e.g., "movers on MoversHub", never "our movers").
- Money: integer cents + currency. Dates: UTC in DB, local time in UI.
- Secrets only in env (`.env.local`, Supabase secrets, EAS secrets). Never commit keys.
- Small PRs; each PR lists which `COMPLIANCE.md` rules it touches.
- Uncertain legal items: implement behind a feature flag with `// COMPLIANCE-TODO: §14`.

---

## 10. Build order (MVP)

1. Monorepo scaffold, Supabase local, auth (phone OTP + email), i18n.
2. Mover onboarding: company, documents, vehicles, rate cards, Stripe Express.
3. Pricing engine + `quote` function + tests.
4. Customer booking flow: addresses (Places), items, vehicle classes, offers, SetupIntent.
5. Job offers + accept/decline (mover app).
6. Job state machine + photos.
7. GPS tracking + maps (customer, mover, public link).
8. Completion charge, webhooks, payouts, receipts.
9. Ratings, disputes, admin panel (verification, suspensions with human review).
10. DAC7 export, data export/deletion, cookie consent.
