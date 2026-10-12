# COMPLIANCE.md — Legal rules for the MoversHub codebase

> **For Claude Code / AI agents:** Read this file before building or changing any feature that touches pricing, job assignment, payments, mover accounts, customer bookings, ratings, personal data, or deactivation. These rules are product requirements, not suggestions. If a requested feature would break a **MUST NOT** rule, stop, explain which rule it breaks, and propose a compliant alternative. Do not silently implement it.
>
> Status: October 2026. This is a compliance guide, not legal advice. Rules marked ⚠️ are still moving (laws being written) — check with the lawyer before finalizing.

---

## 0. The one principle everything follows

**MoversHub is a pure middleman (marketplace).** It connects customers with independent movers. It does **not** move anything, does **not** employ movers, does **not** own vans, does **not** hold customer money, and is **not** liable for damaged items. The mover is the service provider and the carrier.

Every rule below exists to keep that position legally true. If the code makes the platform *look like* or *act like* the mover or the employer, the platform loses that protection.

Laws behind this: EU Platform Work Directive 2024/2831, Digital Services Act (Reg. 2022/2065), P2B Regulation 2019/1150, Consumer Rights Directive (as amended by Omnibus 2019/2161), PSD2 / upcoming PSR, DAC7 (Directive 2021/514), GDPR, CJEU Uber ruling C-434/15, CMR Convention. Non-EU Balkan countries (Kosovo, Serbia, Albania, BiH, North Macedonia, Montenegro) have their own GDPR-style and consumer laws — build to EU standard everywhere.

---

## 1. Pricing

**MUST**
- Each mover sets their **own rate card** (hourly rate, per-km rate, helper rate, minimum fee, extras). Store rate cards per mover.
- The app may only **calculate** a total from the chosen mover's rate card (distance × their per-km, hours × their hourly, etc.).
- Movers can edit their rates at any time.
- Show the customer which mover's prices produced the quote.

**MUST NOT**
- ❌ Set a platform-wide price, fixed fare, or price table that movers must use.
- ❌ Set a **maximum** price movers can charge (this was a key reason Uber was classified as a transport company).
- ❌ Change a mover's price without their action (no automatic discounts taken from mover earnings without their opt-in).
- ❌ Dynamic/surge pricing applied to the mover's price by the platform. If surge exists, it must be an opt-in multiplier the mover sets themselves.

