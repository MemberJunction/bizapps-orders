# Plan — Feature build: order lifecycle, payments, rev-rec (engine + server)

> **Status:** Draft (awaiting Marcelo review) · **Created:** 2026-07-11
> **Implements:** MASTER-PLAN §4.3, §6 (reversals), §7 (JE emission), §8 (subscription lifecycle) — as overlaid
> by MOD-1, MOD-5, MOD-7, MOD-8, MOD-9, MOD-10 + UPD-2, UPD-3; BACKLOG items "State-based validation matrix",
> "Fulfillment auto-advance", "Forward status skipping".
> **Sources:** the same set as the schema plan, plus the as-built integration
> (`packages/CoreEntitiesServer/`: `OrderEntityServer.ts`, `OrdersEngine.ts`, `orderJournalDraft.ts`) and
> `test-harnesses/testing.md`.
> **Depends on:** `ActionPlan - Schema alignment with master plan (O1-O5).md` — each feature block names the
> schema stage it consumes. Code referencing new columns waits for that stage's codegen (MJ rule 2b).

## 0. Scope

The engine/entity-server behavior that makes the new schema DO the master plan's job. UI is the companion UI
plan. Ordered to match the schema stages: F1/F2 ride S1, F3 rides S2, F4 rides S3, F5 rides S4. Everything
here is server-side TypeScript in `packages/CoreEntitiesServer` (+ `Actions`/remote ops where noted), tested
per `test-harnesses/testing.md` tiers (tier-1 pure units offline; tier-2 live server harness; committed, never
write-then-delete).

---

## F0 — Engine repackaging: `OrdersEngineBase` + server-only `OrdersEngine` (UPD-5, Amith 2026-07-11)

Extract **`@mj-biz-apps/orders-engine-base`** (new package, mirroring accounting's
`accounting-engine-base`): the catalog/config metadata caching (Product / ProductType / ProductCategory,
plus the GL-link lookup surface it consumes from `AccountingEngineBase`) and the pure logic
(`orderJournalDraft` assembly, totals math, waterfall when F4 lands) move to the base; the server-only
`OrdersEngine` becomes a thin convenience wrapper (AIEngineBase/AIEngine pattern). Booking stays a
**singular transactional `CreateJournalEntry` remote-op call** (Amith: critical for the transaction
wrapper — already as-built).

**Amith's "please confirm" answer (relay to him):** JE creation IS a single `Accounting.CreateJournalEntry`
remote-op call (atomic, proven end-to-end); the JE-draft logic IS in OrdersEngine reading Product rev-rec
rules + resolving accounts via accounting's `GLAccountLink` (his "ProductGLAccount rows" — MOD-2's
role-based mapping, cached in `AccountingEngineBase`); the one gap vs his guidance is the base/server
**packaging split**, which this F0 closes.

Sequenced FIRST — it's a mechanical refactor that every later feature block builds on top of (cheaper
before F1–F4 add engine surface). Existing tier-1/tier-2 harnesses must stay green through the move.

## F1 — Order lifecycle: transition matrix, totals, validation (consumes S1)

**The centerpiece — Robert's "how much validation is in place?" answered by construction.**

1. **Transition matrix (MOD-1 + MOD-7 + MOD-10)** in `OrderEntityServer`:
   - Stage order fixed: `Draft → Quoted → Confirmed → Posted → Fulfilled`; **forward skips legal**
     (Draft→Confirmed, Confirmed→Fulfilled via auto-post, etc.); no backward moves; `Voided` reachable ONLY
     from Draft/Quoted; Confirmed+ corrections go through reversal orders (F2).
   - Encode as a declarative `AllowedTransitions: Record<Status, Status[]>` table + a
     `validateTransition(from, to, order)` pure function (tier-1 tested exhaustively — all 36 pairs).
   - Prerequisite EFFECTS enforced regardless of skips (MOD-10): reaching Confirmed fires booking exactly once
     (existing `JournalEntryID` idempotency guard); can't reach Fulfilled unless Posted's effect (JEs in
     subledger) holds.
