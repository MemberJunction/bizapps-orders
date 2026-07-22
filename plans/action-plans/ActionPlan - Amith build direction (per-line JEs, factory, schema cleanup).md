# ActionPlan - Amith build direction (per-line JEs, factory, schema cleanup)

> **Status:** Active
> **Created:** 2026-07-21
> **Scope:** CROSS-APP — orders-led (booking rework) + accounting schema cleanup
> **Implements:** orders MOD-15 (the Amith booking architecture) · accounting MOD-19 (schema
> cleanup + contra roles) · supersession markers on orders MOD-11/MOD-14/UPD-7
> **Sources:** `meetings/2026-07-21 Accounting Orders Review - Amith & Marcelo.md` (both repos)
> **Open question riding this:** orders [Q25](../QUESTIONS.md#q25) — Robert/Jeremy re-closure of
> seller-of-record under the new shape (proceeding with Amith's model meanwhile)

**The working-mode ruling that frames this plan (Amith, Marcelo-endorsed):** *build first,
iterate in the system.* "You're just gonna go build the whole thing, and we're gonna work through
the bugs… we're gonna get past these documents, get the database built, and start working in the
system itself." Design coaching continues iteratively with Amith against the running system.
Consequences for how we work: known-imperfect spots (e.g. GLAccountRole required-tracking) are
deliberately blown past and revisited in-system; plans stay thin; Amith reviews the BUILT code
("go through the code and make sure you understand literally every line — then I'm gonna walk
you through it"). Marcelo personally walks the generated code before Amith's review — build
output is not fire-and-forget.

## ⚠ RE-PRIORITIZATION (Marcelo, 2026-07-22) — orders first; accounting schema cleanup deferred

Marcelo's ruling after the Phase A design review: **the orders per-line booking build is the
priority; the accounting schema cleanup (A1/A2/A3) is deferred and NOTATED so it gets done later.**
- **Marcelo** is taking the CodeGen include-mode PR (cross-app FK) — why it's the way it is + how to
  change it. Until it lands, the orders→accounting link is a **SOFT ref** (interim only — becomes a
  HARD FK once the PR is done; that is the go-forward standard, per Marcelo's cross-app-FK rule:
  parent→required-dependency FKs are hard + nullable up the tree).
- **A1/A2 + the role→account management UI → DEFERRED + NOTATED** in `bizapps-accounting/plans/DEFERRALS.md`
  (MOD-19 execution row). The B1 resolver reads `GLAccountLink` regardless, so orders does NOT need
  the ACP columns dropped — we seed `GLAccountLink` company-default rows alongside them for testing.
- **A3 → DEFERRED to the S2 single-company-batch slice** (the batch has no header `CompanyID` today;
  dropping the line-level one now would break the batching engine). Already in the plans.
- **A4 stays** (cheap metadata seed, needed for orders discount/contra booking + tests).

## Phase A (revised) — ORDERS schema + the contra-role seed only

Per the standing pre-production migration practice (MOD-19.5): fix the ORIGINAL baseline
migrations, rebuild on a clean database, re-run codegen, commit regenerated code with the migration.

**Accounting baseline (`B202605281200…`) — DEFERRED except A4:**
- [~] A1 · ~~Drop the 5 ACP GL-account FK columns~~ → **DEFERRED** (DEFERRALS: MOD-19 execution).
  The resolver reads `GLAccountLink`; seed company-default links alongside the ACP columns for tests.
- [~] A2 · ~~Drop `ChartOfAccountsMapping` + erp-mapping page/service/op~~ → **DEFERRED** (DEFERRALS).
- [~] A3 · ~~Drop `JournalEntryBatchLineItem.CompanyID`~~ → **DEFERRED to S2** (batch-header CompanyID first).
- [ ] A4 · Seed the two contra `GLAccountRole` rows: **Sales Discounts**, **Returns & Allowances**
  (metadata/gl-account-roles). Needed for orders contra booking.
- [ ] A5 · ERD + docs same-change update for whatever ships (standing convention).

**Orders baseline (`B202607061431…`):**
- [ ] O1 · **Rework `Order.JournalEntryID` → `OrderLine.JournalEntryID`** (the `OrderJournalEntry`
  junction was never built; today it's a single `Order.JournalEntryID` + trigger 51001). New column is
  nullable; **SOFT ref for now** (no FK constraint — CodeGen include-mode PR pending; hard FK after).
  `Order` carries NO JE ref (drop `Order.JournalEntryID` + its immutability trigger; add the per-line
  equivalent).
- [~] O2 · ~~Collapse `Confirmed`/`Posted`~~ → **NOT DOING** (Marcelo 2026-07-22, final). Keep the
  two-step status exactly as-is: Amith instructed not to change it ("there was a reason for it"), and
  it's outside the specific per-line-JE changeset he asked for — don't surprise him. Status / DAG /
  `isBookedStatus` / `orderBooking.ts` `PostedAt` all UNCHANGED.
- [ ] O3 · ERD + docs same-change update.

**Note — O1 rides with B2/B3, not a standalone schema stage:** dropping `Order.JournalEntryID` breaks
`orderBooking.ts`/`OrderEntityServer` immediately, and `OrderLine.JournalEntryID` is only consumed by
the new per-line booking. So the O1 schema move lands together with the factory + Save-override rework.

**Gate:** clean-DB rebuild green on **orders** (`app drop-schema` → `migrate` → `codegen` →
`build`) + A4 seed; tier-1/2 suites re-run (expect breakage from O1/O2 — fix forward).

## Phase B — The booking build (Amith's two named deliverables)

- [ ] B1 · **Resolver + cache into `OrdersEngineBase`:** move/extend the product GL-account
  resolution (product link → product-company's category tree → company default via
  GLAccountLink, role-keyed) into the browser-safe base engine with a lazy map
  `productID → { role → GLAccount }`. Existing `ResolveLinkedAccount`/`OrdersEngine` logic is
  the seed — reshape, don't duplicate. UI can later surface "accounts this product will use."
- [ ] B2 · **`OrderJournalEntryFactory`** (orders server package): input = an order (with
  lines); per line — resolve role accounts from B1, assemble the line's single-company JE
  (Dr line-company AR net · Cr Sales gross · Dr Sales-Discounts for discounts, netting into
  Sales when the role is unlinked · DefRev-typed products credit DefRev instead of Sales);
  create via the accounting engine (its own JE-scope transactions). Lines are independent —
  parallelizable. NO intercompany legs (MOD-15.4).
- [ ] B3 · **Order entity server `Save()` override rework** (the existing `OrderEntityServer`
  is the base to reshape, not a blank slate): on transition into the locked status — outer
  transaction → `super.Save()` → factory books per-line JEs → stamp each
  `OrderLine.JournalEntryID` → commit; ANY failure rolls back all (locked order without JEs =
  invalid state). Provider discipline: the entity's own provider throughout — never a fresh
  global `Metadata` in the transaction path.
- [ ] B4 · **Entity encapsulation:** `Lines` array of unsaved `OrderLineEntity`s on the order
  subclass + `Validate()` override (≥1 line; child validation). Engine-owned order creation
  remains for now (Amith: the full-encapsulation rework comes later — explicitly deferred).
- [ ] B5 · Tests re-fit: order-to-je harness re-written for per-line JEs (one JE per line incl.
  same-company multi-line; discount contra case; DefRev case; rollback case; idempotency =
  line-already-booked). Tier 1 draft rules updated. Downstream re-run discipline across tiers.

**Gate:** order-to-je harness green on the new shape + a walkthrough demo artifact (multi-line,
multi-company order → per-line JEs → aggregated order-JE view is deferred to UI).

## Phase C — Follow-through (not Amith's immediate asks; sequenced)

- [ ] C1 · UI aggregation view: the order's "journal entry" rendered as the composite of line
  JEs (order form Accounting tab) — rides the forms/workspace plans.
- [ ] C2 · Q25 re-closure with Robert/Jeremy lands → adjust (payment-side IC design moves to
  the payments slice; roadmap V1.7 re-costed).
- [ ] C3 · Deferred explicitly by Amith (do NOT build now): JE-entity Lines-encapsulation move ·
  `GLAccountRole` required-tracking column · coupon/campaign-code dimensions · subscription
  rev-rec rework session · fulfillment-based physical rev-rec.

## Ripple updates owed (kept honest)

- Roadmap `ROADMAP-lxp-launch.md`: V1.2 row (junction → OrderLine FK) and V1.7 row (MOD-14
  scope OUT of booking; IC to payments; re-cost) — annotated this change.
- FEATURE-LIST truth-up + header re-pin (both repos) against MOD-15/MOD-19 — **owed at Phase A
  close** (not done in this intake).
- S1/S2 slice plans: S1's category/company work unaffected; S2 batch rework gains A3.
  The S0 validation wave's order-to-je expectations change with B5.

## Decisions taken
- **Status model UNCHANGED — keep the two-step `Confirmed` → `Posted`** (Marcelo 2026-07-22, final:
  weighed the collapse, then reverted to leaving it as-is). Amith explicitly instructed not to change
  it ("there was a reason for it"), so we stay inside the specific orders changeset he asked for and
  don't surprise him. A future collapse can be revisited **with Amith directly** if ever warranted.
- **Orders→accounting link is a SOFT ref for now** (Marcelo owns the CodeGen include-mode PR); it
  becomes a HARD, nullable FK once that PR lands — the go-forward standard for parent→dependency refs.
- **A1/A2/A3 (accounting schema cleanup) DEFERRED** and notated in `bizapps-accounting/plans/DEFERRALS.md`
  (MOD-19 execution row); A3 rides S2. Orders is the priority.
- **For testing, seed `GLAccountLink` company-default rows** (roles: AR, Sales, Deferred Revenue, +
  the two contra roles) rather than build the role→account management UI now (Marcelo: hold off on
  account-link management).
- Q42 include-mode implementation is upstream MJ work — Marcelo owns it (green-lit separately).