**ALLOWED**
- Platform commission (20% domestic / 15% cross-border) and a separate customer booking fee — shown transparently.
- Showing movers *suggested* or *average market* rates as information only.
- Platform-funded promotions (discount paid from the platform's commission, mover still receives full payout).

### 1.1 Vehicle-class pricing (Lugg-style UX, mover-set rates)

The customer experience is like Lugg: pick a vehicle class, see an upfront price, book. The difference: **the numbers come from movers' own rate cards, never from a platform price list.**

**Vehicle classes** (platform defines the categories only, not the prices):

| Class | Typical vehicle | Approx. load | Use for |
|---|---|---|---|
| `SMALL` | Car / small van (Caddy, Berlingo) | ≤ 3 m³ | Boxes, luggage, small furniture |
| `VAN` | Mid van (Transit Custom, Vivaro) | ~6 m³ | Sofa, fridge, a few large items |
| `LARGE_VAN` | Large van (Sprinter, Ducato, Crafter) | ~12–15 m³ | Studio / 1-room flat |
| `BOX` | Box van / Luton with tail lift, ≤ 3.5 t | ~18–22 m³ | 2–3 room flat |
| `TRUCK` | Truck > 3.5 t | 30 m³+ | Houses, offices (needs licence check) |

**MUST**
- Each mover registers their vehicles with a class, and sets **their own rate card per vehicle**: `base_fee`, `per_km`, `per_labor_minute` (per helper count), `min_price`, extras (`floor_without_lift`, `heavy_item`, `assembly`, `long_distance_per_km`).
- Quote = calculated server-side from that mover's rate card (see CLAUDE.md → Pricing engine). Never trust a price from the client.
- Vehicle-class screen shows the **price range ("from €X")** across available movers in that class, computed from their rate cards.
- Before payment, the customer sees the **specific mover and that mover's fixed total**. The customer either picks a mover from the list, or taps "Book best offer" (cheapest/highest-rated available mover) — the chosen mover and price are shown before confirming.
- The mover sees job details + the price (from their own card) **before** accepting.
- The quoted total is the **price the customer pays**, unless the job changes (see 1.2).
- Distance = route distance between stops from the maps API at quote time; traffic and detours never change the price.

**MUST NOT**
- ❌ One platform price per vehicle class that all movers must accept.
- ❌ Defaulting a mover's rates without their confirmation. Suggested default rates may be **pre-filled** at onboarding, but the mover must review and save them.
- ❌ Showing the customer a different price than the mover's card produces (except platform-funded promos and the platform booking fee, both itemized).

### 1.2 Price adjustment (job differs from the description)

**MUST**
- If the job is materially different (more items, no lift, extra stop), the mover submits an **adjustment request** in-app: new amount + reason + photo.
- The customer **approves or rejects** in-app. No change is charged without approval.
- If rejected, the mover may cancel without penalty; customer gets refund rules per the cancellation policy.
- Store every adjustment with timestamps for disputes.

---

## 2. Job assignment and mover freedom

**MUST**
- Movers **accept or decline** each job freely.
- Customers choose the mover, OR a job is offered to several movers and any can accept.
- Movers choose their own working hours and service areas, and can go offline anytime.
- Movers may work for other platforms and their own clients (no exclusivity).

**MUST NOT**
- ❌ Auto-assign a job to a mover without their acceptance.
- ❌ Penalize declining: no lower ranking, no reduced job offers, no fines, no "acceptance rate" thresholds that trigger consequences.
- ❌ Require minimum hours, shifts, or availability.
- ❌ Require uniforms, platform branding on vans, or platform-supplied equipment.
- ❌ Dictate how the work is done (e.g., mandatory step-by-step instructions on how to load, routes they must take).
- ❌ Exclusivity clauses or non-compete for movers.

**ALLOWED**
- Customer requirements shown on the job (stairs, floor, items, time window) — that's the customer's order, not platform control.
- Live location sharing **during an active job only**, for the customer's benefit.
- Quality standards tied to customer outcomes (ratings, damage claims), applied fairly and transparently.

---

## 3. Ratings, ranking and deactivation

**MUST**
- Publish the **main ranking parameters** (e.g., distance, rating, price, availability) in the mover terms AND in a public "How ranking works" page for customers.
- If paid placement ever exists, disclose it to customers and movers.
- Any suspension/deactivation: give the mover a **written statement of reasons**, and **30 days' notice** for termination (except for serious violations: fraud, illegal activity, repeated serious breaches — still give reasons).
- A **human must review** every suspension or deactivation decision before it takes effect. The algorithm may only *flag*.
- Mover complaint system: movers can appeal any restriction, suspension, or termination in-app.
- Changes to mover terms: notify by email/in-app at least **15 days** before they take effect; mover can terminate if they disagree.

**MUST NOT**
- ❌ Automatic deactivation by algorithm alone (rating below X → auto-ban).
- ❌ Secret ranking factors, or ranking that punishes declining jobs.
- ❌ Process mover emotional state, private conversations, or any data outside of active work for scoring.

---

## 4. Mover identity — the mover must always be visible as the provider

**MUST**
- Every booking screen, confirmation, receipt, and email shows: **mover's legal/company name, registration number, address, contact, and terms**.
- Before payment, show clearly: **"Your contract for this move is with [Mover company name]. MoversHub is the booking platform."**
- Show whether the provider is a business (trader) — and the consumer rights that apply.
- Show the mover's verified insurance on their profile and on the booking.

**MUST NOT**
- ❌ Hide the mover's identity until after payment.
- ❌ Copy that says "MoversHub will move your stuff", "our movers", "our team", "our vans", "MoversHub guarantees your move". Use "movers on MoversHub", "your mover".
- ❌ Platform-branded invoices for the move service. The move invoice is from the mover; MoversHub invoices only its own commission/booking fee (with VAT).

---

## 5. Mover onboarding (KYB) — required before a mover can take jobs

**MUST collect and store before activation** (DSA Art. 30 + DAC7):
- Legal name, address, phone, email
- ID document (for individuals) / company registration extract (for companies)
- Company registration number and **tax ID (VAT/NIP/NIPT)**
- Bank account for payouts (handled by payment provider — do not store raw account numbers in our DB)
- Self-certification that they only offer legal services
- **Carrier liability insurance** certificate with expiry date (OC przewoźnika in Poland)
- For cross-border jobs: **CMR insurance**, EU operator licence where required, vehicle class (under / over 2.5 t), and **smart tachograph** confirmation for 2.5–3.5 t vans
- Vehicle(s): plate, type, capacity

**MUST**
- Make reasonable efforts to verify (document check, registry lookup).
- Block job acceptance if insurance is missing or **expired**; send reminders 30/14/3 days before expiry.
- Block cross-border jobs for movers without cross-border documents.
- Suspend movers who don't provide required info (with reasons + appeal, per section 3).
- Prefer business accounts (companies/sole traders) over private individuals.

**Data model must support:** `mover.legal_name`, `registration_no`, `tax_id`, `address`, `is_business`, `insurance_doc`, `insurance_expires_at`, `cmr_doc`, `cmr_expires_at`, `vehicles[]` (weight class, tachograph), `verification_status`, `self_certification_at`.

---

## 6. Payments

**Provider: Stripe Connect.** Stripe is the licensed provider that holds and splits funds.

**MUST**
- MoversHub's platform account is registered in a **Stripe-supported country** (Stripe does not support Kosovo-registered businesses; Poland is the default plan).
- Movers onboard as **Stripe Connect Express** accounts. Stripe does their KYC; we store only the `stripe_account_id` and onboarding status.
- A mover cannot accept paid jobs until `charges_enabled` / `payouts_enabled` (or transfers capability) is true.
- **At booking:** save the customer's card with a **SetupIntent** (`usage: off_session`), so the later charge is covered by a mandate and doesn't need new 3D Secure. Do not charge yet.
- **At completion:** create the PaymentIntent off-session for the agreed total (+ approved adjustments), with the platform commission as `application_fee_amount` and the mover as the transfer destination.
- **Payout release:** after the customer confirms completion, or automatically after 48 h with no dispute.
- If the off-session charge fails (card expired, needs authentication), notify the customer to pay in-app; the mover is not paid from platform funds.
- Use **Stripe webhooks** as the source of truth for payment state (`payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.dispute.created`). Verify webhook signatures. Make handlers idempotent.
- The in-app receipt clearly states the move was provided by the mover (the card statement will show the platform name).
- MoversHub issues a VAT invoice **only for its commission/booking fee** (Stripe Tax or invoicing tool).
- ⚠️ Movers in countries Stripe can't pay out to (check Kosovo, Montenegro) cannot be onboarded for card payments until a solution is chosen — see section 14.

**MUST NOT**
- ❌ Receive customer money into a MoversHub bank account and pay movers later.
- ❌ Build a custom wallet, balance, escrow, or stored-value system.
- ❌ Store card numbers, IBANs, or bank credentials in our database. Use provider tokens/IDs only.
- ❌ Let movers collect cash and "settle later" unless the mover has prepaid the commission (Balkans exception — needs explicit product decision and lawyer review).

---

## 7. Damage, disputes and insurance

**MUST**
- Liability for goods belongs to the **mover** (carrier). Terms must say so.
- Photo **check-in at pickup** and **check-out at drop-off**, timestamped, stored with the job.
- Dispute flow: customer files claim → routed to mover and mover's insurer → platform mediates.
- Platform may hold the mover's future payouts while a claim is open (must be in mover terms).
- Optional extra cover: only sold **through a licensed insurance partner**; insurer carries the risk.

**MUST NOT**
- ❌ Promise "MoversHub covers any damage" or a platform-funded guarantee unless approved by the lawyer.
- ❌ Sell insurance directly as MoversHub.

---

## 8. Customer consumer rights

**MUST**
- Clear total price incl. VAT before payment, broken down (mover price, booking fee, extras).
- Cancellation policy shown before booking (set per mover or platform default — must be shown).
- Mention that a move booked for a specific date is generally exempt from the 14-day withdrawal right (services for a specific date) — wording to be confirmed by the lawyer.
- Reviews: label whether reviews are verified (only customers with a completed job can review). Do not delete negative reviews except for policy violations.
- Customer complaint channel and contact info visible.
- Plain-language terms, available in the user's language (EN, PL, SQ, SR/HR/BS minimum as markets launch).

**MUST NOT**
- ❌ Fake reviews, seeded ratings, or hiding/suppressing negative reviews.
- ❌ Dark patterns: pre-ticked add-ons, fake scarcity ("only 1 mover left!" unless true), hidden fees revealed at the last step.

---

## 9. Personal data (GDPR / Kosovo Law 06/L-082 / local equivalents)

**MUST**
- Privacy policy for customers AND movers; inform movers their data is reported to tax authorities (DAC7).
- Collect only what's needed (data minimisation).
- **Location tracking only during an active job** (from "on the way" to "completed"). No background tracking when offline.
- Retention limits: e.g., job photos deleted X months after job completion unless a claim is open; define in `retention.config`.
- Users can export and delete their data (right of access/erasure), except where legally required to keep (tax/accounting records).
- Cookie consent banner for the web app; analytics off until consent.
- Encrypt ID documents and insurance files at rest; restrict access by role.
- Data breach procedure documented.

**MUST NOT**
- ❌ Share customer addresses with movers before they accept the job (show district/area until accepted).
- ❌ Use customer or mover data for unrelated purposes without consent.
- ❌ Store ID document images in public buckets.

---

## 9.1 Map and GPS tracking

**MUST**
- Customer app/web shows a **map** with: pickup and drop-off pins, route line, and during an active job the mover's live position and ETA.
- Mover app sends GPS **only while a job is active**: starts at status `EN_ROUTE_TO_PICKUP`, stops at `COMPLETED` or `CANCELLED`. A visible indicator shows the mover that tracking is on.
- Mover sees a clear permission explanation before the OS location prompt ("We share your location with the customer only during an active job").
- Customer can share a **tracking link** (web page, no login) with other people. Links use an unguessable token and **expire** when the job ends.
- Live positions are sent over a realtime channel; only sparse breadcrumbs (e.g., every 60 s) are stored, and deleted after the retention period unless a dispute is open.
- Customer exact address is hidden from movers until they accept (district only on the job offer map).

**MUST NOT**
- ❌ Track movers when offline, between jobs, or when the app is idle.
- ❌ Use GPS data to score, rank, or discipline movers (e.g., "drove slowly", "took a break"). Location is for the customer's tracking and dispute evidence only.
- ❌ Show a mover's home location or past routes to customers.

---

## 10. Tax reporting (DAC7)

**MUST**
- Store per mover per year: total payouts, number of jobs, commissions/fees withheld, per quarter.
- Provide an annual export for tax reporting (deadline: 31 January for previous year).
- Store mover tax residency.

---

## 11. Cross-border jobs

**MUST**
- Only offer cross-border jobs to movers with verified CMR insurance + licence + tachograph status (see section 5).
- Prefer/flag vans under 2.5 t for small cross-border loads.
- For routes into non-EU Balkan countries: show customs documentation notice; customs help as a paid add-on.
- Prices for corridor jobs in EUR.

---

## 12. Copy and UX wording rules (quick reference)

| ✅ Use | ❌ Never use |
|---|---|
| "Movers on MoversHub" | "Our movers" / "MoversHub movers" |
| "Your mover, [Company name]" | "MoversHub will move you" |
| "Book with a mover" | "Hire MoversHub" |
| "Mover's price" | "Our price" / "MoversHub price" |
| "Partners" / "Movers" | "Drivers" / "Workers" / "Staff" / "Employees" |
| "Payout" | "Salary" / "Wage" |
| "Accept job" | "Assigned to you" |
| "Mover's insurance covers..." | "MoversHub covers / guarantees..." |

---

## 13. Required test coverage (Playwright / API tests)

Every rule above should have at least one automated test. Minimum set:

- [ ] Quote total equals mover's own rate card calculation; no platform price cap applied.
- [ ] Mover can change rates; next quote uses new rates.
- [ ] Mover can decline a job; ranking and future offers unchanged after declining.
- [ ] No job is assigned without mover acceptance.
- [ ] Booking page, confirmation email, and receipt all show mover legal name, registration no., and "contract is with [Mover]".
- [ ] Mover without insurance / with expired insurance cannot accept jobs.
- [ ] Mover without CMR/tachograph data cannot see cross-border jobs.
- [ ] Customer address is hidden until mover accepts.
- [ ] Location tracking stops when the job is completed.
- [ ] Payout is only released after completion confirmation; no funds hit platform-owned accounts.
- [ ] Algorithm flag does not deactivate; deactivation requires admin action with a reason text.
- [ ] Mover receives notice + reason on suspension; appeal form works.
- [ ] Only customers with completed jobs can leave reviews.
- [ ] No banned words from section 12 appear in UI strings (lint/test the i18n files).
- [ ] Data export and account deletion work for customers and movers.
- [ ] Vehicle-class "from €X" equals the lowest available mover quote in that class.
- [ ] Price shown before payment equals the server-calculated quote for that mover; tampered client price is rejected.
- [ ] Price adjustment is not charged unless the customer approves.
- [ ] GPS updates start only at `EN_ROUTE_TO_PICKUP` and stop at `COMPLETED`/`CANCELLED`.
- [ ] Shared tracking link stops working after the job ends.
- [ ] Mover without completed Stripe onboarding cannot accept paid jobs.
- [ ] Stripe webhook handlers are idempotent (same event twice → one state change).
- [ ] DAC7 export produces correct yearly totals per mover.

---

## 14. Open items — ask before building ⚠️

- Poland's Platform Work Act (transposing the EU Directive, deadline 2 Dec 2026): final wording not published yet. Re-check sections 1–3 when it is.
- EU Payment Services Regulation (PSR): commercial-agent exemption narrowing; first obligations expected H2 2027. Keep using a licensed provider and this stays safe.
- Company registration: Stripe does not support Kosovo-registered businesses, so the platform entity must be in a Stripe-supported country (Poland planned). Confirm with the lawyer + accountant (VAT, DAC7 authority).
- Stripe payouts to movers in Kosovo (and possibly Montenegro): not supported directly. Options to evaluate: movers with a company/bank in a supported country, a second payout provider (e.g., Wise), or cash with prepaid commission.
- Cash payments in the Balkans.
- Exact cancellation/withdrawal-right wording per country.
- Platform-funded guarantee / damage cover.
- Retention periods per data category (`retention.config`): photos, breadcrumbs, mover documents, tax/accounting records.

If a task depends on any open item, implement it behind a feature flag and leave a `// COMPLIANCE-TODO:` comment referencing this section.
