# BACKLOG — bizapps-orders (plans-level)

Repo-level wanted-but-not-started work + decision-needed items. Holding pen only — promote an entry into
an `action-plans/ActionPlan - *.md` when picked up and mark it promoted. Entry: what · source · status.
Convention: `~/MJDev/shared-plans/repo-planning-system.md` §5.1. (The instance-level
`instances/<slug>/BACKLOG.md` tracks agent working items; this file tracks repo/plan-level items.)

## Tasks

- [ ] **Re-sequence the Coupons action plan against UPD-8** — the drafted plan is Option-B-shaped
      (Coupon entity first); UPD-8 rules Option A for launch (provider model + both-level discount
      recording first; the Coupon entity becomes the fast-follow provider). Rework the plan's
      stages before executing; Robert's OS7 review checklist applies to the recording schema.
      (2026-07-17 sweep; "circle back when we get there" — Marcelo.)

- [ ] **Navigation routing / back-button (UI)** — cross-links (order → JE → accounting app,
      product → category, slide-in pop-outs) have no "go back" affordance; routing is manual.
      Consider a history/back mechanism — likely part MJ Explorer platform (tab/navigation
      history — candidate Matt ask) and part app-shell (workspace-tab return links). (Marcelo,
      2026-07-17.) Twin row in the accounting BACKLOG.

- [ ] **GL account-resolution deep dive (performance + complexity)** — Marcelo flag 2026-07-17
      (MOD-3 rev-2): the product → category → company-default walk, per-line at booking, across
      multi-company orders, is "going to become a performance and complexity pain point that's
      going to require a deep dive." Scope: resolution caching strategy (OrdersEngine catalog
      cache coverage), whether line company should be materialized as a stored column for RLS/
      query efficiency (orders Q23 sub-q 3), the Q38 same-company invariant's enforcement cost,
      and category tree shape (company-specific vs per-company routing). Also weighs
      **denormalizing `CompanyID` onto GLAccountLink** (engine-stamped, trigger-verified) — turns
      the UPD-5 uniqueness rule into a plain unique index AND drops the resolver's account join
      (Marcelo 2026-07-17: likes the thinking, NOT yet approved — decide here). Revisit trigger:
      before resolution is load-bearing at real volume (V2 exit), or the Q38/Q31 sitting landing.

- [x] ~~**Order form: surface the full field set**~~ — PROMOTED 2026-07-11 →
      `action-plans/ActionPlan - UI layout and workflows (orders).md` §1.
- [x] ~~**Compose Order takes the full available space**~~ — PROMOTED 2026-07-11 → UI action plan §1.
- [x] ~~**Void affordance ≠ delete**~~ — PROMOTED 2026-07-11 → UI action plan §1 + Feature action plan F2.4.
- [x] ~~**State-based validation matrix** (+ LOUD missing-account-map failure at Confirm)~~ — PROMOTED
      2026-07-11 → `action-plans/ActionPlan - Feature build (lifecycle, payments, rev-rec).md` F1.
- [x] ~~**Fulfillment auto-advance** (UPD-3)~~ — PROMOTED 2026-07-11 → Feature action plan F1.6
      (+ schema plan S1.4 for `ProductType.RequiresFulfillment`).
- [x] ~~**Forward status skipping** (MOD-10)~~ — PROMOTED 2026-07-11 → Feature action plan F1.1.
- [ ] **Customer identifier stability strategy** — stable account number across systems (dups/acronym
      mismatches are a real pain today); lean on bizapps-common Organization identity + external refs when
      the BC/bill.com integration lands. — Jeremy 2026-07-10. (Noted in schema action plan as a
      bizapps-common concern — NOT an orders migration.)

## Decisions needed

- [ ] **Order numbering: single sequence vs BC-style dual (draft seq → posted seq)** — Jeremy doesn't use
      it as a control today ("maybe it should be"). `[decision needed: Jeremy]` — blocks UPD-1's related
      sequence work, not the ExternalDocumentNumber column itself.
- [x] ~~**Deferred-rev cadence: batch-monthly vs continuous running balance**~~ — **SUPERSEDED
      2026-07-17 by MOD-12/acct MOD-17:** rev-rec is real forward-dated JEs at booking; there is no
      materialization job, so cadence has no referent. ~~reproducibility is the hard
      requirement either way. `[decision needed: Amith]` (UPD-2).
- [x] ~~**Invoice delivery path**~~ — **LEAN RECORDED 2026-07-16 (Robert OQD → UPD-10):** email
      render first with an Action-plugin seam; bill.com becomes a delivery adapter when a channel
      needs it. Build lands post-launch (V4). ~~AIDP → BC → bill.com (today) vs direct bill.com API; drives a future
      integration action plan (multiple recipient emails/CC per customer via bizapps-common ContactMethod).
      `[decision needed: Robert/Amith]` — meetings/2026-07-10-decisions.md §H.
- [ ] **AIDP read-only access for schema mapping** — Jeremy offered; get a seat to map the real
      customer/contract/invoice shapes. `[action: Marcelo/Jeremy]`

### Refund must be ONE atomic operation — `Orders.RefundPayment` (F3.4) — added 2026-07-16

- **Marcelo's ruling (2026-07-16):** *"the fact that there's no server op that writes the reversal
  payment and the journal entry in one transaction, that's a problem. We need to make that happen in
  one transaction."*
- **The gap:** orders exposes `CapturePayment`, `ConfirmOrder`, `CreateReversalOrder` (an ORDER
  reversal — not a payment refund), `CreateRevRecSchedule`, `GetOverdueWorklist`, `GrantEntitlements`.
  **None refunds a payment.** So the Refunds screen ships as history-only (§13.2), and the refund
  action has nowhere to call.
