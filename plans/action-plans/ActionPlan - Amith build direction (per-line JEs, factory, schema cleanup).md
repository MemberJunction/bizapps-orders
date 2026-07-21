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

## Phase A — Schema cleanup (edit baselines in place → clean DB rebuild → codegen)

Per the standing pre-production migration practice (MOD-19.5): fix the ORIGINAL baseline
migrations, rebuild on a clean database, re-run codegen, commit regenerated code with the
migration.

**Accounting baseline (`B202605281200…`):**
- [ ] A1 · Drop the five `AccountingCompanyProfile` GL-account FK columns (`ARGLAccountID` …
  `UnrealizedFXGainLossGLAccountID`) — company defaults become GLAccountLink rows (role-based)
  at the company level. Update seeds accordingly.
- [ ] A2 · Drop the `ChartOfAccountsMapping` table (+ its seeds/entities/UI references).
- [ ] A3 · Drop `JournalEntryBatchLineItem.CompanyID` (batch header owns company, MOD-15 acct).
- [ ] A4 · Seed the two contra `GLAccountRole` rows: **Sales Discounts**, **Returns &
  Allowances**.
- [ ] A5 · ERD + docs same-change update (standing convention).

**Orders baseline (`B202607061431…`):**
- [ ] O1 · Drop the `OrderJournalEntry` junction; add **`OrderLine.JournalEntryID`** (nullable,
  soft cross-app ref until CodeGen include-mode ships — acct Q42). `Order` carries NO JE ref.
- [ ] O2 · Collapse `Confirmed`/`Posted` into ONE locked status: lifecycle DAG, CHECK
  constraint, immutability triggers (51002/51003 trigger point), engine gates, UI states.
  Decide the surviving name in-code (Decisions-taken list), Amith indifferent.
- [ ] O3 · ERD + docs same-change update.

**Gate:** clean-DB rebuild green on both apps (`app drop-schema` → `migrate` → `codegen` →
`build`), tier-1/2 suites re-run (expect breakage from O2/O1 — fix forward).

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
- Surviving single lock-status name: decide at O2 implementation (lean: `Confirmed`).
- Q42 include-mode implementation is upstream MJ work — NOT in this plan (green-lit separately).
