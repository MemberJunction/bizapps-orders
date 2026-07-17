# BACKLOG — bizapps-orders (plans-level)

Repo-level wanted-but-not-started work + decision-needed items. Holding pen only — promote an entry into
an `action-plans/ActionPlan - *.md` when picked up and mark it promoted. Entry: what · source · status.
Convention: `~/MJDev/shared-plans/repo-planning-system.md` §5.1. (The instance-level
`instances/<slug>/BACKLOG.md` tracks agent working items; this file tracks repo/plan-level items.)

## Tasks

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
- [ ] **Deferred-rev cadence: batch-monthly vs continuous running balance** — reproducibility is the hard
      requirement either way. `[decision needed: Amith]` (UPD-2).
- [ ] **Invoice delivery path** — AIDP → BC → bill.com (today) vs direct bill.com API; drives a future
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
