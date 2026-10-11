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

Still open:
- "Date to be announced" until launch dates are set (instead of "[LAUNCH DATE]").
- Terms / Privacy footer links once those pages exist.
- "Open full dashboard →" once the dashboard exists (redesign step 5).
- Replace sample prices with real server quotes (pricing engine + `quote` function).
