# MoversHub — Design handoff (v1, Oct 2026)

Visual direction for the **web** (`apps/web`) marketing site + booking entry, and the **live tracking / ops dashboard**. Mobile apps (`apps/customer`, `apps/mover`) should reuse the same tokens.

> **Read `COMPLIANCE.md` first.** This prototype was made before the compliance rules were applied. Where the prototype and `COMPLIANCE.md` disagree, **COMPLIANCE.md wins** — see "Compliance deltas" below. Do not copy prototype numbers, prices or copy verbatim.

Live prototype (canvas, private to the owner): https://claude.ai/artifact/6PZkRQsA3yT8gjMLKnYKzK
Source of each screen: `design/prototype/*.dc.html` (reference only — readable HTML + a small JS class per screen; it needs the canvas runtime to run, so **re-implement in Next.js + Tailwind 4 + shadcn/ui**, don't import these files).

---

## 1. Direction

A mash-up of two references:
- **Light marketing pages** — calm, airy, centered: huge tight headlines, one-line subtitles, white rounded "sheets" stacked on a stone background, soft-shadow stat cards, a highlighted inline paragraph, a chart card, horizontal card rail, two-column FAQ.
- **Dark operations UI** — map-first dashboard: dark map with live vehicle markers, floating job card with gauges (speed, van load), compass, side list of jobs + items, "Van load" cargo grid view, progress timeline.

The two meet in the hero: the light page's hero image is replaced by a **dark live-map device** showing a van moving.

## 2. Tokens (proposed — `design/tokens.proposed.json`)

Palette (from the brand moodboard):

| Role | Hex | Use |
|---|---|---|
| Ink | `#0F0B09` | Text on light, dark frames |
| Deep green (brand) | `#2A3F39` | Primary buttons, selected states, chart line, footer |
| Sage | `#9FA996` | Secondary accents, fragile tag, unselected chart lines |
| Stone | `#D2CDBD` | Page background, light text on dark |
| Copper (accent) | `#B98350` | Live/active: moving van, progress, badges, "Accept job" |

Derived (needed for contrast — keep these, don't swap back to raw palette):
- Light copper `#D9A574` — copper **text/links** on dark green (raw copper fails 4.5:1 there).
- Light sage `#B4BCAA` — small secondary text on dark surfaces.
- Warm greys for body text on light: `#48423C`, `#554F48`, `#6B645C` (lightest allowed for small text).
- Surfaces light: `#FBF9F4` (cards), `#F6F3EC` (sheets), `#ECE8DD`, `#E2DDD0` (borders).
- Surfaces dark: `#0F0B09` (frame), `#16221F` (panels), `#1C2B27` (map), `#2C403A` (streets / raised), `#33483F` (borders).

Typography:
- Display: **Archivo** variable, `font-stretch: 118%`, weight 600, `letter-spacing: -0.045em`, line-height 0.95. Hero `clamp(44px, 7vw, 96px)`, section titles `clamp(34px, 4.4vw, 52px)`.
- Body/UI: **Geist** 400/500/600. Mono (IDs like `RT-2041`): **Geist Mono**.
- Load via `next/font/google`.

Shape: sheets radius 24px, cards 18–22px, inputs 14px, pills fully rounded. Shadows very soft: `0 30px 70px -30px rgba(0,0,0,.25)`.

## 3. Screens & components

### Web — landing (`/[lang]`)
1. **Nav** — left links (How it works · For movers · Markets · Live demo), centered logo mark + `MOVERSHUB` wordmark, right language switcher (EN/SQ/PL/DE via `@movershub/i18n`) + primary pill "Get a price".
2. **Hero** — headline "Move anything, wherever home is." + one-line subtitle.
3. **Quote widget** (card) — Pickup / Drop-off (Google Places autocomplete), swap button, **vehicle-class tiles** (name, typical vehicle, capacity chip, "from €X"), crew pills (driver / +1 / +2 helpers), summary (domestic/cross-border · km · duration) and primary CTA. After submit: dark confirmation strip with pulsing dot + link to tracking.
4. **Live map device** — dark rounded frame, map with dashed full route + copper travelled route, copper pulsing van marker, drop-off pin, floating mover card (avatar, company name, status badge, progress bar, speed / km left / ETA tiles), compass.
5. **"Built for real moves."** — 3 stat cards (tag pill, big word, line, italic note): Upfront / Live / By card.
6. **Inline story paragraph** — large text with underlined phrases; hover/focus turns a phrase ink-on-green and swaps the preview card below.
7. **Pricing chart card** — sentence with highlighted price, class tabs, line chart (price vs distance), distance slider, corridor pills underneath (clicking one loads that route into the quote widget).
8. **For movers** — 4 features with stroke icons + dark phone mockup of a job request (route mini-map, chips, payout, Decline / Accept job → accepted / declined states).
9. **Markets rail** — horizontally scrolling cards (dark map tile + tag + title + text + date placeholder): Kosovo (launch), Albania & North Macedonia, Poland, Diaspora routes.
10. **FAQ** — big title left, accordion right (+ icon rotates 45°).
11. **Footer** — deep green, waitlist email form, giant faded wordmark, links.

### Dashboard — live moves (customer tracking + `/admin` ops view)
- Icon rail · top stat pills · title + Map / Van load toggle.
- **Map panel**: all active jobs as markers (selected = copper, pulsing, bigger), routes, floating job card (ID in mono, status badge, route + progress, ETA, speed gauge arc, van-load "tank" gauge, cross-border notice), compass, zoom.
- **Van load view**: side-view van, 6×3 slot grid; slots colored per item (selected copper, fragile sage, free = dashed).
- **Side panel**: active jobs list (selectable rows w/ progress), items list (expand for size / volume / room, fragile note), "Call mover" + "Share live link".
- **Timeline**: Booked → Mover assigned → Picked up → On the way → Delivered.

## 4. Compliance deltas — MUST change when implementing

| Prototype | Implement instead | Rule |
|---|---|---|
| 4 classes (Small/Medium/Large/Box truck) with own capacities | The 5 classes `SMALL`, `VAN`, `LARGE_VAN`, `BOX`, `TRUCK` with names/loads from COMPLIANCE §1.1 | §1.1 |
| Client-side price formula (base + per km, "sample rates") | Server-side quote from each mover's rate card; tiles show **"from €X"** = lowest available mover quote in that class | §1.1, §13 |
| "Request movers" goes straight to sent | Before payment show the **specific mover + that mover's fixed total** (pick a mover or "Book best offer") | §1.1 |
| Pricing chart with platform curves | Keep the chart visual only as **illustrative "how prices are built"** or drive it from real "from €X" data — never a platform price list | §1.1 |
| Mover card shows a person's first name ("Arben K.") | "Your mover, [Company name]" + legal name / reg. no. on booking & receipt | §12, §13 |
| Phone mockup "You earn €X" | **"Payout €X"**, price from the mover's own card | §12 |
| Fee line "Price includes MoversHub's fee" | Itemize platform commission / booking fee transparently | §1 ALLOWED |
| Cross-border notice in dashboard | Also show customs documentation notice for non-EU Balkan routes; prices in EUR | §11 |
| Tracking runs in demo always | GPS only from `EN_ROUTE_TO_PICKUP` to `COMPLETED`/`CANCELLED`; share link expires when job ends | §13 |
| Pickup address visible in mover request | Hide customer address until mover accepts | §13 |
| Copy | Run all strings through the §12 banned-words test (no "our movers", "drivers", "salary", "MoversHub guarantees") | §12 |
| Placeholders `[LAUNCH DATE]`, `[CONTACT EMAIL]`, `[N]`, `€[X]`, claims process | Fill from real data / config; damage cover is an open item | §14 |

## 5. Suggested implementation order
1. Update `packages/ui/tokens.json` from `tokens.proposed.json` (keep `success/warning/danger`), wire into Tailwind 4 `@theme` on web and NativeWind config on mobile.
2. Fonts via `next/font`. Base shadcn/ui theme variables mapped to the tokens.
3. Landing sections as components in `apps/web/src/components/landing/*`, all strings in `@movershub/i18n`.
4. Quote widget wired to the real pricing endpoint (no client-side prices).
5. Tracking dashboard with `@vis.gl/react-google-maps` (dark map style JSON matching the dark tokens).
6. Playwright: visual smoke for each section + the §13 copy/pricing tests.
