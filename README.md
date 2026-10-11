# Ranktrip

Ranktrip is a **moving marketplace** for Kosovo, the Balkans and Poland, including the diaspora
routes to Germany, Austria and Switzerland. Customers book an **independent mover with a van** — a
single item, a small move, a full home or a cross-border move:

1. Enter pickup and drop-off addresses
2. Pick a vehicle class and crew, see an upfront price from movers' own rates
3. Book and pay by card
4. Track the mover live on a map

Ranktrip is a **pure middleman**: movers are independent businesses that set their own prices and
accept or decline jobs freely; payments are held and split by Stripe. The legal rules behind this are
in [`COMPLIANCE.md`](COMPLIANCE.md) and are product requirements.

## What works today

| Area | Status |
|---|---|
| **Website** (`web/app`) | Landing page in 5 languages (en, sq, pl, sr, de) with address search, real map and route, sample prices, mover section, FAQ, waitlist; sign-in by email link |
| **Customer app** (`mobile/customer`) | Expo app: sign-in screens and home (booking flow not built yet) |
| **Mover app** (`mobile/mover`) | Expo app: sign-in screens and home (onboarding / jobs not built yet) |
| **Database** | Supabase (cloud, Ireland): `profiles`, `waitlist`, with row-level security |
| **Not built yet** | Real pricing from movers, bookings, Stripe payments, live GPS, admin panel — see [`CLAUDE.md`](CLAUDE.md) §10 |

Prices on the landing page are **labelled sample rates** calculated on the server
([`design/DECISIONS.md`](design/DECISIONS.md)); real prices will come from each mover's own rate card.

## Stack

TypeScript everywhere · **pnpm + Turborepo** monorepo · **Next.js 16** + Tailwind 4 + shadcn/ui (web) ·
**Expo SDK 57** + NativeWind (mobile) · **Supabase** (Postgres, Auth) · Zod · i18next ·
**OpenStreetMap** services for maps and addresses (MapLibre + OpenFreeMap, Photon, OSRM) ·
Vitest, Playwright, pgTAP, Maestro. Full stack and the plan: [`CLAUDE.md`](CLAUDE.md) §1.

```
web/app        Next.js website            web/e2e        Playwright tests
mobile/        customer + mover Expo apps, shared code (core), Maestro flows
packages/      shared (types, schemas), i18n (translations), ui (design tokens + components)
supabase/      database migrations and tests
scripts/       dev-prep.mjs (runs before every dev/build)
design/        design handoff and decisions
```

## Run it locally

### 1. Install the tools (once)

- **Node.js 22 or newer** — https://nodejs.org
- **pnpm 10** — `npm install -g pnpm@10.18.0`
- **Git**

Optional: **Expo Go** on your phone (to open the mobile apps), **Docker Desktop** + the
[Supabase CLI](https://supabase.com/docs/guides/cli) (only for the database tests).

### 2. Get the code and install packages

```bash
git clone https://github.com/LavdrimXheladini/livritleht.git
cd livritleht
git switch develop
pnpm install
```

### 3. Add the environment files

Copy [`.env.example`](.env.example) and fill in the values (ask the project owner for the Supabase
publishable key — it is public by design; **never commit these files**):

| File | Variables |
|---|---|
| `web/app/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `CONTACT_EMAIL` |
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
pnpm test          # unit tests (Vitest), incl. the banned-wording check on all translations
pnpm --filter @ranktrip/e2e install-browsers   # once
pnpm e2e           # Playwright against a production build on port 3100 (offline test data)
pnpm test:db       # database tests — needs Docker + `supabase start`
```

## Good to know

- **Wording and pricing rules:** read [`COMPLIANCE.md`](COMPLIANCE.md) before changing pricing, jobs,
  payments, mover accounts, tracking or personal data. All user-facing text goes through
  `packages/i18n` (5 languages); the test suite blocks banned words (e.g. "our movers", "drivers").
- **Design:** colours, radii and fonts come only from `packages/ui/tokens.json`; the landing page
  follows `design/` with the decisions in [`design/DECISIONS.md`](design/DECISIONS.md).
- **Maps:** free OpenStreetMap services for now. The public OSRM route server is **not allowed for
  production** — switch to Google Routes or a self-hosted router before launch.
- **Contributor guide** for Claude Code and developers: [`CLAUDE.md`](CLAUDE.md).