2. **Booking-time hard gate (BACKLOG "LOUD failure"):** at Confirm, if any line's account resolution fails
   (product → category tree → company default all miss) **the Confirm fails with a clear, specific error**
   (which line, which role, where resolution stopped) — never a partial JE, never a silent skip. Extend the
   existing `OrdersEngine.buildDraftForOrder` error path; add a tier-2 harness case (product with no link
   anywhere → Confirm rejected, order stays Draft/Quoted, no JE row).
   **Per-company split (MOD-11, 2026-07-13):** `buildDraftForOrder` now groups lines by resolved
   `GLAccount.CompanyID` and emits **one single-company draft per company**; booking executes them as a
   set — ALL succeed or the Confirm fails (no partial multi-company booking). `Order.JournalEntryID`
   (single) is reworked: idempotency guard becomes order-level (`ConfirmedAt`/any-JE-exists via
   `JournalEntry.OrderID`); lineage via `JournalEntryLink` per JE. The order-to-je harness reworks from
   "one JE, per-company-balanced lines" to "N single-company JEs" (accounting A4 is the counterpart).
3. **Totals materialization:** `LineTotalNet/LineTotalGross` computed on OrderLine save;
   `Order.TotalGross` = Σ lines, recomputed on line save/delete while Draft/Quoted (frozen after Confirm —
   enforced by the schema plan §6.1 immutability trigger, per Marcelo's 2026-07-11 triggers directive);
   `Balance = TotalGross − AmountPaid`; `PaymentStatus` derived
   (`Unpaid/PartiallyPaid/Paid`; `Overdue` = time-derived, computed in views/UI predicates off DueDate, NOT
   stored-state flips — avoids a cron mutating orders; `WrittenOff` is an explicit action).
4. **DueDate derivation:** at Confirm/Post, `DueDate = (PostedAt date || OrderDate) + PaymentTermsType.NetDays`
   when terms set and DueDate not manually supplied.
5. **Customer requirement rule:** `CustomerOrganizationID` required to ENTER Confirmed (validation, not DB
   NOT NULL — drafts stay free-form). Per gap report O1.
6. **Fulfillment auto-advance (UPD-3):** on reaching Posted, if NO line's product type
   `RequiresFulfillment` → auto-advance to Fulfilled; else set pending lines' `FulfillmentStatus='Pending'`
   and hold for the Fulfiller role. **No JE either way** (MOD-8).
7. **Backdating (MOD-9b):** `OrderDate` freely settable; JE bears it. **No closed-period guard — settled
   for now** (CA-3 resolved-for-now 2026-07-13: follow Amith's removal; the ERP's active period absorbs
   dispatched batches). Keep the named seam (`validatePostingDate()`, pass-through, comment pointing at
   CA-3) purely as the reopen point if Robert's research ever overturns the ruling.

**Tests:** transition-matrix unit suite; booking-gate harness; totals property tests (random line sets);
auto-advance both branches; existing order-to-je harness stays green.

## F2 — Reversal & credit-memo path (consumes S1)

1. **Reversal order creation op** (engine helper + remote-op/action for UI): given a source order + line
   slices → new Order (`OrderType='Return'|'CreditMemoOrder'|'Amendment'`, `ReversesOrderID`), negative-qty
   lines with `ReversesOrderLineID`, prices copied. Validation: can only reverse Confirmed+ orders; slice
   qty ≤ un-reversed remainder (stacking partial reversals, BO-D10).
2. **Booking a reversal order** rides the SAME Confirm path (F1) — draft assembly already handles Dr/Cr from
   signed amounts (verify `orderJournalDraft.ts` with negative lines; add unit cases). JE carries
   `ReversesJournalEntryID` → accounting's `trg_JE_ReversalConsistency` validates.
3. **Credit-memo settlement** (BO-D45/§6): negative-Balance orders settle by (a) Refund Payment (F3),
   (b) zero-cash application Payment netting credit against open orders (F3's PaymentLine handles signs),
   (c) write-off action → `PaymentStatus='WrittenOff'` + write-off JE. (c) may defer if no consumer.
4. **Void ≠ delete** (BACKLOG/Robert): Void = a real transition (F1 matrix) with its own confirmation; only
   Draft/Quoted. Delete stays available only for Drafts per permissions (§6.2 roles).

**Tests:** partial-reversal stacking unit suite; reversal-order → reversal-JE harness (assert accounting
trigger passes + net zero across the pair); over-reversal rejected.

## F3 — Payments engine (consumes S2) — Manual provider first, Stripe second

1. **`PaymentProvider` plugin base** (BO-D12, `@RegisterClass`/ClassFactory): v0 ships **Manual** only
   (record what finance did); **Stripe** next (BO-D23) once creds/webhook path decided. No PayPal/etc.
2. **Payment booking JE:** on Capture, emit via the SAME `Accounting.CreateJournalEntry` remote op (MOD-5):
   `Dr Cash(net) / Dr Processing Fee(if any) / Cr A/R(gross)` in the receiving company, with
   `CounterpartyOrganizationID` on the A/R line (feeds `vw_AROpenByCustomer`). Account resolution via
   GLAccountLink roles — needs **Cash + Processing Fee roles** linked at company level (coordinate with
   accounting plan A-S3 seed check). Idempotency guard: `Payment.JournalEntryID`.
3. **Cash application (Jeremy's core ask):** `PaymentLine` create/edit maintains
   `Order.AmountPaid/Balance/PaymentStatus` transactionally. Validation (`ValidateAsync`): Σ applications per
   payment ≤ |payment amount|; application currency-na (single-currency); negative applications only against
   credit-memo orders; applying marks the specific order settled (Jeremy: "not just net the customer balance").
   Auto-apply helper: one payment → oldest-open-orders-first suggestion (UI confirms; BO-D16 lump-sum flow).
4. **Refund/chargeback:** reversal Payment (`Method∈{Refund,Chargeback,BankReturn}`, negative amount,
   `ReversesPaymentID`) books the reversal JE; PaymentLines negative against the original orders.
5. **Stripe (second wave):** PaymentIntent lifecycle mapping + webhook receipt per BO-D13 (unauthenticated
   Express route, raw-body HMAC, `ProviderEventID` idempotency). Gate: needs the delivery/integration
   decisions (Q-D) NOT — Stripe is independent of bill.com; real gate is credentials + LXP consumer timing.

**Tests:** application-math unit suite (partial, multi-order, over-application rejected, credit-memo
application); tier-2 harness: manual payment → capture → JE (assert CounterpartyOrganizationID) → apply →
`vw_AROpenByCustomer`/`vw_ARAging` reflect the change end-to-end. This harness IS Jeremy's workflow in
miniature — it becomes the regression spine.

## F4 — Subscriptions + rev-rec bridge (consumes S3)

1. **Find-or-extend-or-create (BO-D40):** on first Confirm of a line whose product `SubscriptionType≠'None'`,
   create/extend the `Subscription` for (Product, Customer, Beneficiary); log `SubscriptionEvent`.
2. **Waterfall computation (BO-D11 + UPD-2, dated-entry semantics per Robert 2026-07-13):** pure function
   in the engine — input (line total, service period, shape) → `RevRecScheduleLine[]`, **each row bearing
   a specific recognition DATE** (not a period span):
   - `SingleDate` shape → one row, 100% on the date (event date; accounting `ScheduleCount=1`).
   - `ServicePeriod` shape → monthly **anniversary dates** across the service period (7/13, 8/13, …),
     rounding remainder front-loaded into row 1, uneven-start handling, no lapse gaps.
   - Schedules are created **at booking-lock** (with the Confirm JE) and pushed to accounting immediately
     (step 3); recognition then fires by date accounting-side (MOD-11 — CA-2 is resolved, no longer a
     gate). Residual Amith confirm: anniversary vs month-end-bucket dates (BACKLOG cadence entry, low
     stakes).
3. **Bridge to accounting:** new **`Accounting.CreateScheduledJournalEntries` remote operation** (MOD-5 says
   this follows the same pattern as CreateJournalEntry — the op itself is accounting-repo work; coordinate
   with accounting Feature plan). Orders persists its schedule + the SJE soft refs; supersede-on-recompute
   per §4.6 (renewals/amendments mark superseded SJEs, never mutate materialized ones).
4. **Renewal order spawning:** scheduled job (MJ Scheduled Actions) walks Active subs where
   `CurrentPeriodEnd − today ≤ RenewalLeadDays` and `AutoRenew` → spawns the renewal Order (Draft or
   auto-Confirm — **ask Jeremy/Robert**, see Q3 below) + `SubscriptionEvent('RenewalOrderSpawned')`.
   Jeremy: renewals invoice ~3 months ahead.
5. **Deferred-revenue visibility:** Robert asked "is anything in place to transfer DefRev→Revenue over
   time?" — the answer becomes: schedules visible on the line/order UI + accounting's `vw_DefRevRollforward`
   already built; materialization timing pending CA-2.

**Tests:** waterfall pure-function suite (golden cases incl. leap-Feb, 1-day period, SingleDate); bridge
harness (line → schedule → SJE rows sum to line total, supersede path); renewal-spawn harness with a frozen
clock.

## F5 — Tax v0 (consumes S4 decision)

Option A (quick path): seed `Tax` ProductType + per-jurisdiction tax products; engine treats Tax-type lines
as `Cr Sales Tax Payable` in the booking draft (account via GLAccountLink role on the tax product/company);
grand total = product + tax lines. Option B adds the provider invocation per §11 when accounting builds it.
Blocked on the Robert decision only.

## F6 — Permissions enforcement (consumes §6.2 roles)

Role-gated behavior once roles are seeded: Fulfiller sees/flips fulfillment; only Admin voids/reverses/
writes off; entity permissions per the metadata. Enforcement points in the entity server (transition guard
consults role), not UI-only. Co-designed with Marcelo alongside accounting MOD-9.

## Deferred (explicitly NOT in this plan)

- **Sales rules + approvals** (BO-D17/D27) — blocked on bizapps-tasks #8.
- **Intercompany leg generation + FX** — land with Payments *maturity*, after accounting's
  `IntercompanyRelationship` exists (accounting MOD-5/6; tracked in accounting ISSUES as UNOWNED).
- **Gift cards / stored value, entitlement provisioning, bundles engine, ASC-606 allocation, metered billing**
  — consumer-gated (schema S5).
- **Dunning automation, bill.com delivery, BC customer sync** — integration phase, decisions Q-C/Q-D pending.

## Execution order

F0 (engine split — first, mechanical, everything builds on it) → F1 → F2 (same S1 wave, F2 needs F1's
matrix) → F3-manual → F4 → F3-stripe / F5 / F6 as decisions land.

## Questions for Marcelo

1. **`Overdue` as derived (my plan) vs stored status flipped by a scheduled job?** Derived keeps state
   honest; stored makes filtering trivial. I lean derived + an indexed view/filter if perf demands.
2. **Auto-apply suggestion (F3.3):** worth building in the first payments wave, or manual application only
   until Jeremy uses it? I lean manual-first, suggestion fast-follow.
3. **Renewal orders: spawn as Draft (human confirms) or auto-Confirm (books JE immediately)?** Jeremy's
   3-months-ahead flow implies the invoice EXISTS (= Confirmed, since posted order is the invoice) — but
   auto-booking AR 90 days early is an accounting-posture question. **Route to Jeremy/Robert if you agree.**
4. **Write-off (F2.3):** build now with a dedicated JE pattern (Dr Bad Debt / Cr A/R needs a Bad Debt role
   account) or defer until requested? I lean defer — the enum value exists, the action can wait.
5. **F3 Stripe timing:** start right after Manual, or park until LXP integration talks (Ethan) begin?