- **NOT blocked on Stripe.** This was mis-scoped in my first report as "it moves money, so it needs
  the integration". It does not: on our side nothing moves except the journal entry. A refund here is
  a **reversal Payment row + a reversing JE** — both writable today. The provider call is a separate,
  deferred concern; a Manual-provider refund is fully expressible now.
- **Why it must be an OP, not two entity saves from the browser:** the reversal Payment and its JE
  must commit together or not at all. Two saves from the UI can half-fail — a payment row with no
  journal entry (money apparently returned, ledger silent) or a JE with no payment. Identical
  atomicity argument to `ConfirmOrder`, which composes the order row + its JEs in one
  TransactionGroup precisely because TransactionGroups do not cross the GraphQL boundary.
- **Shape (mirrors ConfirmOrderOperation):** `Orders.RefundPayment { PaymentID, Amount, Reason }` →
  open ONE TransactionGroup → queue the reversal Payment (`ReversesPaymentID` = the original,
  `Status='Refunded'`, negative-or-reversing amount per the ledger's convention) → queue the
  reversing JE via accounting's `QueueJournalEntries` seam (validate, no Submit) → `Submit()` once.
  Guards: amount ≤ the payment's un-refunded remainder; refuse a payment that is not `Captured`;
  refuse double-refunding (an existing reversal).
- **Then:** the Refunds page's action lights up (the grid + reversal chain already exist), and its
  "history only" notice comes out.
- **Effort:** ~one operation + its guards; the UI is already built around it.

---

## Create an order directly into `Fulfilled` — needs a Remote Operation, not a status write
- **Added:** 2026-07-16 · **Source:** Marcelo, GUI review of the order editor — *"able to create an order
  into posted and fulfilled should be fine. Creating one into voided is a problem... it sounds like creating
  one into posted or fulfilled would require server work so that it flows through the confirm first, and we
  check that it actually posts, and then we move it to fulfilled... creating in the posted, you don't need...
  you should just be able to create in the confirm. There's no reason to create in the posted. Confirmed
  flows to posted... we should leave fulfilled in there grayed out for now. But eventually, we're gonna wanna
  be able to create into fulfilled, and you should just backlog the actual feature to allow that to happen
  where we'd have to go and create a, like, remotable op that does that as your transaction and all that."*
- **Shipped now (UI wave):** the editor's start-status picker offers Draft / Quoted / **Confirmed**;
  Confirmed routes through the existing `Orders.ConfirmOrder` remote operation so the balanced JE is still
  booked atomically. **Posted / Fulfilled / Voided are offered but disabled with a reason.**
- **Why a plain status write is not acceptable:** `OrderEntityServer` books the journal entry on the
  transition to `Confirmed`. Writing `Status = 'Posted'` (or `'Fulfilled'`) from the browser would skip that
  hook entirely and produce a posted order with **no journal entry** — silently unbalanced books, with no
  error. TransactionGroups do not cross the GraphQL boundary, so the unit of work cannot be composed client
  side. This is exactly why Confirm is a server op.
- **Per Marcelo's own reasoning, `Posted` is NOT wanted as a start status** — Confirmed flows to Posted, so
  offering it buys nothing. **`Voided` is explicitly out** ("creating one into voided is a problem").
- **The feature:** an `Orders.CreateOrderInState` (or `Orders.FulfillOrder`) remote operation that, in ONE
  TransactionGroup: creates the order → runs the real Confirm path (booking the JE, honouring every existing
  block, e.g. an unresolved GL mapping) → **verifies it actually posted** → advances to `Fulfilled`. Any
  failure rolls the whole thing back; a blocked Confirm surfaces the same `Errors` the editor already renders.
- **Then:** the editor un-greys `Fulfilled` and routes it at the op. The picker + its blocked-reason map are
  already in place, so the UI change is one line.
- **Related:** the atomic refund op (above) — same pattern, same reason.

## Order naming — add `Order.Name` (schema)
- Source: Marcelo 2026-07-17. Users must be able to NAME orders — for distinct workspace-tab captions and for name-search (task 41/47).
- Order today has `OrderNumber` (system id), `Description` (customer-facing memo), `Notes` (internal). None is a short human label meant for the tab/search.
- Proposed: add optional `Name NVARCHAR(200) NULL` to Order. Drives the tab caption when set (falls back to OrderNumber); shown + searchable in All Orders. Migration + codegen + the GUI wiring (task 47).
- Decision needed from Marcelo: dedicated `Name` column vs. repurpose `Description` as the name. Recommend a dedicated `Name` (Description stays the customer-facing memo — different purpose).

### ⚠ DECIDED 2026-07-17 (supersedes the "add Order.Name" item above)
Marcelo ratified the accounting-norm model: **transactions get number + memo; master data gets names.**
- **Orders:** NO new `Name` column. Use the EXISTING `Order.Description` as the searchable memo — surface
  it in All Orders, drive the workspace-tab caption from it, include it in name/memo/ID search. No migration.
- **Products / product categories:** already named — just ensure name+ID search covers them. No schema.
- The only orders-side schema work is nil. The batch memo (accounting) is the sole migration in this feature.

## ═══ UI TASKS — deferred until after the test harness ═══
See bizapps-accounting/plans/BACKLOG.md "UI TASKS — deferred until AFTER the test harness" for the full,
decision-detailed list (grid rework #32 + chips-required doctrine, master-data ID-search sweep, order memo
is done). Orders-specific: All Orders grid rework (UI-1) lands here; order Description-as-memo + name/ID
search on all-orders/all-payments already shipped this round.
