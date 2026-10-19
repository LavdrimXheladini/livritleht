# Paying movers in Kosovo and beyond: alternatives to Stripe and Paysera

> **Status (19 Oct 2026): research only — no provider is chosen yet.** COMPLIANCE.md §6 and CLAUDE.md §7 still describe the Stripe design; they change only after the owner decides (with the lawyer and accountant). Prices and country lists are as read on 18–19 Oct 2026 and can change.

*For the MoversHub owner · 19 October 2026. Based on providers' own pages, price lists and regulators' registers, read 18–19 October 2026. This is not legal advice: anything marked "lawyer" needs one. "(unverified)" means we couldn't confirm it on an official page. "Estimate", "guess" and "our suggestion" are ours. The glossary at the end explains the payment terms.*

## 1. Short answer

### The real problem
- Stripe won't open an account for a Kosovo company. It also can't pay movers in Kosovo, Albania, North Macedonia, Serbia, Montenegro or Bosnia ([Stripe countries](https://stripe.com/global), [cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)). COMPLIANCE §6 names only Kosovo and Montenegro, but the gap covers all six countries.
- The other big European providers have the same gap: Adyen, Checkout.com, Mollie, Airwallex and Viva.com.
- A split payment divides one customer payment between the mover and MoversHub. We found no provider that offers split payments to a company registered in Kosovo. A few providers don't say either way.
- Every option that keeps the purpose of §6 (a licensed provider collects, holds and splits the money) needs a company in the EEA, which is the EU plus Norway, Iceland and Liechtenstein. Mangopay and Stripe accept the planned Polish company. Paysera's splits need a Lithuanian, Latvian or Estonian one. §6 itself is written for Stripe, so its wording has to change for any other provider.

### About Paysera
- Paysera is expensive mainly **for a Kosovo company**:
  - Its price list "for Kosovo clients" shows a flat 2.9% on Mastercard and Maestro. Paysera also publishes rates that fall with volume: 1.45% → 1.25% on EU cards and 2.90% → 2.50% on non-EU cards such as Kosovo's. It doesn't say which list applies to a Kosovo company, so ask. On the Munich example, that is EUR 18.69 against EUR 8.63–9.85.
  - As published, it offers no Visa: Visa is listed only for companies registered in the EU. Confirm this with Paysera.
  - It charges EUR 3 for each SEPA transfer in or out.
  - It may charge EUR 20–300 a month, depending on how it classes you.
  - It holds back 100% of each card payment for 3 days and 5% for 3 months. This applies to every Paysera card merchant.

  Sources: [card fees](https://www.paysera-ks.com/v2/en-XK/fees/payment-gateway-with-payment-cards-fees), [Visa rule](https://www.paysera-ks.com/v2/en-XK/payment-gateway-checkout), [account fees](https://www.paysera-ks.com/v2/en-XK/fees/account-management-and-identification-business).
- A company in an EEA country gets Paysera's volume-based card prices, which are normal. Above 750 payments or EUR 37,500 a month, Paysera negotiates.
- The bigger problem is what Paysera does, not its price:
  - It splits payments only for companies registered in **Lithuania, Latvia or Estonia**.
  - It pays a split only into a Paysera account or a bank account in the EEA.
  - It pays the mover **the moment the customer pays**. It does not hold the money until the move is done.

  Sources: [split rules](https://developers.paysera.com/guides/checkout-modern/concepts/split-payments), [who can use splits](https://www.paysera.com/v2/en-GB/payment-gateway-checkout). With a Kosovo company, MoversHub would receive all the money and pay movers itself, which §6 forbids.
- **On public prices, no provider that can legally pay Kosovo movers is clearly cheaper than Paysera's volume-based rates.**
  - Card fees on the full price are 1.25–3.25% everywhere.
  - Every payout to a Kosovo bank goes by SWIFT and costs several euros, because Kosovo isn't in SEPA.
  - So leaving Paysera-with-a-Kosovo-company is mainly about splitting and holding the money legally.
  - MoversHub's costs drop the most when only its own money goes through a card (the stop-gap below).

### What to pursue, in order

**1. Mangopay, through an EEA company: the main candidate.**
- **What it is:** a Luxembourg e-money institution built for marketplaces. An e-money institution is a company licensed to hold other people's money.
- **Why:** it is the only licensed provider we found whose documentation allows sellers, their bank accounts and payouts in Kosovo and in every other Balkan target country ([country list](https://docs.mangopay.com/guides/users/country-restrictions); we checked it again on 19 Oct 2026).
  - It also covers Poland (PLN, BLIK), Germany and Austria (EUR) and Switzerland (CHF, TWINT).
  - The customer's money waits in a Mangopay wallet in the customer's name, with no time limit, until MoversHub confirms the move. Customers don't sign up to Mangopay or pass an identity check. MoversHub's server creates the wallet, and it works like a holding account in the customer's name.
  - That keeps the purpose of §6: a licensed provider holds the money and splits it. One provider could serve every market.
- **Unknowns:**
  - Prices are given only on request.
  - A moving marketplace may fall under the transport businesses Mangopay restricts or prohibits.
  - EUR payouts to Kosovo banks go by SWIFT, the international transfer system, and we don't know the fee. That fee decides whether Mangopay is cheaper than Paysera (section 3).
  - Movers whose identity documents come from outside the EEA must use a passport.
  - The customer would pay at booking, up to 60 days before the move (see Decisions below).
- **First steps:**
  - Fill in **"Contact sales" at [mangopay.com/contact](https://mangopay.com/contact)**. Send a one-page description of MoversHub and the questions in section 5, and ask first for a written yes or no on a moving marketplace.
  - At the same time, put lawyer question 1 in section 5 to a Kosovo payments lawyer. Send it in writing to the Central Bank of Kosovo as well.
  - Before registering a company, ask the accountant whether it should be Polish, as planned, or in a eurozone country such as Lithuania (Decision 1). Mangopay only signs contracts with companies in the EEA or the UK ([source](https://docs.mangopay.com/support)).
- **Rough timing (estimate):** weeks to months for the contract, Mangopay's compliance review and the build.

**2. Only if Kosovo must launch before Mangopay is ready: a stop-gap where the customer pays the mover directly.**
In both versions, MoversHub never touches the mover's money. Section 4.3 compares them.
- **Prepaid commission:** the mover pays MoversHub's commission in advance. The customer pays the booking fee online and the mover's full price on the day. §6 already allows this as the "Balkans exception" (MUST NOT #4), if you decide so and a lawyer approves. Prices look as they do today.
- **Fee-only:** at booking, the customer pays MoversHub's commission and booking fee online. On the day, they pay the mover the rest. §6 would have to be rewritten, and prices would look different.
- **Why:**
  - It works in every country as soon as the company and its card account exist, whether the company is in Kosovo or the EEA. One caveat: with a Kosovo company on Paysera, a Visa card may be refused, as published.
  - It is the cheapest option for MoversHub: about EUR 0.35–2.10 in payment fees on the Prishtina example, because only MoversHub's own money goes through a card.
  - Overall, it is cheapest only when the mover is paid in cash. On the mover's own card terminal, the mover pays about 1.3–2.8%. A transfer from a German bank to Kosovo costs the customer EUR 5–25 (guess).
- **The catch:**
  - Neither version meets the §6 MUST rules for the mover's share: a licensed provider must collect, hold and split the whole amount, and check identity.
  - Customers lose card protection on what they pay the mover.
  - Movers' cancellation fees can't be collected through the app.
  - Mover and customer can more easily skip the app next time.
- **First step:** decide whether you want a stop-gap at all. Our suggestion: decide if Mangopay hasn't confirmed in writing within 4–6 weeks, or if the Kosovo launch comes sooner. If yes, choose the version and send the lawyer the questions in section 5 before anything is built. Building it takes about 1–2 weeks once the company and its card account exist (estimate).

**3. Keep Stripe Connect for movers in Poland, Germany, Austria and Switzerland.**
- **Why:** this is the design already planned: save the card at booking, charge it after the move, take the platform fee, and pay the mover after the customer confirms. You can sign up online, there is no minimum, and Stripe checks the movers' identity.
- **The catch:** it can't pay any mover in the six Balkan countries, so you only need it if Mangopay can't cover the EU side at a similar price. An account that runs in PLN pays 1–2% extra on every EUR booking; a eurozone company avoids that.
- **First step:** there is nothing to build now. Once the company exists, open a Stripe account in its country and ask [Stripe sales](https://stripe.com/contact/sales) the questions in section 5.

### Backups if Mangopay says no
- **Paysera with a Lithuanian, Latvian or Estonian company**, with movers holding Paysera accounts. If you register in Lithuania anyway, no second company is needed; with a Polish company it would be a second one. It works only if Paysera confirms three things:
  - a saved card can be charged, with the split, when the customer confirms the move;
  - Paysera accounts in Kosovo and Albania can receive splits;
  - what a split costs.
- **Lemonway**, a French payment institution. It considers movers from outside the EEA case by case. It costs EUR 5,490 to set up plus EUR 840 a month, and it has no BLIK.
- **Long shots, worth one email each** (section 5 says where to start):
  - Airwallex: "withdrawal accounts" for the Balkans.
  - Worldline for Platforms (OPP): it holds each payment until release and pays out for free. Ask whether it accepts sellers with Albanian, Montenegrin, North Macedonian or Serbian bank accounts (all four countries are in SEPA), or with Kosovo ones.
  - Monri WSPay MarketPlace.
  - Ecommpay and Unlimit (leads only, not researched).

### Don't do this
Don't collect customers' money into a MoversHub account (at Paysera, a Kosovo bank or Revolut) and then send movers their share by bank transfer, Wise or Payoneer.
- It looks cheap: Wise sends euros to a Kosovo bank for EUR 5.69.
- But it is exactly what §6 forbids. In both Kosovo and Poland it would probably count as an unlicensed payment service (Kosovo Law 10/L-026 Art. 28; EU PSD2 recital 11).
- COMPLIANCE §14 lists Wise as an option to evaluate, but Wise can only be used in this forbidden way.

### Decisions only you can make (each also needs a lawyer or accountant)
1. **Which company, and where.** Mangopay and Stripe need an EEA company, and the planned Polish one works. A eurozone company, for example a Lithuanian one, may fit better:
   - Most bookings are expected in EUR (Kosovo, Montenegro and the Germany and Austria corridor).
   - On a Stripe account that runs in PLN, every EUR booking costs 1–2% extra; a eurozone company avoids that ([Stripe pricing](https://stripe.com/en-pl/pricing)).
   - Paysera's splits, the backup, are open only to Lithuanian, Latvian and Estonian companies.

   Ask the accountant before registering. A Kosovo company fits only the stop-gap.
2. **Charge at booking instead of "save the card, charge after the move".** Mangopay documents no way to save a card at booking and charge it once, up to 60 days later. So the customer would pay at booking, or when the mover accepts if Mangopay allows that, and Mangopay would hold the money until the move is done. §6 currently says "Do not charge yet".
3. **Whether to allow a stop-gap in Kosovo, and which version** (prepaid commission or fee-only).

### Timing
- Kosovo is not yet in SEPA, Europe's cheap system for euro bank transfers.
- Kosovo's parliament passed the last law needed in mid-October 2026, but the central bank still has to file the final application ([CBK, 17 Oct 2026](https://bqk-kos.org/news/bqk-miratimi-i-ligjit-per-aml-cft-hap-rrugen-per-hapat-e-fundit-per-finalizimin-e-aplikimit-te-kosoves-ne-sepa/?lang=en)).
- Our estimate: cheap SEPA payouts to Kosovo banks late 2027 at the earliest, more likely 2028.
- Until then, every euro payout from an EU provider to a Kosovo bank is a SWIFT transfer with fees.
- Rough durations (estimates):
  - Stop-gap: 1–2 weeks of building once the company and its card account exist.
  - Mangopay: weeks to months.
  - Stripe: depends on the company, its bank account and Stripe's review (not verified).

---

## 2. Every provider researched

**In one line each:**
- **Mangopay:** the main candidate. It is the only provider that documents paying movers in Kosovo and every Balkan target country.
- **Stripe Connect:** good for movers in Poland, Germany, Austria and Switzerland only.
- **Paysera with a Lithuanian, Latvian or Estonian company:** a backup. It splits payments, but pays the mover at once instead of holding the money.
- **Lemonway:** a backup. It accepts movers from outside the EEA only case by case, and its fixed costs are high.
- **Airwallex, Mollie:** EU side only. Ask Airwallex about the Balkans.
- **Worldline/OPP, Monri:** worth one email each.
- **PayU, Przelewy24, Tpay, Autopay:** Poland only.
- **Everyone else:** no (section 6).

How to read the tables:
- **Yes / No / Partly / Unclear** answer each question for MoversHub.
- **"§6 breach"** means it only works if MoversHub holds customers' money.
- **Fees** are list prices. "Not public" means you have to ask sales.
- **Fit** means fit for MoversHub, not in general.

### A. Marketplace providers (they collect, split and pay out)

| Provider | Kosovo company? | Needs EEA company? | Pays movers in Kosovo? | Pays movers in AL, MK, RS? | Split + holds money until the move is done? | Saves the card for a later charge? | Fees (cards · payouts · monthly) | Fit |
|---|---|---|---|---|---|---|---|---|
| **Mangopay** (Luxembourg e-money institution) | No | Yes (EEA or UK; the Polish or a Lithuanian company would do) | **Yes**: EUR by SWIFT, if it's in the contract | **Yes, EUR only** (no ALL/MKD/RSD); SEPA or SWIFT: ask | Yes: money waits in the customer's wallet, no time limit | Partly: not documented; plan to charge at booking (ask about pre-authorising) | Not public. Only public hint: 1.8% + €0.18 per card payment, €0.25 per payout (third-party, undated, unverified). SWIFT fee and monthly fee: ask | **Good**, if Mangopay's answers are right |
| **Stripe Connect Express** (Irish e-money institution) | No | Yes | No | No | Yes: up to 90 days | Yes (cards; BLIK up to PLN 2,000) | EEA cards 1.5% + 1 zł · non-EEA cards (incl. Kosovo) 3.25% + 1 zł · BLIK 1.6% + 1 zł · +1–2% on EUR bookings with a PLN account (how it's calculated: unverified; a eurozone account avoids it) · payout 0.25% + 1.35 zł · 9 zł per mover paid that month · no minimum | **Good for PL/DE/AT/CH only** |
| Mollie Connect (Dutch e-money institution) | No | Yes (EEA, UK or CH) | No | No | Yes: up to 90 days | Partly (cards yes; BLIK, P24, TWINT no) | PL card 1.20% + PLN 1 · BLIK 1.30% + PLN 0.50 · EEA cards 1.80% + €0.25 · non-EEA 3.25% + €0.25 · marketplace fees not public (third-party: €5 per mover, €1.75 per active mover a month, 0.2%; unverified). **Business movers only** | Possible (EU side only) |
| Airwallex (Dutch/Lithuanian e-money institution) | No | Yes | No (only from MoversHub's own wallet: §6 breach) | Only "ledger" accounts that the platform owns (§6 breach); "withdrawal accounts" only by special approval: ask | Yes, MoversHub releases the money; where unreleased money sits is undocumented (ask: §6 risk if it's MoversHub's own wallet) | Yes | EEA cards 1.30% + €0.25 · non-EEA 3.15% + €0.25 · platform fees not public · SWIFT €10–20 | Possible (EU side only) |
| Lemonway (French payment institution) | Unclear (case by case at best) | Preferred (EEA); others case by case | Case by case (€9 "international" payout) | Case by case | Yes (customer's payment account) | No for changing amounts; card hold only 1–6 days | Card 1.10% + €0.25 · payout €0.50 Europe / €9 international · €5,490 setup · €840 a month · ID checks €0.40–0.80 per account per month | Possible (backup) |
| Adyen for Platforms (Dutch bank) | No | Yes | No | No | Yes | Yes | €0.11 + interchange++ + 0.60% on cards · BLIK 1.5% · minimum monthly invoice (amount not public) | No |
| Checkout.com Platforms (French e-money institution) | No | Yes | No | No | Split yes; hold unclear | Unclear | Not public | No |
| Worldline for Platforms / OPP (Dutch payment institution) | Unclear | Yes | Unclear (says EU + UK) | Unclear | Yes (escrow per payment) | Partly | €0.15 + interchange++ + 0.60% · payouts free · €5 per business checked · escrow price on request | No as a main option; one email about Balkan accounts |
| Nuvei for Platforms | Unclear | Yes | No | Accepts sellers in Serbia (and Montenegro and Bosnia) but documents no way to pay them; Albania and North Macedonia not listed | Yes (60 days by default) | Depends on the card provider used | Not public; licence for the platform product unclear | No |
| Rapyd (Icelandic e-money institution) | No | Yes | No (Kosovo not listed) | Partly (EUR bank payouts listed; seller wallets unclear) | Yes (escrow 1–90 days) | Yes | Interchange++ + a quoted fee · payouts not public | No |
| Viva.com (Greek bank) | No | Yes | No | No | Money sits in MoversHub's own platform account (§6 risk) | Partly | DE: 2.19% + €0.10 · PL: BLIK 1.40%, P24 1.95%, cards 2.19% + PLN 0.24 · non-EEA: interchange++ + 1.20–2.00% · €0–19.99 a month | No |
| Trustap (Irish; runs on Stripe) | No | Yes | No | No | Yes | Unclear | 4–5% + $0.30–0.40 · $50–499 a month · +1.5% across regions | No |
| HiPay (French payment institution) | Unclear | MoversHub must become its agent or get a licence | Unclear | Unclear | Yes | Unclear | Not public | No |
| PayPal / Braintree | No (Kosovo is not a PayPal country) | Partly | No | AL, RS: PayPal wallet only · MK: can't receive money | Partly (28 days at most) | Partly | PL: wallet 2.90% + 1.35 zł · cards 1.90% + 1.35 zł · +1.99% for non-EEA cards | No |
| Swan (French e-money institution) | No | Partly | No | No | No marketplace payments | n/a | Not researched | No |

### B. Payout-only services (they pay out of MoversHub's own balance)

| Provider | Kosovo company? | Needs EEA company? | Pays movers in Kosovo? | Pays movers in AL, MK, RS? | Split + hold? | Saves card? | Fees | Fit |
|---|---|---|---|---|---|---|---|---|
| Stripe Global Payouts | No | Needs a UK or US company (not offered to Poland) | No | Bank wires in local currency (from US senders) | No: MoversHub holds the money (§6 breach) | Through Stripe Payments | 1% cross-border + up to 2% currency exchange · wires USD 25 | No |
| Wise Business | Unclear (probably no) | Yes | Technically yes (€5.69 by SWIFT with shared fees, €25.70 with OUR), but a §6 breach | Technically yes (local currency), but a §6 breach | No | No (doesn't take cards) | €5.69 to Kosovo · PLN 3.48 within Poland · 255 PLN one-off | No (fine for MoversHub's own bills) |
| Payoneer | Unclear | Yes | Third-party sources say yes; §6 breach | Unclear | No | No (its checkout is only for US/HK companies) | Mover withdraws for 1.2–4% · MoversHub's fees not public | No |
| Revolut Business | Unclear (probably no) | Yes | Only MoversHub's own transfers: §6 breach | Same | No | Unclear | Unverified (pages blocked) | No |
| Skrill / Paysafe | Unclear (third-party: no) | Unclear | Unclear | Unclear | Partly (MoversHub would become a "payment facilitator") | Unclear | Not researched | No |

### C. Kosovo and Balkan providers

| Provider | Kosovo company? | Needs EEA company? | Pays movers in Kosovo? | Pays movers in AL, MK, RS? | Split + hold? | Saves card? | Fees | Fit |
|---|---|---|---|---|---|---|---|---|
| **Paysera with a Kosovo company** (your baseline) | Yes | No | Only as MoversHub's own transfers (€1 each): §6 breach | Same | No split, no hold | Partly (saved card for fixed schedules only) | Mastercard/Maestro 2.9% flat, as published for Kosovo clients (whether the volume-based rates apply instead: ask) · Visa only for EU-registered companies, as published (confirm) · activation €20–50 · €3 per SEPA transfer · 100% held back 3 days + 5% for 3 months · maybe €100 + €20 a month or €300 a month, depending on risk class | No (no split) |
| Paysera with a Lithuanian, Latvian or Estonian company | No | Yes: Lithuania, Latvia or Estonia only | Partly: into the mover's Paysera account (bank accounts must be in the EEA); whether a Paysera Kosovo account can receive splits is undocumented | Partly (Paysera accounts; extra checks for RS, ME and MK; Bosnian businesses not supported) | Split yes; **no hold** (split at payment) | Partly (saved card after a first payment; with a split: undocumented) | EU cards 1.45% → 1.25% · non-EU 2.90% → 2.50% (falls with volume; negotiated above 750 payments or EUR 37,500 a month) · split fee not public · €5 a month | Possible (backup) |
| POK (Albanian e-money institution) | Unclear | Unclear | No (not authorised in Kosovo) | Albania only, to POK merchants | Partly (one recipient, by %) | Unclear | Not public | No |
| Kosovo banks (NLB, BKT, Raiffeisen, ProCredit, TEB) | Yes | No | Only as MoversHub's own transfers: §6 breach | No | No | Partly (BKT and NLB save cards) | NLB: 3% on NLB cards, 5% on others, €150 setup · BKT: €170 + €19.90 a month + % by agreement · others not public | No (OK for MoversHub's own fee in the stop-gap) |
| Kosovo non-bank payment firms (IBAS, OneFor, Swinto and others) | Yes | No | No such product (Swinto and OneFor advertise SEPA transfers: possibly a payout account for movers, ask) | No | No | No | Not public | No |
| Monri / WSPay MarketPlace (Croatia) | Unclear | Partly | Unclear | Unclear | Partly (advertises payouts to sellers); hold unclear | Partly | €380 a year + €50 per mover + a per-payment fee by contract · card fees set by the bank | Unclear: one sales call |
| Payten, CorvusPay, AllSecure, Bankart | Only through a bank | n/a | No | No | No | Partly | Set by the bank | No |

### D. Providers for Poland, Germany and Austria

| Provider | Kosovo company? | Needs EEA company? | Pays movers in Kosovo? | Pays movers in AL, MK, RS? | Split + hold? | Saves card? | Fees | Fit |
|---|---|---|---|---|---|---|---|---|
| PayU Marketplace (Polish payment institution) | Unclear | Yes (Polish) | Unclear (foreign sellers possible; no country list) | Unclear | Split yes; MoversHub triggers the payouts | Partly | Cards 1.49% + PLN 0.30 · BLIK 1.49% + PLN 0.32 · payouts, refunds, chargebacks PLN 0 · marketplace price on request | Possible (Poland only; accepts private persons) |
| Przelewy24 Marketplace (Poland) | Unclear | Yes | Unclear | Unclear | Split yes; hold unclear | Partly | 1.29% + PLN 0.30 · marketplace terms through sales | Possible (Poland only) |
| Tpay (Poland) | Unclear | Yes | **No** (its terms forbid paying recipients outside the EU) | No | Split yes; hold by agreement | Partly | 1.59% + PLN 0.39–0.41, or PLN 99 a month + 0.99% | Possible (Poland only) |
| Autopay (Poland) | Unclear | Yes | Unclear | Unclear | Split yes; paid out the next day | Unclear | Not public | No |
| Unzer (Germany) | Unclear | Partly | Unclear | Unclear | Split yes; hold unclear | Unclear | Not public · no BLIK | No |
| Nexi Checkout | No | Nordic countries only | No | No | No split | Unclear | n/a | No |

### E. Ways of handling the money (models, not providers)

| Model | How it works | COMPLIANCE §6 | Fit |
|---|---|---|---|
| Provider holds the money (the Mangopay route) | A licensed provider charges the customer at booking, holds the money, and releases it to the mover at confirmation or after 48 h | Fits what §6 is for; the Stripe-specific wording must change | **Shortlisted (1)** |
| Prepaid commission | The customer pays the mover directly; the mover pays MoversHub's commission in advance (credits, or per job when accepting it) | Already allowed as the "Balkans exception" (MUST NOT #4), with your decision and a lawyer. The lawyer must also confirm the credits aren't the "balance or stored value" MUST NOT #2 forbids. Credits usable only for MoversHub's own fees are not e-money (Kosovo Law 10/L-026 definition 1.49) | **Shortlisted (2)**, temporary |
| Fee-only | The customer pays MoversHub's commission and booking fee online, and pays the mover the rest on the day | Breaks no MUST NOT (lawyer to confirm), but the MUST rules aren't met, so §6 must be rewritten | **Shortlisted (2)**, temporary |
| Monthly commission invoice | The customer pays the mover; MoversHub bills movers each month | Breaks the MUST NOT on "settle later"; risk that movers don't pay | No |
| MoversHub sells the move (merchant of record) | MoversHub is the seller and pays the mover as a subcontractor | Breaks §0, §4, §6 and §7; VAT on the full price (+EUR 18.30 on S1) | No |
| Kosovo small-institution waiver (Law 10/L-026 Art. 24) | A Kosovo MoversHub company registers with the central bank (up to EUR 3m a month) and holds and splits the money itself | Breaks MUST NOT #2 (no own escrow) and §0 | No (lawyer question for later) |
| MoversHub as a registered agent of a licensed provider (Kosovo Art. 38(6), or in the EU) | MoversHub acts for a licensed provider, with the money in that provider's protected account | Gives MoversHub its own regulatory status, against the pure-middleman position (§0, §14) | No (lawyer question for later) |

---

## 3. What the three sample moves would cost

### Assumptions
- **S1, Prishtina local move:** EUR 155 (mover 150 + booking fee 5), paid with a Kosovo-issued Visa debit card (a non-EU card). Commission EUR 30; EUR 120 paid to the mover's Kosovo bank. MoversHub keeps EUR 35.
- **S2, Munich → Prishtina:** EUR 610 (600 + 10), paid with a German consumer Mastercard. Commission EUR 90; EUR 510 paid to a Kosovo mover. MoversHub keeps EUR 100.
- **S3, Warsaw local move:** PLN 620 (600 + 20), paid by BLIK. Commission PLN 120; PLN 480 paid to a Polish mover. MoversHub keeps PLN 140.
- Exchange rate: EUR 1 = PLN 4.37 (Wise mid-market rate, 19 Oct 2026).
- **What "cost" covers:** every provider fee between the customer's payment and the money reaching the mover's bank. Fees the mover's own bank charges to receive money are not included (not researched). For the stop-gaps, the table shows MoversHub's own payment cost. What moving the mover's share costs is shown separately below the table.
- **How percentages are shown:** as a share of the customer's payment. The second table shows costs as a share of what MoversHub keeps, because with most providers MoversHub pays the fees out of its commission.
- **Paysera:** ranges run from its best published rate (1.25% on EU cards, 2.50% on non-EU cards) to its lowest-volume rate (1.45% / 2.90%) or the flat 2.9% "Kosovo clients" price.
  - At about 200 moves a month (EUR 40–60k, our estimate) you would pass Paysera's last published tier (750 payments or EUR 37,500 per 30 days). Above it, Paysera negotiates.
  - Paysera's pages show EUR 0.15 per card payment as a minimum in one place and as an add-on in another. We treat it as a minimum (ask).
  - For the Lithuanian/Latvian/Estonian setup, we assume the mover withdraws from a Paysera Kosovo account to a Kosovo bank for €1. Whether that account can receive splits is unverified.
- **Mangopay:** prices are not public.
  - The card figure uses the only public hint, 1.8% + €0.18 (third-party, undated, **unverified**). The real price is likely higher for non-EU cards.
  - The S3 range runs from that figure to 2.5% + €0.25 (also unverified), plus a €0.25 payout.
  - The SWIFT payout fee is unknown.
- **Stripe:**
  - We assume a €0.25 fixed fee on EUR charges.
  - On a Polish account that runs in PLN, we add 1–2% currency cost to EUR bookings (how Stripe calculates this is unverified). A eurozone company would avoid it.
  - The upper figure also includes the 0.25% "funds routing" fee, the cross-border payout fee, and 9 zł for each mover paid that month.
- **Stop-gaps:**
  - Prepaid commission: movers top up their commission in blocks, so fixed per-payment fees are spread thin. The booking fee is charged to the customer's card at booking.
  - Fee-only: the commission and booking fee are charged to the customer's card at booking.

### Cost per move

| Option | S1 Prishtina, EUR 155 | S2 Munich → Prishtina, EUR 610 | S3 Warsaw, PLN 620 |
|---|---|---|---|
| **Paysera with a Kosovo company** (baseline: the whole payment goes through Paysera and MoversHub pays the mover itself, which breaks §6) | EUR 4.88–5.50 (3.1–3.5%): card 2.5–2.9% + €1 transfer to the mover. As published, the Visa card may be refused | EUR 8.63–18.69 (1.4–3.1%): card 1.25–1.45% if the volume-based rates apply to a Kosovo company, 2.9% if the flat "Kosovo clients" price applies; + €1 transfer | Not offered |
| **Paysera with a Lithuanian/Latvian/Estonian company**, split payment, mover holds a Paysera account | EUR 4.88–5.50 (3.1–3.5%) + split fee (not public) | EUR 8.63–9.85 (1.4–1.6%) + split fee | No route that meets §6: BLIK isn't available, and Przelewy24 without a split costs ≈ PLN 13.53 (2.2%) |
| **1. Mangopay** (indicative only) | Card ≈ EUR 2.97 (1.9%) + SWIFT payout (not public; see break-even below) | Card ≈ EUR 11.16 (1.8%) + SWIFT payout (not public) | ≈ PLN 13.0–17.7 (2.1–2.9%), including the payout |
| **2. Stop-gap, prepaid commission:** Polish company + Stripe (MoversHub's money only) | ≈ EUR 1.4–2.1 (0.9–1.4%) | ≈ EUR 3.4–5.4 (0.6–0.9%) | ≈ PLN 3.4 (0.5%) |
| **2. Stop-gap, prepaid commission:** Kosovo company + Paysera Kosovo | ≈ EUR 0.45–1.02 (0.3–0.7%) | ≈ EUR 1.05–2.90 (0.2–0.5%) | Not offered |
| **2. Stop-gap, fee-only:** Polish company + Stripe | EUR 1.39–2.09 (0.9–1.3%) | EUR 1.75–3.75 (0.3–0.6%) | PLN 3.24 (0.5%) |
| **2. Stop-gap, fee-only:** Kosovo company + Paysera Kosovo | EUR 0.35 by bank link, EUR 0.88–1.02 by Mastercard (0.2–0.7%); Visa: ask | EUR 1.25–2.90 (0.2–0.5%) | Not offered |
| **3. Stripe Connect** | **Not possible** (no payouts to Kosovo). With a mover registered in the EU it would be EUR 7.45–11.66 (4.8–7.5%) | **Not possible** with a Kosovo mover. With a German or Austrian mover: EUR 17.08–27.79 (2.8–4.6%), or EUR 10.98–15.59 (1.8–2.6%) if EUR costs nothing extra | PLN 13.47–23.67 (2.2–3.8%) |

**What the mover's share costs in the stop-gaps.** The customer or the mover pays this, not MoversHub:
- With prepaid commission, the customer pays the mover the full price (EUR 150 / EUR 600 / PLN 600). With fee-only, the customer pays the mover the rest (EUR 120 / EUR 510 / PLN 480).
- In cash: nothing.
- On the mover's own card terminal from a Kosovo bank: about 1.3–2.8% (NLB 1.30–2.80%, BKT 1.50%), paid by the mover. On S1 that is about EUR 1.56–3.36 on EUR 120 (fee-only) or EUR 1.95–4.20 on EUR 150 (prepaid commission).
- By bank transfer from Germany to a Kosovo bank (S2): a SWIFT transfer, paid by the customer. The sender's fee isn't public (guess: EUR 5–25).
- In Poland (S3): about PLN 0 by BLIK or bank transfer.
- So the stop-gaps are the cheapest option for MoversHub, but cheapest overall only when the mover is paid in cash.

**SWIFT decides whether Mangopay is cheaper than Paysera.** Kosovo is not in SEPA, so every euro payout to a Kosovo bank is an international transfer.
- On S1, Mangopay (card ≈ EUR 2.97 on the public hint) beats the Paysera baseline (EUR 4.88–5.50) only if the SWIFT payout costs less than about EUR 1.90–2.50 per job.
- On S2, Mangopay's card fee alone (≈ EUR 11.16) is already above Paysera's volume-based price (EUR 8.63–9.85 with the transfer). There, Mangopay is cheaper only if Paysera's flat 2.9% applies to your Kosovo company, or if Mangopay quotes below the hint.
- Other providers charge per SWIFT transfer: EUR 5.69 (Wise), EUR 7 (Paysera; EUR 10 from 2027) or EUR 10–20 (Airwallex). At those prices, one payout per job would bring S1 to EUR 8.66–22.97 in total. That is 25–66% of MoversHub's EUR 35.
- Batching helps. If one SWIFT payout cost EUR 10 and covered four jobs (EUR 2.50 a job), S1 would come to about EUR 5.47, level with Paysera.
- Who pays the SWIFT fee:
  - With shared fees (SHA, Mangopay's default), banks along the way deduct part of the fee from the mover's EUR 120.
  - With OUR, MoversHub pays all of it and the mover gets the full amount. But OUR can cost much more: at Wise, EUR 25.70 instead of EUR 5.69.
- **Our suggestion:** ask Mangopay to pay each mover weekly from their wallet, and ask for both the SHA and OUR prices. Prefer OUR if its price is acceptable, so movers aren't surprised by deductions.
- **A possible way around SWIFT (ask):** Mangopay's payouts guide picks SEPA or SWIFT by the recipient's country and currency. If that means the bank account's country, a Kosovo mover with a euro account in a SEPA country would be paid by cheap SEPA.
  - Candidate: a Paysera account. Paysera's Kosovo price list charges Kosovo business clients EUR 3 to receive a SEPA transfer, but doesn't say which country the account's IBAN belongs to.
  - Candidates: Swinto and OneFor, Kosovo e-money firms that advertise SEPA transfers (IBAN country not stated).
  - Ask Mangopay and these firms.

### Cost as a share of what MoversHub keeps

| Option | S1 (of EUR 35) | S2 (of EUR 100) | S3 (of PLN 140) |
|---|---|---|---|
| Paysera, Kosovo company | 13.9–15.7% | 8.6–18.7% | n/a |
| Paysera, Lithuanian/Latvian/Estonian company | 13.9–15.7% + split fee | 8.6–9.9% + split fee | n/a |
| Mangopay (indicative) | 8.5% + SWIFT | 11.2% + SWIFT | 9.3–12.6% |
| Prepaid commission, Stripe | 4.0–6.0% | 3.4–5.4% | 2.4% |
| Prepaid commission, Paysera Kosovo | 1.3–2.9% | 1.1–2.9% | n/a |
| Fee-only, Stripe | 4.0–6.0% | 1.8–3.8% | 2.3% |
| Fee-only, Paysera Kosovo | 1.0–2.9% | 1.3–2.9% | n/a |
| Stripe Connect | not possible (21–33% with an EU mover) | not possible (17–28% with an EU mover) | 9.6–16.9% |

### One-off and monthly costs

| Option | One-off | Monthly |
|---|---|---|
| Paysera, Kosovo company | Activation €20–50 | €0 above €2,500 of sales a month. Possibly €20 (+€100 to open) or €300 if Paysera classes you as a financial-services or high-risk client: ask |
| Paysera, Lithuanian/Latvian/Estonian company | None | €5 for the account |
| Mangopay | Ask | Ask (third-party mentions of €49 or "from €249" a month; unverified) |
| Stripe Connect | None | 9 zł (≈ €2.06) for each mover paid that month |
| Stop-gaps (either version) with Stripe | None | None |
| Stop-gaps with Paysera Kosovo | Activation €20–50 | As for the Kosovo company above |
| Lemonway (backup) | €5,490 | €840 (≈ €4.20 per move at 200 moves) + ID-check fees |

**Bottom line on price:**
- On public prices, no option that can legally split and hold the money is clearly cheaper than Paysera's volume-based rates. Mangopay's hint is cheaper on Kosovo cards and dearer on EU cards, and its SWIFT fee is still unknown.
- What makes Paysera look expensive is mostly:
  - the flat 2.9% "Kosovo clients" price (if it applies);
  - possible monthly fees;
  - the EUR 3 SEPA transfers;
  - the money held back.

  Ask Paysera which prices apply before ruling it out on price alone. Even at its best price, though, a Kosovo company gets no split, so the §6 problem remains.
- The stop-gaps are the cheapest option for MoversHub, because only MoversHub's own money goes through a card. That isn't a free saving: it costs customer protection and needs your decision on §6.

---

## 4. What each option means for MoversHub

**Very little payment code exists yet**, so changing provider now mostly means renaming a few Stripe-specific pieces. What exists today:
- two Stripe columns on `mover_companies` (`stripe_account_id`, `stripe_onboarding_complete`);
- the "payouts ready" check in `quotable_vehicles`;
- "STRIPE (build step 8)" comments in the job-day functions (charge at COMPLETED, cancellation fee, payout release).

**Texts to update with any change:** the customer terms, privacy policy and mover terms, plus several app and website strings in every language, name Stripe. They also say the card is "charged after the move" or promise "no cash". The privacy policy must name the new provider as a recipient of personal data.

### 4.1 Mangopay

| Part of today's design (Stripe) | With Mangopay |
|---|---|
| **Save the card at booking** (SetupIntent), don't charge | Charge the full price at booking, with one 3-D Secure check. The money goes into a Mangopay wallet in the customer's name, which MoversHub's server creates. The customer doesn't sign up to Mangopay or pass an identity check. In plain terms: someone who books in March for a May move pays in March, and if they cancel, they get a refund instead of never being charged. Ask two things. First, can the card be pre-authorised at booking and captured only when the mover accepts? Offers expire within 12 hours, and Mangopay's pre-authorisations last 6.5 or about 30 days. Second, is a zero-amount first payment followed by one later charge allowed? |
| **Charge after the move** (off-session) | No charge at completion; the money is released instead (below). |
| **Mover declines, offer expires, or mover cancels** | Today these send the job back to QUOTED, or end it, at no cost to anyone. Once the customer has paid, each one needs a full refund from their wallet (the money never left Mangopay). Alternatively, if the customer agrees, the money waits for their next choice of mover and the difference is charged or refunded. Ask whether Mangopay returns its card fee on refunds (Stripe doesn't). |
| **Platform fee** (`application_fee_amount`) | When the money is released, Mangopay moves it from the customer's wallet to the mover's wallet. It takes MoversHub's commission and booking fee as "Fees" into MoversHub's Fees wallet, deducts its own monthly invoice there, and pays MoversHub the rest. |
| **Payout after confirmation or 48 h** | The wallet-to-wallet transfer happens when the customer confirms, or after 48 h. Mangopay then pays the mover's bank, per job or weekly; weekly is cheaper by SWIFT. Ask how long SWIFT takes. |
| **Mover onboarding and the "payouts enabled" gate** | Mangopay runs a hosted identity check for people, sole traders and companies. Movers accept Mangopay's terms, and MoversHub stores the date. Before adding a bank account, a mover sets up Mangopay's own security (PIN plus SMS code, or a passkey). Movers with identity documents from outside the EEA need a **passport**; Swiss movers can use a passport or a residence permit. Gate jobs on two things: the identity check has reached Mangopay's REGULAR level, which any payout requires, and a bank account has been added. Replace the two Stripe columns with provider-neutral ones. |
| **Movers' bank details** | MoversHub's server passes the mover's bank details straight to Mangopay's API and never stores or logs them: not in the database, the function logs or Sentry (§6 MUST NOT #3). We found no documented hosted form for bank details; ask Mangopay. |
| **Refunds and cancellation fees** | Easier than today, because the money is still held: refund the customer minus the mover's late-cancellation fee, and transfer the fee to the mover. If the mover has already been paid, the refund must be recovered from them (mover terms, COMPLIANCE §7). |
| **Approved price changes** | A second payment by the customer in the app. They are there to approve the change anyway. |
| **Disputes and chargebacks** | Handled through Mangopay's dispute process. A lost chargeback (customer disputes the card payment with their bank) is paid first from MoversHub's "repudiation" wallet. Who finally bears it is set in the contract: ask. |
| **Webhooks** | Mangopay's notifications are **not signed**. Before acting on one, fetch the payment from Mangopay's API to confirm it. Reply within 2 seconds, and make sure the same notification twice changes nothing. |
| **App** | There is no React Native SDK. Card entry uses Mangopay's web Checkout SDK inside a web view or the app's web build. |
| **Payout currencies** | EUR, PLN, CHF and others, but **no ALL, MKD, RSD or BAM**. Balkan movers need a bank account that accepts EUR. |

**Where Mangopay conflicts with COMPLIANCE §6:**
- **Your decision:** §6 is written for Stripe ("Stripe Connect Express", "SetupIntent… Do not charge yet", "Stripe webhooks… Verify webhook signatures"). It has to become provider-neutral: charge at booking (or at acceptance) with the provider holding the money, and check notifications by fetching the payment.
- **Lawyer:** what charging customers up to 60 days before the move means for refunds and for what customers must be told.
- **Lawyer:** confirm that Mangopay's wallets are Mangopay's regulated accounts and not a "MoversHub wallet" (MUST NOT #2). The app must never present them as MoversHub's balance.
- **Lawyer (Kosovo) and the Central Bank of Kosovo:** Kosovo's new Law 10/L-026 on Payment Services lets foreign payment institutions work in Kosovo through a branch authorised by the Central Bank of Kosovo (Art. 38). It forbids payment services by anyone else (Art. 28). It is not clear whether Mangopay may pay Kosovo movers from Luxembourg ([law](https://bqk-kos.org/wp-content/uploads/2026/05/LAW_NO._10_L-026_ON_PAYMENT_SERVICES.pdf)).
- **Echo** (another provider takes the card payments; Mangopay holds the money and pays movers):
  - It is acceptable only if the card money goes straight into a Mangopay-held account that MoversHub can't access.
  - With plain Stripe Payments (not Connect), the money would probably first sit in MoversHub's own Stripe balance, which MUST NOT #1 forbids.
  - Stripe would also have to confirm it allows this. Ask both.
- **Rules that are met:**
  - A licensed provider collects, holds and splits the money.
  - The provider checks identity (KYC).
  - MoversHub stores only IDs, and bank details pass through without being stored.
- **Mangopay's own approval:** its policy prohibits "shipping and forwarding brokers" and restricts "delivery services, parcel or goods transportation, pick-up, handling" ([policy](https://mangopay.com/prohibited-businesses)). A moving marketplace could fall under either, so get a written yes first. Its country list is undated and can change ([country list](https://docs.mangopay.com/guides/users/country-restrictions)).

### 4.2 Stripe Connect (EU side)
- **No design change:** this is the current plan (CLAUDE.md §7).
- **§6:** fully met for movers registered in Poland, Germany, Austria and Switzerland.
- **Worth knowing:**
  - A Polish account that runs in PLN may add 1–2% on every EUR booking for currency ([pricing](https://stripe.com/en-pl/pricing), [how destination charges convert](https://docs.stripe.com/connect/currencies/fx-quotes-api)). A eurozone company would avoid that on EUR bookings and pay it on PLN bookings instead. Ask Stripe.
  - Manual payouts can hold money for up to 90 days, but Stripe says it "doesn't provide escrow services", so don't call it escrow in the terms ([source](https://docs.stripe.com/connect/manual-payouts)).
  - Stripe's DAC7 report tool covers every EU country except Poland (private preview). A Polish company would file DAC7 itself; a Lithuanian one could use the tool ([source](https://docs.stripe.com/connect/platform-tax-reporting)).
  - BLIK can be saved for a later charge only up to PLN 2,000, only at 9 banks, and only if Stripe grants it ([source](https://docs.stripe.com/payments/blik/recurring-payments)).
  - A Balkan mover can only join if their business is really registered in an EU country or Switzerland.
- **If you use both Stripe and Mangopay:** the mover's payout country decides the provider, and one job always uses one provider. Two notification handlers would write to the same `payments` rows.

### 4.3 Stop-gap: the customer pays the mover directly

| | Prepaid commission | Fee-only |
|---|---|---|
| **How it works** | The mover buys commission credits in advance. Each accepted job uses up its commission, and a customer's cancellation gives it back. The customer pays the booking fee online and the mover's full price on the day. A variant without credits: the mover pays each job's commission by card when accepting it. Ask the lawyer whether that is simpler; it costs a fixed card fee per job. | At booking, the customer pays MoversHub's commission and booking fee online. MoversHub refunds it if no mover takes the job or the mover cancels. On the day, the customer pays the mover the rest. |
| **COMPLIANCE §6** | Already allowed as the "Balkans exception" (MUST NOT #4), with your decision and a lawyer's review. The MUST rules still aren't met for the move price, so §6 should say that the exception replaces them for those jobs. | Breaks no MUST NOT (lawyer to confirm). The MUST rules aren't met, so §6 needs a new written exception. |
| **Credits and "no balance"** | Credits usable only for MoversHub's own fees are not e-money, because e-money must be accepted by someone other than the issuer ([Kosovo Law 10/L-026](https://bqk-kos.org/wp-content/uploads/2026/05/LIGJI_NR.10_L-026_PER_SHERBIMET_E_PAGESAVE.pdf), definition 1.49; the EU e-money directive says the same). A lawyer must still confirm that, and that the credits aren't the "balance or stored value" MUST NOT #2 forbids. | No credits, no balance. |
| **Prices the customer sees** | As today: "mover EUR 150 + booking fee EUR 5". | They change, in one of two ways. Either movers' prices on the app become take-home prices and the customer sees "mover EUR 120 + MoversHub fee EUR 35", a fee of about 29% on top. Or movers keep today's prices and collect EUR 150, and the customer pays EUR 185 instead of EUR 155 (+19%). Either way, the pricing engine (CLAUDE.md §4), the movers' price form and the "from €X" display change. COMPLIANCE §1 allows a commission and a booking fee "shown transparently". |
| **For movers** | They pay in advance, which costs them cash flow and makes sign-up harder. Unused credit is refunded when they leave. | Nothing to pay in advance. |
| **What MoversHub builds** | A credit ledger (top-up, use at acceptance, give back on cancellation, refunds), VAT invoices for credits and a top-up checkout. "Payouts enabled" becomes "credits cover this job". About 1–2 weeks (estimate). | A checkout for MoversHub's fee (today's Stripe code without Connect) and its refunds. About 1–2 weeks (estimate). |
| **MoversHub's money** | Paid before the job. | Paid at booking. |
| **Jobs done outside the app** | Higher risk: the research rates it highest. | Also a risk on repeat jobs. |
| **Payment cost on S1** | ≈ EUR 0.45–2.1 | ≈ EUR 0.35–2.09 |

**In both versions:**
- The customer has no card protection on what they pay the mover in cash or by transfer. Tell customers to pay on completion, never in advance.
- Movers' late-cancellation fees can't be collected through MoversHub, because that would mean handling the mover's money.
- Disputes over the mover's share are between customer and mover.
- **Identity checks:** no provider checks movers. MoversHub's own checks (company, registers and documents, already built) remain the gate.
- **DAC7:** report the agreed prices, which the platform knows, instead of payouts. Today `dac7_quarterly_totals` is calculated from `payments`.
- **Bank details:** the app must not show, collect or store a mover's IBAN anywhere, for example "Pay your mover EUR 120 to IBAN XK…" on the booking screen. Movers give payment details to the customer outside the app. Otherwise the customer pays in cash, on the mover's own card terminal or through the mover's own payment link. Put this rule into the §6 text (MUST NOT #3).

**Where the stop-gap conflicts with COMPLIANCE §6:**
- **Your decision + lawyer:** the MUST rules aren't met for the mover's share. Those rules are: the provider collects, holds and splits the whole amount; the provider checks identity; the card is saved and charged later; the payout comes after confirmation. Prepaid commission uses the exception §6 already names. Fee-only needs a new written exception for countries where no provider can pay movers.
- **Lawyer:** MoversHub stays outside payment law only if it **never** receives the mover's share. Kosovo Law 10/L-026 Art. 3(1.1) excludes cash paid directly; see also EU PSD2 recital 11. Collecting part of the mover's price and keeping it as commission would be a payment service.
- **Lawyer:** three points:
  - how to tell customers about the two payments before they book;
  - movers' fiscal receipts;
  - Kosovo's cash limit. From 1 Jun 2026, a consumer may not pay a business more than EUR 2,000 in cash, even split into parts (secondary source), so larger moves need a transfer or card. Ask whether this also covers movers who are private persons.
- **MUST NOT rules:**
  - No customer money meant for movers lands in a MoversHub account: met.
  - No wallet: met for fee-only; for prepaid credits, the lawyer decides.
  - No IBANs stored: met only with the bank-details rule above.
  - "Cash and settle later": not triggered, because MoversHub's money is paid first.

### 4.4 Which company?

| | Kosovo company | Polish company (planned) | Eurozone EEA company, e.g. Lithuanian |
|---|---|---|---|
| Mangopay | Not accepted (EEA or UK only) | Accepted, if Mangopay approves the business | Accepted, if Mangopay approves the business |
| Stripe Connect | Not accepted | Accepted; EUR bookings cost 1–2% extra on an account that runs in PLN | Accepted; no extra cost on EUR bookings (PLN bookings carry it instead); BLIK on a Lithuanian account: ask |
| Paysera splits (backup) | No split | No split | Splits available (Lithuanian, Latvian or Estonian company) |
| Card payments for MoversHub's own fee in a stop-gap | Paysera Kosovo (Mastercard 2.9% as published; Visa: ask) or a Kosovo bank | Stripe Payments (without Connect) | Stripe Payments (without Connect) |
| Airwallex, Mollie, Adyen, Checkout.com, Viva | Not accepted | Accepted (EEA) | Generally accepted (EEA) |
| Lemonway | Unclear (case by case at best) | Accepted (EEA) | Accepted (EEA) |
| DAC7 | Must register in one EU country once it serves movers living in the EU | Filed in Poland; Stripe's DAC7 tool doesn't cover Poland | Filed in Lithuania (accountant to confirm); Stripe's DAC7 tool covers it (private preview) |

What the choice means beyond payments (for the accountant and lawyer):
- **Polish company:** Polish bookkeeping and VAT. MoversHub files DAC7 in Poland itself. Movers living in Kosovo don't have to be reported under DAC7.
- **Eurozone company (e.g. Lithuanian):** the same tasks in that country, with EUR as its home currency. Ask the accountant how the Polish market would run from it (PLN bookings, BLIK).
- **For either:**
  - Ask whether charging commission to Kosovo movers, or fees to Kosovo customers, forces the company to register for Kosovo VAT through a tax representative. PwC says foreign suppliers must register unless the Kosovo buyer is VAT-registered ([source](https://taxsummaries.pwc.com/kosovo/corporate/other-taxes)).
  - Ask where a company that is run from Kosovo pays tax.
  - Ask Mangopay and Stripe whether an owner living in Kosovo is a problem (unverified).
- **Kosovo company:** the simplest for you, but no marketplace provider accepts it, so it only fits the stop-gap.
- **Two companies:** possible, but it doubles the admin. For example: a Kosovo company for the stop-gap plus an EEA company for Mangopay, or a Polish company plus a Baltic one for Paysera.
- **Our suggestion:** one EEA company. Before registering, ask the accountant whether Poland or a eurozone country such as Lithuania is better. Use Stripe Payments for MoversHub's own fee during any stop-gap, unless the accountant says Kosovo taxes require a Kosovo company anyway.

### 4.5 Corrections for COMPLIANCE.md (when you next update it)
- §6 says to "check Kosovo, Montenegro". In fact Stripe can't pay movers in any of the six countries: XK, AL, MK, RS, ME, BA.
- §14 suggests "a second payout provider (e.g., Wise)". Wise only pays out of MoversHub's own balance, which breaks §6 MUST NOT #1 and #2.
- §14 expects the PSR's first obligations in the second half of 2027. As of 19 Oct 2026 the PSR is not yet adopted, and it applies about 21 months after it comes into force, so not before late 2028 ([EP file](https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023/0210(COD))).
- §14 says "Poland planned" for the company. Any EEA company works for Mangopay and Stripe, and a eurozone one may be cheaper (Decision 1).
- If you choose prepaid commission, §6 should say how commission credits fit "no balance or stored value" (MUST NOT #2), as the lawyer advises.

---

## 5. Questions to ask

### Mangopay sales ([mangopay.com/contact](https://mangopay.com/contact))
1. We are a moving marketplace: customers book independent movers (companies, sole traders and some private persons) for local and cross-border moves. Do you accept this business? Please confirm in writing, given your restricted and prohibited transport and forwarding categories.
2. Our platform will be either a Polish sp. z o.o. or a company in a eurozone EEA country such as Lithuania, owned by a Kosovo resident. Is that acceptable? Does the country change your prices?
3. Can you onboard and pay movers who live in Kosovo, Albania, North Macedonia, Serbia, Montenegro and Bosnia, whether they are individuals, sole traders or companies?
4. Which ID documents do you accept from Kosovo residents: only passports, or also the Kosovo ID card? Can you check Kosovo businesses against the Kosovo business register?
5. Please include EUR payouts to Kosovo (XK) IBANs by SWIFT in our contract.
   - What does one payout cost under SHA and under OUR, and how many days does it take?
   - Do payouts to Albanian, Montenegrin, North Macedonian and Serbian IBANs go by SEPA or by SWIFT?
   - If a Kosovo mover's euro account is in a SEPA country (for example a Paysera account), would you pay it by SEPA?
6. Can a mover's money stay in their wallet and be paid out weekly or when they ask, to save SWIFT fees? Can you pay movers to their debit cards instead (Visa Direct or Mastercard Send), including Kosovo-issued cards?
7. We take bookings up to 60 days ahead. Can the customer's money wait in their wallet for up to 62 days? Is there any reserve or limit?
8. Can we pre-authorise the card at booking and capture it when the mover accepts? Offers expire within 12 hours. Or can we save and authenticate the card at booking (a zero-amount payment or "free cycle") and charge it once, for a different amount, up to 60 days later? If neither, what do you recommend?
9. When a mover declines, an offer expires or a mover cancels, we refund the customer in full. Are your card fees returned on refunds?
10. Please quote for about 200 moves a month (about EUR 40–60k). Include:
    - EEA cards and non-EEA cards (Kosovo, Switzerland), BLIK and TWINT;
    - wallet-to-wallet transfers and payouts (SEPA, PLN, SWIFT under SHA and OUR);
    - identity checks and chargebacks;
    - any monthly minimum or platform fee.
11. Does the SMS security step for movers work with phone numbers from Kosovo (+383), Albania and North Macedonia?
12. Do you have a hosted form where movers enter their bank details, so the details never pass through our server?
13. Kosovo's Law 10/L-026 (Art. 38) expects foreign payment institutions to work through a branch authorised by the Central Bank of Kosovo. How do you serve Kosovo residents?
14. Could another provider (for example Stripe) take the card payments while you hold the money and pay the movers (your "Echo" feature)? Who would be the merchant of record? Would the money pass through our own Stripe balance or bank account? Our rules forbid that.
15. Do you provide yearly totals per seller for DAC7? Do you have a test environment (sandbox)? How do you recommend taking cards in a React Native (Expo) app?

### Stripe sales ([stripe.com/contact/sales](https://stripe.com/contact/sales))
1. Our company will use Connect Express with destination charges, mostly in EUR.
   - On a Polish account, can we settle EUR without the 1% multi-currency fee or a 2% conversion?
   - Would a Lithuanian (EUR) account avoid it, and could it accept BLIK?
   - What would a EUR 610 German-card booking paid to a German mover cost in total?
2. Does the 0.25% "funds routing" fee come on top of the 0.25% + 1.35 zł payout fee? What do payouts to movers in Germany, Austria and Switzerland cost?
3. Will you enable saved BLIK payments for a moving marketplace? Which merchant category (MCC) will we get, and does it allow Przelewy24?
4. Is there any way, outside self-service, to pay connected accounts in Kosovo, Albania, North Macedonia, Serbia, Montenegro or Bosnia? (We expect the answer is no.)
5. Can a Polish or Lithuanian company whose owner lives in Kosovo open the platform account?

### Paysera (for the baseline and the stop-gap)
1. Which card price applies to a company registered in Kosovo: the flat 2.9% for Mastercard and Maestro, or the volume-based rates?
2. Can a company registered in Kosovo accept Visa, including Kosovo-issued Visa debit cards?
3. We charge only our own booking and service fee. Would you class us as a financial service provider or an enhanced-checks client (€100 + €20 a month, or €300 a month)?
4. Can the amount held back (100% for 3 days, 5% for 3 months) be lowered?
5. Is EUR 0.15 per card payment a minimum, or is it added to every payment?
6. Which country's IBAN do Paysera accounts of Kosovo residents carry? Can they receive SEPA transfers and, from a Paysera merchant in Lithuania, split payments?

**Kosovo banks** (NLB, BKT, Raiffeisen, ProCredit, TEB): "Please send a written e-commerce offer: the fee for domestic and foreign cards, setup and monthly fees, refunds, chargebacks, how fast you settle, and saved cards (tokens)."

### Backups: where to start
- **Lemonway:** [lemonway.com/en/pricing](https://www.lemonway.com/en/pricing). Ask whether it accepts Kosovo and Balkan movers and which countries its €9 "international" payout reaches.
- **Airwallex:** [airwallex.com/en-eu/pricing](https://www.airwallex.com/en-eu/pricing). Ask the account manager:
  - whether "withdrawal accounts" can be enabled for AL, MK, RS, ME, BA and Kosovo;
  - where unreleased split money sits;
  - how long it can be held.
- **Worldline for Platforms (OPP):** [onlinepaymentplatform.com/pricing](https://onlinepaymentplatform.com/pricing). Ask for the seller-country and payout-IBAN lists, and whether sellers in Albania, Montenegro, North Macedonia, Serbia or Kosovo can join.
- **Monri WSPay MarketPlace:** [wspay.info/product/283/monri-wspay-marketplace](https://www.wspay.info/product/283/monri-wspay-marketplace). Ask:
  - who holds and pays the sellers' money, and under which licence;
  - whether Kosovo, Albania and North Macedonia are covered;
  - whether payouts can wait until the move is done.
- **Paysera with a Baltic company:** [paysera.com/v2/en-GB/payment-gateway-checkout](https://www.paysera.com/v2/en-GB/payment-gateway-checkout). Ask the three backup questions in section 1.
- **Ecommpay, Unlimit:** leads only. Use the sales form on their own websites (not researched).

### Lawyer and accountant (not sales, but needed before building)
1. (Kosovo) Can an EU e-money institution such as Mangopay hold and pay out money for movers living in Kosovo without a branch authorised by the Central Bank of Kosovo (Law 10/L-026 Arts 28 and 38)? Send this question to the Central Bank of Kosovo in writing too.
2. (Kosovo) If customers pay movers directly and MoversHub charges only its own money, is MoversHub outside the payment law (Art. 3(1.1))? What about movers' fiscal receipts? Does the EUR 2,000 cash limit also cover movers who are private persons?
3. (Kosovo and Poland) Prepaid commission:
   - Are credits usable only for MoversHub's own fees outside the e-money rules (Kosovo definition 1.49; EU e-money directive Art. 2(2))?
   - Are they outside §6's "no balance or stored value"?
   - Would it be simpler for movers to pay each job's commission when accepting it?
4. (Poland/EU) If we charge customers at booking or acceptance, up to 60 days before the move, while the provider holds the money: what must we tell customers, and how do refunds work?
5. (Tax) Should the platform company be in Poland or in a eurozone EEA country such as Lithuania? Consider EUR settlement at Stripe, Paysera's splits, running the Polish market from either, VAT and DAC7.
6. (Tax) What VAT applies to commission and booking fees that the company charges Kosovo movers and customers? Does it need to register for Kosovo VAT through a tax representative?
7. (Tax) Where does a company run from Kosovo pay tax? How do we file DAC7, given that Stripe's tool excludes Poland?
8. (Poland) Does a platform that arranges moves need a Polish transport licence? (The research raised this question but couldn't verify it.)
9. (Later, for completeness) Kosovo's small-institution waiver (Art. 24), and agent status (Art. 38(6), or as an EU agent of a licensed institution). Both would give MoversHub its own regulatory status, which §0 and §6 avoid. We don't recommend them.

---

## 6. Ruled out

- **Stripe Connect for Balkan movers:** Stripe can't onboard or pay sellers in XK, AL, MK, RS, ME or BA, not even through a US company.
- **Stripe Global Payouts:** needs a UK or US company, doesn't cover Kosovo or Montenegro, and MoversHub would hold the money (§6).
- **Adyen for Platforms:** no Balkan sellers; a minimum monthly invoice; you have to go through sales.
- **Checkout.com Platforms:** no Balkan sellers or payouts; no public prices.
- **Worldline / OPP, as a main option:** says it covers the EU and UK only; no BLIK or P24. Kept only as a one-email long shot about sellers with Balkan bank accounts (section 1).
- **Nuvei for Platforms:** accepts sellers in Serbia but documents no way to pay them, and nothing for Kosovo or Albania; the licence behind its platform product is unclear.
- **Rapyd:** Kosovo is missing from its list of business countries and its list of payout countries.
- **Viva.com:** sellers must be Vivabank customers in the EEA or UK, and the money sits in MoversHub's own platform account.
- **Trustap:** runs on Stripe, so it has the same gaps; 4–5% plus a monthly fee.
- **HiPay:** MoversHub would need its own regulatory status (agent, exemption or licence).
- **Swan:** accounts only in the EEA; doesn't collect payments for marketplaces.
- **PayPal / Braintree:** Kosovo isn't a PayPal country; Braintree Marketplace is US-only.
- **Airwallex, for the Balkans:** no Kosovo at all, and elsewhere only "ledger" accounts that the platform owns (§6). Possible only as a Stripe alternative for EU movers, plus one question about "withdrawal accounts".
- **Mollie, for the Balkans:** EEA and Swiss business movers only. Possible only as a Stripe alternative for EU business movers.
- **Wise, Payoneer, Revolut Business, or any card provider combined with a payout service:** they pay only out of MoversHub's own balance (§6 MUST NOT #1 and #2), which is probably an unlicensed payment service.
- **Skrill / Paysafe:** probably no Kosovo, and MoversHub would become a "payment facilitator" with its duties.
- **Paysera with a Kosovo or Polish company:** no split, so MoversHub would receive movers' money and pass it on (§6). As published, Kosovo merchants can't take Visa.
- **Kosovo banks as the marketplace solution:** they serve one merchant only, so MoversHub would hold movers' money (§6; Kosovo law Art. 28). Fine only for MoversHub's own fee.
- **POK:** Albanian, not authorised in Kosovo; splits to one recipient only; prices not public.
- **Kosovo non-bank payment firms as the marketplace solution:** no marketplace product or API; they are being re-licensed under the new law until about November 2027. Swinto and OneFor may still help as payout accounts for movers (section 3).
- **Payten, CorvusPay, AllSecure, Bankart:** technical gateways that sit on top of a bank's card service; no split or payouts.
- **PayU, Przelewy24, Tpay, Autopay:** marketplace products for Poland only, and Tpay's terms forbid paying recipients outside the EU. Keep PayU in mind later for Polish movers who are private persons.
- **Unzer, Nexi Checkout:** Unzer covers Germany and Austria through sales only and has no BLIK; Nexi covers the Nordic countries only and has no split.
- **MoversHub selling the move itself:** breaks §0, §4, §6 and §7, and puts VAT on the full price (+EUR 18.30 on S1 at Kosovo's 18%).
- **Monthly commission invoices to movers:** the "settle later" pattern §6 forbids, with a risk that movers don't pay.
- **Kosovo's small-institution waiver (Law 10/L-026 Art. 24):** would let a Kosovo MoversHub company register with the central bank (up to EUR 3m a month) and hold and split the money itself. That is the own escrow §6 forbids (MUST NOT #2), and it goes against §0. A lawyer question for later only.
- **MoversHub as a registered agent of a licensed provider** (in Kosovo under Law 10/L-026 Art. 38(6), or in the EU): gives MoversHub its own regulatory status, against the pure-middleman position (§0, §14). A lawyer question for later only.

---

## Sources (decisive facts)

**Stripe**
- Countries served: https://stripe.com/global
- Cross-border payouts limited to the US, UK, EEA, Canada and Switzerland: https://docs.stripe.com/connect/cross-border-payouts
- Prices in Poland (incl. 1% multi-currency settlement, +2% conversion, fees not returned on refunds): https://stripe.com/en-pl/pricing
- Connect prices: https://stripe.com/en-pl/connect/pricing
- Currency conversion on destination charges: https://docs.stripe.com/connect/currencies/fx-quotes-api and https://docs.stripe.com/connect/multi-currency-settlement
- Manual payouts (90 days, "not escrow"): https://docs.stripe.com/connect/manual-payouts
- Saved BLIK payments: https://docs.stripe.com/payments/blik/recurring-payments
- DAC7 tool (all EU countries except Poland): https://docs.stripe.com/connect/platform-tax-reporting
- Global Payouts: https://docs.stripe.com/global-payouts

**Mangopay**
- Platforms must be EEA or UK companies: https://docs.mangopay.com/support
- Country restrictions (XK, AL, MK, RS, ME, BA, PL, CH: "No restrictions"; page undated; checked again 19 Oct 2026): https://docs.mangopay.com/guides/users/country-restrictions
- Payout methods, SEPA or SWIFT by country, currencies, SHA/OUR: https://docs.mangopay.com/guides/payouts
- Pricing (custom only): https://mangopay.com/pricing
- Prohibited and restricted businesses: https://mangopay.com/prohibited-businesses
- Licence (CSSF e-money institution): https://mangopay.com/legal-notice
- Customers (payers) not bound by Mangopay's terms; only movers accept them: https://docs.mangopay.com/guides/users/terms.md
- Payers need no identity check; payouts need level REGULAR: https://docs.mangopay.com/guides/users/limits.md
- Wallets hold money for as long as needed: https://docs.mangopay.com/guides/e-wallet-system.md
- ID documents (non-EEA: passport only; Switzerland: passport or residence permit): https://docs.mangopay.com/guides/users/verification/requirements/id-accepted.md
- Card validation and recurring payments: https://docs.mangopay.com/guides/payment-methods/card/validation.md and https://docs.mangopay.com/guides/payment-methods/card/recurring.md
- Pre-authorisation limits: https://docs.mangopay.com/api-reference/deposit-preauthorizations/deposit-preauthorization-object.md and https://docs.mangopay.com/guides/payment-methods/card
- Security step for movers (SCA): https://docs.mangopay.com/guides/sca.md
- Notifications (unsigned): https://docs.mangopay.com/webhooks
- Fees wallet: https://docs.mangopay.com/guides/fees.md
- Echo: https://docs.mangopay.com/guides/echo.md and https://docs.mangopay.com/guides/echo/reconciliation.md
- Third-party price hint (unverified): https://www.stripealternatives.com/mangopay

**Paysera**
- Splits only in Checkout Modern, for LT/LV/EE companies: https://www.paysera.com/v2/en-GB/payment-gateway-checkout
- Split rules (EEA IBANs only; split at the moment of payment): https://developers.paysera.com/guides/checkout-modern/concepts/split-payments
- Card fees: volume-based rates and the separate "Kosovo clients" table: https://www.paysera-ks.com/v2/en-XK/fees/payment-gateway-with-payment-cards-fees
- Bank link and PIS 1% for Kosovo merchants: https://www.paysera-ks.com/v2/en-XK/fees/payment-gateway-fees
- Visa and Mastercard for EU-registered persons: https://www.paysera-ks.com/v2/en-XK/payment-gateway-checkout
- Account fees: https://www.paysera-ks.com/v2/en-XK/fees/account-management-and-identification-business
- Transfer fees (incl. EUR 3 to receive SEPA for Kosovo companies): https://www.paysera-ks.com/v2/en-XK/fees/euro-transfers
- Recurring billing: https://developers.paysera.com/guides/recurring-billing
- Where Paysera works (RS, ME, MK extra checks; Bosnian businesses unsupported): https://www.paysera.com/v2/en-GB/faq/where-paysera-works

**Other providers**
- Airwallex: https://www.airwallex.com/docs/connected-accounts/about/regional-availability, https://www.airwallex.com/docs/payments-for-platforms/airwallex-gateway/manage-funds-split/create-funds-split and https://www.airwallex.com/en-eu/pricing
- Mollie: https://docs.mollie.com/docs/connect-onboard-merchants.md, https://docs.mollie.com/docs/delayed-routing.md and https://www.mollie.com/pl/pricing
- Lemonway: https://www.lemonway.com/en/pricing and https://www.lemonway.com/en/terms-and-conditions
- Worldline for Platforms / OPP: https://onlinepaymentplatform.com/pricing and https://docs.onlinepaymentplatform.com/
- Adyen: https://docs.adyen.com/platforms/
- Checkout.com: https://www.checkout.com/docs/payments/request-payouts
- Nuvei: https://docs.platforms.nuvei.com/docs/how/countries/
- Rapyd: https://docs.rapyd.net/en/global.html and https://www.rapyd.net/network/
- Viva: https://developer.viva.com/marketplaces/
- Trustap: https://www.trustap.com/terms
- PayPal: https://www.paypal.com/webapps/mpp/country-worldwide and https://developer.paypal.com/docs/multiparty/seller-onboarding/
- Wise (EUR by SWIFT to Kosovo): https://www.wise.com/help/articles/2978075/which-countriesregions-can-i-send-eur-to-via-swift; live price, SHA vs OUR: https://wise.com/gateway/v1/price?sourceAmount=120&sourceCurrency=EUR&targetCurrency=EUR&profileType=BUSINESS&profileCountry=PL
- Payoneer: https://www.payoneer.com/pricing/
- NLB Kosovo (e-commerce and card-terminal rates): https://www.nlb-kos.com/en/business/business-pricelist
- BKT (virtual and physical POS): https://bkt-ks.com/content/2026/07/Cmimore-per-biznese-02.02.2026.pdf
- Swinto and OneFor (SEPA transfers advertised): https://www.swinto.com/ and https://www.onefor.com/
- Monri: https://www.wspay.info/product/283/monri-wspay-marketplace
- PayU: https://poland.payu.com/wp-content/uploads/sites/14/2026/09/Price_list_PL4_01_2026-2.pdf
- Przelewy24: https://www.przelewy24.pl/oferta/tabela-prowizji-i-oplat
- Tpay terms: https://tpay.com/user/assets/files_for_download/owu.pdf

**Law, SEPA, tax**
- Kosovo Law 10/L-026 on Payment Services (Arts 3, 24, 28, 38; definition 1.49): https://bqk-kos.org/wp-content/uploads/2026/05/LAW_NO._10_L-026_ON_PAYMENT_SERVICES.pdf (Albanian Gazette text: https://bqk-kos.org/wp-content/uploads/2026/05/LIGJI_NR.10_L-026_PER_SHERBIMET_E_PAGESAVE.pdf)
- Kosovo's SEPA status (Central Bank of Kosovo, 17 Oct 2026): https://bqk-kos.org/news/bqk-miratimi-i-ligjit-per-aml-cft-hap-rrugen-per-hapat-e-fundit-per-finalizimin-e-aplikimit-te-kosoves-ne-sepa/?lang=en
- SEPA country list v8.0: https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2025-12/EPC409-09%20EPC%20List%20of%20SEPA%20Scheme%20Countries%20v8.0.pdf
- PSD2 recital 11: https://www.legislation.gov.uk/eudr/2015/2366/introduction
- PSR status: https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023/0210(COD)
- Kosovo VAT: https://taxsummaries.pwc.com/kosovo/corporate/other-taxes
- Kosovo cash limit (secondary source): https://www.fiscal-requirements.com/news/5548-the-tax-administration-of-kosovo-issued-notice-on-the-cash-payment-limit

---

## Glossary
- **EEA:** the European Economic Area: the EU plus Norway, Iceland and Liechtenstein. Switzerland is in neither, but takes part in SEPA. Many providers serve only companies and sellers there.
- **E-money institution / payment institution:** a company with a licence from a central bank or a financial regulator (for Mangopay, Luxembourg's CSSF) to hold and move other people's money.
- **Split:** the provider divides one customer payment between the mover and MoversHub.
- **Hold:** the provider keeps the customer's money until MoversHub says the move is done.
- **Payout:** the provider sends the mover's money to the mover's bank.
- **KYC / KYB:** identity checks on people / on businesses.
- **REGULAR (Mangopay):** Mangopay's full identity-check level. A mover can't be paid out before reaching it.
- **Save the card, charge later ("off-session"):** the customer approves the card once, and it is charged later without them.
- **Pre-authorisation:** a hold on the customer's card for an amount, which is later charged ("captured") or released. It lasts only days.
- **3-D Secure:** the bank's extra check (a code or app approval) when paying online.
- **SEPA:** Europe's cheap system for euro bank transfers. Kosovo and Bosnia aren't in it yet.
- **SWIFT:** international bank transfer: slower, with fees. **SHA** means the fees are shared, so the mover receives a bit less. **OUR** means the sender pays all the fees.
- **Interchange++:** a card price that passes on the card bank's and card network's fees, plus the provider's margin. It differs from card to card.
- **Chargeback:** a customer disputes a card payment through their bank.
- **Webhook / notification:** a message from the provider to MoversHub's server, such as "payment succeeded".
- **Merchant of record:** the company named on the card statement, which is liable for refunds and chargebacks.
- **DAC7:** an EU rule that platforms must report sellers' earnings to the tax office each year.
- **Prepaid commission / fee-only:** the two stop-gap versions in which the customer pays the mover directly (section 4.3).
- **sp. z o.o.:** a Polish limited-liability company.
- **BLIK / P24 / TWINT:** popular payment methods. BLIK is a Polish mobile code, Przelewy24 is a Polish bank payment, TWINT is a Swiss payment app.
- **MCC:** the merchant category code the card networks give a business.
