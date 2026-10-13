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
| **App** (`mobile/app`) | One Expo app for customers and movers, in the website's design: opens on sign in (email + password) / create account ("I need a mover" / "I'm a mover"; a 6-digit code confirms the email once, then a password; "Forgot password?" sends a code for a new one). Customers then see address search and live "from" prices; movers the dark "Partner" side: setup checklist and an example job request priced by the live quote. The role is saved once the code has proven the email; people can switch sides from the home screen (mover requests only after the setup is filled in and verified). The app remembers the side on the device and opens offline. Language: the phone's, or chosen with "EN ▾" in the top bar (kept on the device and saved with the account). Creating an account and resetting a password (both need an emailed code) work only against a local Supabase until the cloud project has email (a domain + SMTP). Booking, onboarding and jobs not built yet |
| **Database** | Supabase (cloud, Ireland): `profiles`, `waitlist`, mover companies, documents, vehicles, rate cards and service areas (+ clearly marked test movers), all with row-level security |
| **Pricing** (`packages/pricing`, `supabase/functions/quote`) | Pricing engine + the live `quote` server function: real offers per vehicle class from each mover's own rate card (test movers for now), itemised, cheapest first; prices are shown exactly (to the cent; whole lek, denar and dinar) |
| **Address search for the app** (`supabase/functions/places`) | Photon (OpenStreetMap) on the server, like the website's own search — users' IP addresses never reach the geocoder; signed-in app users only |
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
mobile/        the Expo app for customers and movers (app), shared code (core), Maestro flows
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

Optional: **Expo Go** on your phone (to open the app), the
[Supabase CLI](https://supabase.com/docs/guides/cli) logged in and linked to the project (database
tests and migrations).

### 2. Get the code and install packages

```bash
git clone https://github.com/LavdrimXheladini/livritleht.git
cd livritleht
git switch develop
pnpm install
```

In VS Code, open **`movershub.code-workspace`** (File → Open Workspace from File…): the website and the app
show as separate folders, next to the shared code, database and tests.

### 3. Add the environment files

Copy [`.env.example`](.env.example) and fill in the values (ask the project owner for the Supabase
publishable key — it is public by design; **never commit these files**):

| File | Variables |
|---|---|
| `web/app/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `CONTACT_EMAIL`, optional `SUPABASE_SECRET_KEY` (server only — rate limits) |
| `mobile/app/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Without them the website still opens, but sign-in won't work.

### 4. Start what you need

| Command | Opens |
|---|---|
| `pnpm dev:web` | Website → http://localhost:3000 |
| `pnpm dev:app` | The app (Expo, port 8081) — scan the QR code with Expo Go, or press `w` for a browser preview. Signing in needs the local Supabase for now — see 5 below |
| `pnpm dev` | Both at once (needs more memory) |

Every start runs `scripts/dev-prep.mjs` first: it regenerates the design-token CSS and clears stale
caches when dependencies or tokens changed. Don't bypass it with raw `next dev` / `expo start`.

On a machine with little free memory, run **one** app at a time.

### 5. Sign in to the app (local Supabase, for now)

The cloud project's email sends a sign-in **link**, not a code, so until it has its own email (a domain +
SMTP) the app can sign in only against a local Supabase:

1. Install **Docker Desktop** and the **Supabase CLI**, then run `supabase start` (the first start downloads
   images and needs several GB of memory). `supabase status` prints the local URL and publishable key.
2. Put that key in `mobile/app/.env`, with `EXPO_PUBLIC_SUPABASE_URL` set for where the app runs:
   - `http://127.0.0.1:54321` — the browser preview (`w`) and the iOS simulator;
   - `http://10.0.2.2:54321` — the Android emulator (or run `adb reverse tcp:54321 tcp:54321` and keep 127.0.0.1);
   - `http://<your computer's address on the Wi-Fi>:54321` — a phone with Expo Go on the same Wi-Fi (allow
     port 54321 through the firewall).
3. Run `pnpm functions:build`, and put `INCLUDE_TEST_MOVERS=true` in `supabase/functions/.env` (git-ignored) so
   the local `quote` function prices the test movers.
4. Create an account with any email: the code arrives in Mailpit, http://127.0.0.1:54324. Then choose a password
   (8+ characters, letters and digits) and sign in with email + password from then on; "Forgot password?" sends
   a code the same way.

## Checks and tests

```bash
pnpm lint          # ESLint (2 packages at a time)
pnpm typecheck     # TypeScript (2 packages at a time)
pnpm test          # unit tests (Vitest), incl. the banned-wording check, + the COMPLIANCE-TESTS.md check
pnpm --filter @movershub/e2e install-browsers   # once
pnpm e2e           # Playwright against a production build on port 3100 (offline test data)
pnpm e2e:visual    # screenshots of the website (5 languages, phone + laptop) compared with the saved ones
pnpm e2e:apps      # screenshots of the phone app in its browser preview (signed out, customer, mover)
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

Add `SUPABASE_SECRET_KEY=<the project's secret key>` for the signed-in address searches (the tests create
a test user and delete it afterwards), and `APP_WEB_ORIGIN=<an origin from APP_WEB_ORIGINS>` for the
hosted computer version's CORS check.

## Server functions

```bash
pnpm functions:deploy   # copies the shared pricing code into supabase/functions, then deploys (no Docker)
```

The `quote` function quotes test movers only while the project secret `INCLUDE_TEST_MOVERS` is `true`
(`supabase secrets set INCLUDE_TEST_MOVERS=false` before launch, and delete the test movers).

`quote` is public; `places` answers signed-in app users only (`401` otherwise). Browsers may call them
only from the app's own web build: the local preview (`http://localhost` / `127.0.0.1`) and the hosted
computer version, whose exact origins go in the project secret `APP_WEB_ORIGINS`, comma-separated
(`supabase secrets set APP_WEB_ORIGINS=https://app.example.com`; see `supabase/functions/_shared/http.ts`).
The website calls them from its server and the phone app doesn't need CORS.

Both are limited (`RATE_LIMITS` in `packages/shared/src/rate-limit.ts`: 30 quotes per 10 minutes,
60 address searches per minute → `429` + `Retry-After`): per account for signed-in app users (many phones
share one carrier IP), per IP for everyone else — counted in the database by `hit_rate_limit`. The
website's quote action and `/api/geo/search` use the same limits. The website calls `quote` with
`SUPABASE_SECRET_KEY` so its visitors don't share one limit there — set that key on the website **before**
deploying the functions, or every visitor counts against the website's single IP.

Logins whose email code was never entered are deleted every night, 7 days after the last code
(`delete_unconfirmed_accounts`, pg_cron). That needs **Confirm email** to stay on in the cloud project
(Authentication → Sign In / Providers → Email): without it Supabase marks an address confirmed as soon
as a code is asked for, and the cleanup finds nothing. The local stack has it on (`config.toml`).

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
