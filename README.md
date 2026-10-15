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
| **App** (`mobile/app`) | One Expo app for customers and movers, in the website's design: opens on sign in (email + password) / create account ("I need a mover" / "I'm a mover"; a 6-digit code confirms the email once, then a password; "Forgot password?" sends a code for a new one). Customers then see address search and live "from" prices, and **book a move** step by step: the exact addresses (floor, lift), what to move, the day, arrival time and people, then each van size priced by movers for exactly that move, and the movers in that size — lowest price first, each with their own itemised price, business or private person, registration number and checked insurance, or "Book best offer" (sending the booking and paying come next); movers the dark "Partner" side: setup checklist — its first step, **Your company** (business or private person; registration and tax numbers checked per country and in the official registers where they have an API; the address found on the map and confirmed; the phone confirmed with a code by SMS or WhatsApp; self-certification), and the second, **Documents** (register extract or ID, carrier insurance, CMR and operator licence for cross-border jobs, with valid-until dates, uploaded as PDF or photo to private storage), and the third, **Vans** (size class, plate, weight, load space, tail lift, tachograph; taken out of use instead of deleted), and the fourth, **Prices and work area** (the mover's own prices per van, started from local averages they must check and save, with a live example; towns with a radius), are built, and MoversHub reviews them on the website's **admin page** (`/en/admin`: approve, or ask for changes with a note the mover reads in the app) — and an example job request priced by the live quote. The role is saved once the code has proven the email; people can switch sides from the home screen (mover requests only after the setup is filled in and verified). The app remembers the side on the device and opens offline. Language: the phone's, or chosen with "EN ▾" in the top bar (kept on the device and saved with the account). Creating an account and resetting a password (both need an emailed code) work only against a local Supabase until the cloud project has email (a domain + SMTP). Sending the booking, paying and job requests not built yet |
| **Database** | Supabase (cloud, Ireland): `profiles`, `waitlist`, mover companies, documents, vehicles, rate cards and service areas (+ clearly marked test movers), all with row-level security |
| **Pricing** (`packages/pricing`, `supabase/functions/quote`) | Pricing engine + the live `quote` server function: real offers per vehicle class from each mover's own rate card (test movers for now), itemised, cheapest first; prices are shown exactly (to the cent; whole lek, denar and dinar) |
| **Address search for the app** (`supabase/functions/places`) | Photon (OpenStreetMap) on the server, like the website's own search — users' IP addresses never reach the geocoder; signed-in app users only |
| **Not built yet** | Sending the booking request, Stripe payments and payouts, job requests for movers, live GPS — see [`CLAUDE.md`](CLAUDE.md) §10 |

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

Works on Windows, macOS and Linux. There is no `npm run all`: `pnpm dev` starts everything (step 4).

### 1. Install the tools (once)

- **Node.js 24 LTS** (22.13 or newer also works) — https://nodejs.org. Check with `node -v`; with an older
  version the start stops and says so. With nvm or fnm, `nvm use` picks the version in `.nvmrc`.
- **pnpm 10** — the packages install only with pnpm (`npm install` and `yarn` stop with a message):
  - Windows: `npm install -g pnpm@10`
  - macOS / Linux: `corepack enable pnpm` (comes with Node 22 and 24) or `npm install -g pnpm@10`
  - other ways: https://pnpm.io/installation
- **Git**

On Windows, if PowerShell answers *"pnpm.ps1 cannot be loaded because running scripts is disabled"*, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use Command Prompt or Git Bash.

Optional: **Expo Go** on your phone (to open the app), and for creating accounts in the app (step 5)
**Docker** and the **Supabase CLI** — also used for database tests and migrations.

### 2. Get the code and install packages

```bash
git clone https://github.com/LavdrimXheladini/livritleht.git
cd livritleht
git switch develop
pnpm install
```

On Windows, clone into a short folder outside OneDrive (e.g. `C:\dev\livritleht`): OneDrive syncing
`node_modules` slows the install down and can lock files.

In VS Code, open **`movershub.code-workspace`** (File → Open Workspace from File…): the website and the app
show as separate folders, next to the shared code, database and tests.

### 3. Add the environment files

Copy [`.env.example`](.env.example) to these two files and fill in a Supabase URL with the publishable key
**of the same project** (the key is public by design; **never commit these files**):

| File | Variables |
|---|---|
| `web/app/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, optional `CONTACT_EMAIL`, optional `SUPABASE_SECRET_KEY` (server only — rate limits) |
| `mobile/app/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Which project:

- **The shared cloud project** — URL `https://nsczjynvatkfwmcnuaii.supabase.co`, key from the project owner.
  The website shows live prices from it. Creating accounts in the app doesn't work there yet (step 5).
- **Your own local Supabase** (step 5) — the URL and key that `supabase status` prints.

**Accounts live in the database they were created in.** An account made on another computer's local
Supabase doesn't exist on yours: create your own (step 5).

Without the files both still open — the website with labelled sample prices, the app with a "Not
connected" note — but signing in won't work. After changing `mobile/app/.env`, restart `pnpm dev:app`.

### 4. Start what you need

