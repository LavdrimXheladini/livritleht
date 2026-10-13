# Design decisions (product owner, 2026-10-11)

The landing page must look like the prototype screenshots (`design/prototype/Main.dc.html`,
`Tracking.dc.html`, "MoversHub Platform.pdf"). Where the prototype conflicts with `COMPLIANCE.md`,
these decisions apply:

| # | Topic | Decision |
|---|---|---|
| 1 | Vehicle classes | **5 classes** as in COMPLIANCE.md §1.1 (`SMALL`, `VAN`, `LARGE_VAN`, `BOX`, `TRUCK`) — not the prototype's 4. |
| 2 | Tile price | Big price like the design (**€97**) with a small **"from"** label above it (lowest mover offer in that class). |
| 3 | Banned wording (§12) | Compliant wording, same look: crew **"Mover only"** (not "Driver"), **"Payout €X"** (not "You earn"), **company name** on the live map (not "Arben K."), booking fee **shown separately** (not "Price includes MoversHub's fee"). |
| 4 | Prices before the backend exists | Show **sample prices, clearly labelled** ("Sample rates for the demo — each mover sets their own price…"), computed on the server; replaced by real server quotes later. |
| 5 | Addresses & map (2026-10-11) | Pickup / drop-off are **address search** (not city lists); the hero shows a **real map** with the real road route. Free OpenStreetMap services for now (no Google billing yet); switch to Google later without UI changes. |
| 6 | Booking fee (2026-10-11) | Amount **not decided yet**. Built as a setting (`BOOKING_FEE_RULE` in `packages/shared`: flat per currency or % of the mover's price), always shown as its own line; while it is `null` the line reads "to be announced" and nothing is charged. |
| 7 | Real prices, step 4 (2026-10-11) | Built in four parts, each reviewed: 4a pricing engine → 4b database tables + test movers → 4c `quote` function → 4d landing shows real "from €X". Development database = the **cloud project** (no Docker), with clearly marked test movers that are removed before launch. |
| 8 | Three apps, mandatory (2026-10-12) — **replaced by #15** | Like Lugg, the market leader: the platform is **always three apps** — the **website** (`web/app`: booking, service pages, tracking links, admin), the **customer app** (`mobile/customer`) and a separate **mover app** (`mobile/mover`). Every customer feature exists on the website and in the customer app; mover features live in the mover app. Open `movershub.code-workspace` in VS Code to see them as separate folders. |
| 9 | Prices per country (2026-10-12) | Every country has its own price level and currency (EUR in Kosovo/Germany/Austria, lek, denar, złoty, franc). Researched reference rates live in `packages/shared/src/market-rates.ts` — information only (COMPLIANCE §1): they pre-fill a new mover's card, which the mover reviews and saves, and they price the test movers. Movers always set their own rates. |
| 10 | Moves within one city (2026-10-12) | Local moves are first-class: same city, or ≤ 25 km in one country, shows as **Local**; neighbourhoods are shown instead of "Prishtina → Prishtina" ("Dardania → Velania"); popular routes include local ones. |
| 11 | Home page prices (2026-10-12) | Before the visitor lists items, the "from" prices assume a **typical load per van size at ground floor** (a few boxes · sofa + 10 boxes · studio · 2–3 rooms · house) — the recommended option, taken when the owner said "continue". Easy to change: `TYPICAL_LOADS` in `packages/shared/src/items.ts`. The note under the prices says so, and says when they come from test movers. |
| 12 | Phone apps, step 6 (2026-10-12) — **replaced by #15** | Both apps open on a **public home**, like the website: prices are public and sign-in is needed only to book (and SMS/email codes on real phones still need Twilio / SMTP). Customer app: hero + quote card with address search (`places` function) and live "from" prices. Mover app "MoversHub Partner" (dark): intro, an example request priced by the live quote, and after sign-in a setup checklist (company, documents, vans, rates, payouts — "coming next"). One UI kit in `mobile/core` mirrors the website's primitives and tokens. |
| 13 | Prices to the cent (2026-10-12) | A "from" price must **equal** the lowest mover quote (COMPLIANCE §13), so prices and payouts are never rounded for display — on the website and in both apps ("from €149.42"; whole amounts stay "€162"). Decision #2 keeps its look. |
| 14 | Whole lek, denar and dinar (2026-10-12) | Their hundredths are no longer used (no qindarka; deni coins withdrawn 2013; para gone since 2008), so the **server** prices them in whole units: every line of a quote, the commission, the payout and the booking fee (`roundToPriceStep` in `packages/shared/src/money.ts`, used by the pricing engine). The lines still add up exactly, and the shown price is the charged price. Euro, złoty and francs keep their cents. |
| 15 | Website to inform, one app to use (2026-10-13) | Replaces #8 and #12. **The website** says what MoversHub is, lets people **create an account as a customer or a mover**, and has the **download buttons**: iPhone, Android and the computer version (the app's web build, installable from the browser). It keeps the price preview; its button says "Get the app". Booking, tracking and payment happen **in the app**. The website still hosts what must be on the web: the public tracking-link page (COMPLIANCE §9.1), legal pages and "How ranking works" (§3, §8), and the admin panel. **One app** (`mobile/app`, "MoversHub") for customers and movers — two apps were harder to explain and to get people to install. It opens on **sign in / create account**; creating an account asks "I need a mover" or "I'm a mover"; the role is saved once the code has proven the email (`choose_role`, never from sign-up data) — an account without one is asked after signing in, and an email that already had the other kind of account is told so (switching sides: #16). After sign-in the role picks the customer side (prices, booking) or the dark mover side (setup, jobs). Every email gets the same answer on the sign-in screen (no account check). Sign-in by **email + 6-digit code** (since #17: email + password, a code only to confirm the email and to reset a password): the cloud project needs a domain + custom SMTP with code templates before anyone can create an account in the app against it — its built-in email sends only a link (phone codes dropped, no Twilio for sign-in). Background location is declared in the one app but asked only from movers, when a job starts — the store listings must explain it. |
| 16 | Switching sides (2026-10-13) | One account can be a customer and a mover: the home screen has **Switch to the mover side** / **Switch to the customer side** (`choose_role`; never to or from admin). Nothing is lost by switching. The mover side starts with the setup checklist: job requests come only once the company, documents, vans, rates and payouts are filled in and verified (COMPLIANCE §5, enforced in `quotable_vehicles`) — switching alone gives no work. An email that already had the other kind of account is told so after the code and pointed to the switch; the app never switches without being asked. The side is remembered on the device, so the app opens on it at once (and offline). |
| 17 | Email and password (2026-10-13) | Owner: a code only to prove the email, then people **choose a password** and sign in with **email + password**; **Forgot password?** emails a code to set a new one. **Every sign-in by code ends with choosing a password** — after "Create account" (a new account, or an address that already has one: no endless sign-in by code) and after "Forgot password?" — and until it is chosen the app shows nothing else, also after a restart (kept on the device, not in the account's metadata, which whoever creates a login can write). On the server, a password set before the address was proven is cleared when the owner confirms it (migration 20261013120000), so nobody can plant a password on someone else's address. Rules: at least 8 characters with a letter a–z and a digit, at most 72 bytes — Supabase Auth checks them (`minimum_password_length` 8, `password_requirements` letters_digits: set the same in the cloud project) and the app checks them first. Every address gets the same answers: a wrong password and an unknown address say the same, and "Forgot password?" / "Create account" show the code screen also when Supabase Auth refuses a second email to an existing address within a minute (its API itself still answers differently there; only a server in between could hide that). Emails: "Your MoversHub code" (confirm, or sign in) and "Reset your MoversHub password", with the code (local templates; the cloud needs custom SMTP, step 4). The website's sign-in follows in its step 2, the same way. |
| 18 | Language in the app (2026-10-13) | The app starts in the phone's language (English when it isn't one of the five) and can be switched any time with **"EN ▾"** in the top bar — on the sign-in screens and on both homes, like the website's language menu (languages in their own names: English, Shqip, Polski, Srpski, Deutsch). The choice applies at once, is kept on the device (also after signing out — a preference, not personal data) and, when someone is signed in, saved with their account (`profiles.locale`) for the messages they get later. |

## Landing page status

Done (2026-10-11):
- Pickup / drop-off as **address search** (Photon via our server); road distance from OSRM; real dark
  map (MapLibre + OpenFreeMap) with the route and moving van. Corridor pills load city centres.
- Sample prices for the real road distance, computed server-side (`lib/landing-example.ts`,
  `app/[lang]/quote-action.ts`); the browser only sends places, never prices.
- Tiles: small "from" + big price; summary "Domestic · ≈78 km · ≈2 h" + big "from €162";
  note "Sample rates for the demo …" with the booking fee listed separately.
- Mover phone, hero live map and pricing chart **mirror the quote built above**.
- Chart class tabs use short names (Small / Van / Large / Box / Truck).
- Prototype copy restored where §12 allows ("Our diaspora corridors", "That's the whole
  calculation.", "per vehicle class", FAQ answers).

- "Open full dashboard →" on the hero map links to the Live moves dashboard (below).

Still open:
- "Date to be announced" until launch dates are set (instead of "[LAUNCH DATE]").
- Terms / Privacy footer links once those pages exist.

## Planned: services directory (owner request, 2026-10-12)

A Lugg-style grid of use cases ("Move your home", "Furniture delivery", "Marketplace pickup", "Move a
large item", …), built **in this platform**, not a separate one — Lugg itself is one platform: website
with a page per service, customer app, separate mover app. Plan:
- Website: the grid on the landing page + one page per service under `/[lang]/services/[slug]` (SEO,
  5 languages). Each tile opens the booking with the job type / vehicle class / items pre-filled, so it
  comes **after the booking flow** (build order step 4).
- App, customer side: the same list as the "What are you moving?" start screen.
- Adapt to our markets: diaspora moves (DE/AT/CH ↔ Balkans) and cross-border as their own tiles;
  marketplace pickups for the local sites (e.g. OLX, Merr, Facebook Marketplace).
- Check before adding: junk removal (waste-transport permits), labour-only help without a vehicle (not
  in the job model), donations (needs partners). Never "Uber for movers" or similar wording (COMPLIANCE §12).

## Live moves dashboard status

Done (2026-10-11) — `/[lang]/live`, layout of `Tracking.dc.html` on **simulated data** (labelled
"Simulated data", not indexed by search engines). Three sample jobs by sample movers; road routes and
distances are real, prices use the landing's sample rates (decision #4), all built on the server
(`lib/live-demo.ts`). Map, job card (speed / van-load gauges), Van load view, active jobs, items,
Call / Share, timeline, Pause / Play.

Changed from the prototype:

| Prototype | Implemented | Rule |
|---|---|---|
| Person names ("Arben K.", "Driton M.") | Mover **company** names ("Example Moving Co.") | §4, §12, decision #3 |
| "Medium van" (4 classes) | The 5 classes ("Van") | §1.1, decision #1 |
| Timeline "Booked · Paid by card" | "Booked · Card saved · charged after the move" | §6 (charge at completion) |
| "Mover assigned" | "Mover accepted" — movers accept jobs, they are not assigned | §2, §12 |
| "Cross-border · customs docs checked · 15% fee" | "Cross-border · customs documents needed (non-EU) · 15% commission"; EU-only routes show no customs line | §11 |
| "Today's GMV €[X]", "Movers online [N]" | "Today's booking value" and online count computed from the sample jobs | §14 placeholders |
| "Map preview — Google Maps in the app" | Real map (MapLibre + OpenFreeMap), credit shown as the licence requires | decision #5 |
| Status always "On the way" | Follows the job states: Loading (AT_PICKUP) → On the way (IN_TRANSIT) → At drop-off | CLAUDE.md §5 |
| Rail: Bookings / Movers / Payouts / Settings | Shown but disabled ("coming soon") until those pages exist; rail is a top row on phones | — |
| "Call mover" / "Share live link" | Demo notes: real calls go to the mover company; real tracking links expire when the job ends | §9.1 |

Still open:
- Real data: the customer view at `/t/[token]` (build order step 7) and the ops view under `/admin`
  (step 9, admin login) replace the simulation.
- Speed on the job card is display-only: with real data it must never feed ratings, ranking or
  discipline of movers (§9.1).

## Phone apps (step 6) status

Since 2026-10-13 the two apps are **one app**, `mobile/app` (decision #15): the customer app's screens and the mover app's
screens behind one sign in / create account. The notes below are from when they were two.

Done (2026-10-12) — both apps restyled to the design (customer light, mover dark), reviewed by five
reviewers with every finding checked by three independent checkers; the 20 confirmed findings are fixed:
- Errors on dark screens use `danger-on-dark` (#ef8a80, 8:1 on night) instead of the light-screen red (3.5:1).
- Screen readers hear errors (sign-in fields, quote errors) through `useAnnouncement` — the web's
  `role="alert"` does nothing on iOS / Android — and stale prices are marked busy while a new route is quoted.
- One class per property in the UI kit (`cx` doesn't merge classes the way the website's `cn` does).
- The apps get their own shadows (`nativeShadow` in tokens.json: one layer + Android elevation).
- Address search: "Done" / Enter only takes a suggestion for what is typed now (also on the website).
- The `places` function never logs the typed address.

Still open:
- App sign-in against the cloud project needs SMTP with a code template (a domain + an email provider) — for everyone, not only on real phones. Until then: the local Supabase.
- ~~Lek, denar and dinar prices with decimals~~ — done: whole units on the server (decision #14).

## Tests (step 7) status

Done (2026-10-12):
- **Screenshot tests**, still and offline (no motion, maps show their drawn fallback, a saved quote for the apps):
  `pnpm e2e:visual` — the website: landing in all 5 languages on a phone, English on a laptop, the live
  dashboard (phone + laptop), sign-in; `pnpm e2e:apps` — then both apps in their browser preview: customer home and
  sign-in error, mover home (English + Albanian), accepted example, dark sign-in error. Since 2026-10-13 (#15) it
  is the one app: sign in and its error, create account (role needed, kept out of the code request), the role
  saved after the code or chosen after sign-in, an existing account told so, small phones, sign out, customer
  home, mover home (English + Albanian), accepted example. Saved pictures are per operating system (ours:
  Windows); CI (Linux) doesn't run them yet.
- **COMPLIANCE.md §13 map**: [`COMPLIANCE-TESTS.md`](../COMPLIANCE-TESTS.md) names the tests for each required
  rule, or the build step that brings the feature (today 4 covered, 7 partly, 12 not built yet). `pnpm test`
  fails when a rule is missing there or a named test disappears.
- **New tests where the features exist**, found by an audit of every §13 rule: each mover's offer comes from
  their own card (no cap, rates read fresh, every line = rate × quantity live), price-like fields from the
  client are rejected, insurance / CMR / tachograph / licence / Stripe each block on their own, the 2.5 t rule,
  legal name on every offer, street never shown to movers before accepting, account deletion keeps a mover's
  company records, and the banned-wording check now catches §12 in all five languages (and in the sign-in
  email / SMS).

Still open:
- Linux pictures for CI: generate them once in CI (or Docker — ask first), then CI can run the screenshot tests.
- Most of §13 waits for booking, job offers, GPS, payments, reviews, admin and DAC7 — see COMPLIANCE-TESTS.md.
- **Vehicle weight is self-declared** (found by the audit): a mover can set `max_weight_kg` to 2,500 or less
  without any check, and vans up to 2.5 t need no tachograph or operator licence for cross-border jobs
  (COMPLIANCE §5, §11). To decide with mover onboarding (step 2): e.g. an admin checks the weight against
  the vehicle registration document, and changing it sends the vehicle back to verification.

## Real prices (step 4) — open items

- **Cabotage rule (needs the lawyer's OK):** a job inside one country is offered only to movers registered in that country; a
  cross-border job only to movers registered in the pickup or drop-off country (`quotable_vehicles`, COMPLIANCE-TODO §14).
- Step 4d done: the home page shows live "from" prices from the `quote` function (movers' own rate cards, a typical
  load per class, offers count, local currency); the labelled sample rates remain as the fallback and for offline tests
  (`QUOTE_SOURCE=sample`). The pricing chart below stays an illustrative example (sample rates), as the design allows.
- Test movers are quoted only while the project secret `INCLUDE_TEST_MOVERS` is `true`; switch it off and delete them before launch.
