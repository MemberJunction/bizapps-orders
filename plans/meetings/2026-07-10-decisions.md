# 2026-07-10 — Decisions & directives (3 meetings)

Distilled from three 2026-07-10 recordings (raw transcripts in this folder):
1. **Matt & Marcelo — GUI Review** → UI/UX + performance direction (see the accounting companion doc for the full UI write-up).
2. **Marcelo, Ian & Robert — Accounting Check-in 2** → domain scope + terminology.
3. **Marcelo & Jeremy H — Accounting Feature Collection** → finance-user requirements from the real (Business Central / bill.com / AIDP) workflow.

> This is a **working decisions doc**, NOT a master plan. It records what changed on 2026-07-10 and feeds the
> schema-vs-needs evaluation the orchestrator is running. The `*-master*.md` plans are the source of truth and are
> left untouched — several items below note "already in the master plan, not yet built."

---

## A. Terminology flip — Orders ARE Invoices (the AR primitive)

- **A posted order IS the invoice / the AR primitive.** We are replacing AIDP "invoices" with **orders**; there is
  **no separate Invoice entity**. Order entry = invoice entry; a *posted* order is what generates AR.
- **We build the SUBLEDGER, not the GL.** Business Central stays the general ledger + GL reporting. **NOT building:**
  a general ledger, year-end close, trial-balance/P&L/balance-sheet generation — those stay in BC.
- **Credit memo = an order with a negative balance** (no separate credit-memo entity).
- Talk about it externally as "invoice management," but the entity/term is **order** (Jeremy already follows the designs; Robert: don't reintroduce "invoice" as a type).

## B. Payments — now in scope (was not before)

- **Stripe is the day-one payment provider.**
- **`PaymentLine` = junction between a payment and an order.** One payment can clear **multiple** orders; one order can
  be **partially** cleared by **multiple** payments (mirrors BC "apply payment against invoice").
- **Payment application + close:** applying a payment must mark the specific order settled (not just net the customer
  balance) — Jeremy's pain today is BC leaving an invoice "open" until explicitly applied, plus manually marking paid in bill.com.
- The order system is now effectively **coupled to payments** — cash booking (Dr Cash / Cr AR-for-that-customer) + application.

## C. Customer / contact schema — big gaps vs. the real workflow (Jeremy)

Current built schema is **far** short of what a usable invoice/customer system needs. Required:
- **Customer** with **email(s)** — *multiple* (bill-to ≠ signer; CC list). bill.com sync only carries ONE email today → we can fix on our side.
- **Address** (bill-to AND ship-to) — ship-to/shipping address also drives **tax jurisdiction**.
- **Multiple points of contact** per customer; **sales rep** on the contract/order.
- **External document number** on the order — *required* for the bill.com sync path. Can equal the order number, but must exist.
- **Posting date** (when it lands on the books → when AR becomes AR; can be back/future-dated) **and due date** (payment target + overdue tracking) on the order.
- **Customer identifier / account number** stable across systems (dup/acronym mismatches are a real problem today).
- Renewals are **invoiced ~3 months ahead** of the term (to pull cash early) — the schedule/auto-renew drives when an order is generated.

## D. Subscriptions & deferred revenue (central)

- **Subscription is a core product type.** Subscription **term** (start/end) lives on the **order line**; deferred revenue is
  recognized over the term. Subscription management (term, auto-renew, cancellation days, % recognized) matters a lot.
- Product/pricing detail can be **deferred** EXCEPT the **deferred-revenue settings** (recognition schedule) — build those.
- Deferred-rev → revenue recognition can be a **batch** (Jeremy does one line/customer/month today); Amith's vision is a
  **continuous running balance** (no month-end true-up). Monthly is the likely cadence. **Reproducibility is the hard requirement.**

## E. Taxes

- **Collect + remit is a needed capability** (today Blue Cypress collects **no** sales tax — "flying under the radar"; jurisdictions where our SaaS is taxable are unhandled).
- Likely model: a **tax line = an order line of a `tax` type** (quick/dirty: a product per taxing jurisdiction), or separate tax
  tables aggregated into a "tax area" in the UI. Grand total = product lines + tax lines.
- **Tax calc provider** (Avalara-style) invoked at order-line time via **BizApps Accounting**; needs the **shipping address**.
- `TaxAuthority/TaxJurisdiction/TaxRate/TaxLiability/TaxRemittance/CustomerTaxProfile` already exist in the accounting schema — reuse.

## F. Contracts, LXP, multi-company, multi-currency

- **Contracts already exist in the AIDP** (contract automation built by Ari/Soham: forecasted → pending → active contract terms, auto-renew at a % bump). Contracts will likely **port** to the new system. **`Order.ContractID` is optional** (one-time e-commerce has none).
- **LXP:** no contracts (credit card → immediate order + payment). LXP installs the app and **flows data into Blue Cypress**; could become its own product company. Accounting for LXP = our finance team; order-side integration → coordinate with **Ethan**.
- **Multi-currency:** eventually, not day one (`Currency` + `CurrencySpotRate` already in plan).
- **Intercompany:** near-term **fast-follow** (not MVP day one). Complex order example: INTA buys Izzy + Rasa + Sidecar = **one order, three companies**, due-to/from kicks in.

## G. SCHEMA-GAP directive (Robert) — highest near-term priority

- **Much of the above is ALREADY in `bizapps-orders-master.md`** (bill-to/ship-to address, customer person, sales rep, org links
  to bizapps-common, multi-currency, pricing / price list / price tier, product types incl. **event product + event order line** and **subscription product**, tax category, customer tax profile — see master §4.2 "Order + Order Line", ~line 425). It is **not yet reflected in the built schema.**
- **Action:** re-read the orders master plan with fresh eyes; run `Claude`/orchestrator to **compare the built schema vs. the master plan** and build out the missing complexity. The orchestrator's Fable/Workbench schema-vs-needs eval is doing this — **watch for its plan.**
- Robert's technique to fold in: write plans with **counter-examples** ("this is NOT what we're building today") to surface hidden assumptions.

## H. bill.com / delivery path (open)

- Invoices are sent to customers via **bill.com** (requires the external document number). Path is undecided: AIDP → Business
  Central → bill.com (today) vs. **direct to bill.com API** from our system. If we batch JEs, we may need orders to send the
  bill.com invoice itself. **Open — depends on the BC integration + payment flow.**

## I. Cutover / expectations

- **Cutover is NOT Friday.** Earliest **2026-08-17**. Baseline first, iterate via daily-ish demos + meetings; expect rework
  (code is cheap; better to build-see-correct than analysis-paralysis).
- **Reporting is cutover-gating** for Jeremy (Power BI off SQL; the fragile Excel cash-flow / FP&A model → automate). Full parity
  not required day one, but the data must be reproducible.

## Open questions / for the schema eval
- Invoice **numbering**: mirror BC's draft-seq + posted-seq split, or single sequence? (draft/cancel before post without gaps.)
- Deferred-rev: **batch monthly** vs **continuous balance** — confirm with Amith.
- Tax: order-line-type vs separate tables — pick one for the first iteration.
- Get **read-only AIDP access** (Jeremy offered) to map the real customer/contract/invoice schema → drive our model.
