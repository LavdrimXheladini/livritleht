# MoversHub

MoversHub is a **moving marketplace** for Kosovo, the Balkans and Poland, including the diaspora
routes to Germany, Austria and Switzerland. Customers book an **independent mover with a van** — a
single item, a small move, a full home or a cross-border move:

1. Enter pickup and drop-off addresses
2. Pick a vehicle class and crew, see an upfront price from movers' own rates
3. Book and pay by card
4. Track the mover live on a map

MoversHub is a **pure middleman**: movers are independent businesses that set their own prices and
accept or decline jobs freely; payments are held and split by Stripe. The legal rules behind this are
in [`COMPLIANCE.md`](COMPLIANCE.md) and are product requirements.

## What works today

| Area | Status |
|---|---|
| **Website** (`web/app`) | Landing page in 5 languages (en, sq, pl, sr, de) with address search (also within one city), real map and route, live "from" prices from movers' rate cards (test movers for now), mover section, FAQ, waitlist; live-moves dashboard demo; sign-in by email link |
| **Customer app** (`mobile/customer`) | Expo app in the website's design: public home with address search and live "from" prices (like the website), sign-in screens (booking flow not built yet) |
| **Mover app** (`mobile/mover`) | Expo app "MoversHub Partner" (dark design): intro, example job request priced by the live quote, setup checklist after sign-in (onboarding / jobs not built yet) |
| **Database** | Supabase (cloud, Ireland): `profiles`, `waitlist`, mover companies, documents, vehicles, rate cards and service areas (+ clearly marked test movers), all with row-level security |
| **Pricing** (`packages/pricing`, `supabase/functions/quote`) | Pricing engine + the live `quote` server function: real offers per vehicle class from each mover's own rate card (test movers for now), itemised, cheapest first; prices are shown exactly (to the cent; whole lek, denar and dinar) |
| **Address search for the apps** (`supabase/functions/places`) | Photon (OpenStreetMap) on the server, like the website's own search — visitors' IP addresses never reach the geocoder |
| **Not built yet** | Booking a mover, Stripe payments, live GPS, mover onboarding screens, admin panel — see [`CLAUDE.md`](CLAUDE.md) §10 |

