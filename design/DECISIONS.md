# Design decisions (product owner, 2026-10-11)

The landing page must look like the prototype screenshots (`design/prototype/Main.dc.html`,
`Tracking.dc.html`, "Ranktrip Platform.pdf"). Where the prototype conflicts with `COMPLIANCE.md`,
these decisions apply:

| # | Topic | Decision |
|---|---|---|
| 1 | Vehicle classes | **5 classes** as in COMPLIANCE.md §1.1 (`SMALL`, `VAN`, `LARGE_VAN`, `BOX`, `TRUCK`) — not the prototype's 4. |
| 2 | Tile price | Big price like the design (**€97**) with a small **"from"** label above it (lowest mover offer in that class). |
| 3 | Banned wording (§12) | Compliant wording, same look: crew **"Mover only"** (not "Driver"), **"Payout €X"** (not "You earn"), **company name** on the live map (not "Arben K."), booking fee **shown separately** (not "Price includes Ranktrip's fee"). |
| 4 | Prices before the backend exists | Show **sample prices, clearly labelled** ("Sample rates for the demo — each mover sets their own price…"), computed on the server; replaced by real server quotes later. |
| 5 | Addresses & map (2026-10-11) | Pickup / drop-off are **address search** (not city lists); the hero shows a **real map** with the real road route. Free OpenStreetMap services for now (no Google billing yet); switch to Google later without UI changes. |

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
- Replace sample prices with real server quotes (pricing engine + `quote` function).

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