| Command | Opens |
|---|---|
| `pnpm dev:web` | Website → http://localhost:3000 |
| `pnpm dev:app` | The app (Expo, port 8081) — scan the QR code with Expo Go, or press `w` for the computer version in the browser. Creating an account needs the local Supabase for now — see 5 below |
| `pnpm dev` (or `pnpm start`) | Both at once (needs more memory) |

After `pnpm install`, `npm run dev:web` and the others work too. Every start runs `scripts/dev-prep.mjs`
first: it checks the Node version and that the packages are installed, regenerates the design-token CSS and
clears stale caches when dependencies or tokens changed. Don't bypass it with raw `next dev` / `expo start`.

On a machine with little free memory, run **one** app at a time.

**On a phone with Expo Go:** update Expo Go first (it must support Expo SDK 57). The phone needs to reach
the computer: same network, and the computer's firewall allows port 8081 (and 54321 for a local Supabase).
Some routers keep Wi-Fi devices apart — then turn on the computer's hotspot (Windows: Settings → Network &
internet → Mobile hotspot), connect the phone to it, and start the app with that address in the QR code:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.137.1 pnpm dev:app       # Git Bash, macOS, Linux
$env:REACT_NATIVE_PACKAGER_HOSTNAME="192.168.137.1"; pnpm dev:app   # PowerShell
```

(`192.168.137.1` is the usual Windows hotspot address; `ipconfig` / `ifconfig` shows yours.)

### 5. Create an account in the app (local Supabase, for now)

The cloud project's email sends a sign-in **link**, not a code, so until it has its own email (a domain +
SMTP) accounts can be created only against a local Supabase on your computer:

1. Install **Docker** (Windows and macOS: Docker Desktop, on Windows with WSL 2; Linux: Docker Engine) and
   the **Supabase CLI** (Windows: `scoop install supabase`; macOS and Linux: `brew install supabase/tap/supabase`;
   any system: `npx supabase …` instead of `supabase …`). Start Docker, then run `supabase start` in the project
   folder — the first start downloads images and needs several GB of memory. `supabase status` prints the
   local URL and publishable key.
2. Put that key in `mobile/app/.env` (and `web/app/.env.local`, for the website), with `EXPO_PUBLIC_SUPABASE_URL`
   set for where the app runs:
   - `http://127.0.0.1:54321` — the computer version in the browser (`w`) and the iOS simulator;
   - `http://10.0.2.2:54321` — the Android emulator (or run `adb reverse tcp:54321 tcp:54321` and keep 127.0.0.1);
   - `http://<your computer's address>:54321` — a phone with Expo Go (step 4: same network or hotspot;
     allow port 54321 through the firewall).
3. Run `pnpm functions:build`, and put `INCLUDE_TEST_MOVERS=true` in `supabase/functions/.env` (git-ignored) so
   the local `quote` function prices the test movers.
4. Create an account with any email: the code arrives in Mailpit, http://127.0.0.1:54324 (no real email is
   sent). Then choose a password (8+ characters, with a letter a–z and a digit) and sign in with email +
   password from then on; "Forgot password?" sends a code the same way, then asks for a new password.

`supabase stop` stops it and keeps the data for the next `supabase start`.

### When something doesn't work

| What you see | What to do |
|---|---|
| `MoversHub needs Node.js 22.13+, 24.3+ or newer` or `Unsupported engine` | Install Node.js 24 LTS, open a new terminal, run `pnpm install` again |
| `MoversHub installs with pnpm, not npm` or `Unsupported URL Type "workspace:"` | Install pnpm (step 1), then `pnpm install` |
| `The packages are not installed` | `pnpm install` in the project folder |
| `pnpm` not found / not recognized | Open a new terminal after installing it |
| `pnpm.ps1 cannot be loaded because running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt / Git Bash |
| Website: sample prices, and "Supabase env missing" in the terminal | Add `web/app/.env.local` (step 3) and restart |
| App: "Not connected" | Add `mobile/app/.env` (step 3) and restart `pnpm dev:app` |
| App: "Wrong email or password" with an account from another computer | Accounts exist only in the database they were made in — create your own (step 5) |
| Sign-in and prices fail although both files are there | The URL and the key must come from the same project (step 3); restart after fixing |
| Expo Go: the project is incompatible with this version | Update Expo Go from the app store |
| Expo Go keeps loading, or can't connect | Same network or the hotspot, firewall port 8081 (step 4) |
| Linux: `ENOSPC: System limit for number of file watchers reached` | `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |

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

`phone-verification` sends and checks a mover's phone code with Twilio Verify — project secrets `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` (a Verify service with SMS and WhatsApp). Without them it answers `503`, except for
the numbers in `PHONE_TEST_NUMBERS` (`+38344000001=123456,…`): those take that fixed code and get no message — for local work
(`supabase/functions/.env`) and testing; never list a number someone could own, and remove it before launch.
`company-registry` asks VIES, the Polish VAT white list and the Swiss UID register about a mover's tax number (no keys needed).
Both answer signed-in users only and are limited per account (`RATE_LIMITS`).

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