Prices on the landing page come from each mover's own rate card via the server `quote` function — for now
**clearly marked test movers** with researched local rates, priced for a typical load per van size
([`design/DECISIONS.md`](design/DECISIONS.md) #9–#11). Without the cloud (offline tests) the page shows labelled
sample rates instead.

## Stack

TypeScript everywhere · **pnpm + Turborepo** monorepo · **Next.js 16** + Tailwind 4 + shadcn/ui (web) ·
**Expo SDK 57** + NativeWind (mobile) · **Supabase** (Postgres, Auth) · Zod · i18next ·
**OpenStreetMap** services for maps and addresses (MapLibre + OpenFreeMap, Photon, OSRM) ·
Vitest, Playwright, pgTAP, Maestro. Full stack and the plan: [`CLAUDE.md`](CLAUDE.md) §1.

```
web/app        Next.js website            web/e2e        Playwright tests
mobile/        customer + mover Expo apps, shared code (core), Maestro flows
packages/      shared (types, schemas), pricing (engine), i18n (translations), ui (design tokens + components)
supabase/      database migrations and tests
scripts/       dev-prep.mjs (runs before every dev/build), test-db-cloud.mjs (database tests),
               build-functions-shared.mjs (shares the pricing code with the edge functions)
design/        design handoff and decisions
```

## Run it locally

### 1. Install the tools (once)

- **Node.js 22 or newer** — https://nodejs.org
- **pnpm 10** — `npm install -g pnpm@10.18.0`
- **Git**

Optional: **Expo Go** on your phone (to open the mobile apps), the
[Supabase CLI](https://supabase.com/docs/guides/cli) logged in and linked to the project (database
tests and migrations).

### 2. Get the code and install packages

```bash
git clone https://github.com/LavdrimXheladini/livritleht.git
cd livritleht
git switch develop
pnpm install
```

In VS Code, open **`movershub.code-workspace`** (File → Open Workspace from File…): the three apps — website,
customer app, mover app — show as separate folders, next to the shared code, database and tests.

### 3. Add the environment files

Copy [`.env.example`](.env.example) and fill in the values (ask the project owner for the Supabase
publishable key — it is public by design; **never commit these files**):

| File | Variables |
|---|---|
| `web/app/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `CONTACT_EMAIL`, optional `SUPABASE_SECRET_KEY` (server only — rate limits) |
| `mobile/customer/.env` and `mobile/mover/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Without them the website still opens, but sign-in won't work.

### 4. Start what you need

| Command | Opens |
|---|---|
| `pnpm dev:web` | Website → http://localhost:3000 |
| `pnpm dev:customer` | Customer app (Expo, port 8081) — scan the QR code with Expo Go, or press `w` for a browser preview |
| `pnpm dev:mover` | Mover app (Expo, port 8082) |
| `pnpm dev` | All three at once (needs more memory) |

Every start runs `scripts/dev-prep.mjs` first: it regenerates the design-token CSS and clears stale
caches when dependencies or tokens changed. Don't bypass it with raw `next dev` / `expo start`.

On a machine with little free memory, run **one** app at a time.

## Checks and tests

```bash
pnpm lint          # ESLint (2 packages at a time)
pnpm typecheck     # TypeScript (2 packages at a time)
pnpm test          # unit tests (Vitest), incl. the banned-wording check, + the COMPLIANCE-TESTS.md check
pnpm --filter @movershub/e2e install-browsers   # once
pnpm e2e           # Playwright against a production build on port 3100 (offline test data)
pnpm e2e:visual    # screenshots of the website (5 languages, phone + laptop) compared with the saved ones
pnpm e2e:apps      # screenshots of both phone apps in their browser preview, one app at a time
pnpm test:db:cloud # database tests on the linked cloud project — no Docker; everything is rolled back
pnpm test:db       # the same tests on a local database (Docker + `supabase start`)
```

The screenshot tests are still and offline (no motion, maps show their drawn fallback, saved prices), so
the same code gives the same pictures. After an intended design change, look at the new pictures in
`web/e2e/test-results/` and accept them with `pnpm e2e:visual --update-snapshots` (or `pnpm e2e:apps
--update-snapshots`). That rewrites only pictures that fail; a small change, like a renamed label, can stay
within the tolerance — use `--update-snapshots=all` to rewrite every picture. Saved pictures are per operating system (`-win32.png`); CI runs Linux and does not run
them yet.

API tests for the deployed `quote` and `places` functions (skipped unless both variables are set):

```bash
QUOTE_API_URL=https://<project-ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
```

## Server functions

```bash
pnpm functions:deploy   # copies the shared pricing code into supabase/functions, then deploys (no Docker)
```

The `quote` function quotes test movers only while the project secret `INCLUDE_TEST_MOVERS` is `true`
(`supabase secrets set INCLUDE_TEST_MOVERS=false` before launch, and delete the test movers).

`quote` and `places` are public. Browsers may call them only from the apps' local preview
(`http://localhost` / `127.0.0.1`, see `supabase/functions/_shared/http.ts`); the website calls them from
its server and the phone apps don't need CORS.

Both are limited per IP (`RATE_LIMITS` in `packages/shared/src/rate-limit.ts`: 30 quotes per 10 minutes,
60 address searches per minute → `429` + `Retry-After`), counted in the database by `hit_rate_limit`; the
website's quote action and `/api/geo/search` use the same limits. The website calls `quote` with
`SUPABASE_SECRET_KEY` so its visitors don't share one limit there — set that key on the website **before**
deploying the functions, or every visitor counts against the website's single IP.

## Good to know

- **Required tests:** [`COMPLIANCE-TESTS.md`](COMPLIANCE-TESTS.md) shows which test covers each rule of
  COMPLIANCE.md §13; add the tests when you build a feature and update its row.
- **Wording and pricing rules:** read [`COMPLIANCE.md`](COMPLIANCE.md) before changing pricing, jobs,
  payments, mover accounts, tracking or personal data. All user-facing text goes through
  `packages/i18n` (5 languages); the test suite blocks banned words (e.g. "our movers", "drivers").
- **Design:** colours, radii and fonts come only from `packages/ui/tokens.json`; the landing page
  follows `design/` with the decisions in [`design/DECISIONS.md`](design/DECISIONS.md).
- **Maps:** free OpenStreetMap services for now. The public OSRM route server is **not allowed for
  production** — switch to Google Routes or a self-hosted router before launch.
- **Contributor guide** for Claude Code and developers: [`CLAUDE.md`](CLAUDE.md).
