# MASTER-PLAN-MODIFICATIONS — bizapps-orders

Append-only ledger of changes to `MASTER-PLAN.md` (the write-forward-only source of truth).
**Precedence: Modification > Extension > original master-plan text.** Every entry has a reciprocal
⚠ inline marker at the superseded section in MASTER-PLAN.md. Convention:
`~/MJDev/shared-plans/repo-planning-system.md`.

> **Backfill note (2026-07-10):** MOD-1..9 formalize the decisions previously scattered across the
> master plan's 🚦 banners, `meetings/2026-07-02-engine-meeting-amendment.md` (S1–S11), and the
> 07-08 / 07-09 Robert decision docs (all retained in `meetings/` as sources).

---

## MOD-1 — JEs book on the FIRST transition to `Confirmed`; `Posted` = JEs are in the subledger (2026-07-02 / 07-08)
- **Supersedes:** BO-D8's "Posted is the business-event commit" as the JE booking trigger; parts of §7.
- **Change:** the booking JE fires exactly once, on the first flip to `Confirmed` (idempotency guard =
  `Order.JournalEntryID`). `Posted` means "the journal entries are in the subledger" — near-instant after
  Confirm. Lifecycle is LINEAR: each stage required (can't Fulfill before Posted).
- **Why / source:** 07-02 amendment S4; Robert 2026-07-08 D1 (orders doc).
- **Status:** Implemented (`OrderEntityServer.Save()`).

## MOD-2 — Product carries NO GL columns; role-based `GLAccountLink` mapping in accounting (2026-07-02)
- **Supersedes:** §4.1 `Product.RevenueGLAccountID / DeferredRevenueGLAccountID / COGSGLAccountID`;
  BO-D19's "default GL accounts" mechanism (the rev-rec-type-driven pattern selection stands).
- **Change:** accounting's polymorphic `GLAccountRole`/`GLAccountLink` points AT Product / ProductCategory /
  Company rows (date-effective, role-keyed); Orders resolves via `AccountingEngineBase.ResolveLinkedAccount`
  (product → up the category tree → company default).
- **Why / source:** 07-02 amendment S3; accounting MOD-10.
- **Status:** Implemented (schema + resolver).

## MOD-3 — No CompanyID on Order OR OrderLine; company resolved via the line's GLAccount (2026-07-02)
- **Supersedes:** BO-D5's `OrderLine.CompanyID` mechanism (the multi-company INTENT stands).
- **Change:** each line's owning company = the resolved `GLAccount.CompanyID` at booking time; no company
  columns in the orders schema. ⚠ Revisit when Payments lands: §5's "receiving company" concept lives on
  `Payment.ReceivingCompanyID`, which is unaffected.
- **Why / source:** 07-02 amendment S5.
- **Status:** Implemented (baseline schema).

## MOD-4 — Currency/FX deferred from the v1 baseline (2026-07-02)
- **Supersedes:** BO-D22's v1 timing (the design — rates from accounting, per-transaction snapshot — stands).
- **Change:** no currency/FX columns in the baseline Order/OrderLine; add them when multi-currency activates.
- **Why / source:** 07-02 amendment S10; Robert 07-10: "do we need it on day one? No."
- **Status:** Implemented (deferred).

## MOD-5 — `AccountingService` façade → `AccountingEngine` + `Accounting.CreateJournalEntry` remote operation (2026-07)
- **Supersedes:** BO-D7 / BO-D28 mechanism (the contract INTENT — atomic balanced-set creation, Orders
  drives the draft shape — stands); every `AccountingService.*` call in §7 and elsewhere.
- **Change:** JE emission calls `new CreateJournalEntryOperation().Execute(draft, {user})`; the engine pair
  (OrdersEngine + AccountingEngine, BO-D30) is as planned. `createScheduledJournalEntries` will follow the
  same remote-operation pattern when the rev-rec bridge is built.
- **Why / source:** as-built integration (accounting engine action plan); 07-08 banner.
- **Status:** Implemented (order→JE proven end-to-end).

## MOD-6 — Pricing is order-line-only for now; catalog pricing BUILD deferred (2026-07-08)
- **Supersedes:** BO-D33's v1 timing (the PriceList/ProductPrice/PriceTier model remains the target shape).
- **Change:** `OrderLine.UnitPrice` is entered directly; no price resolution engine, no pricing tables yet.
- **Why / source:** Robert 2026-07-08 D3; re-flagged 07-10 (CA-1).
- **Status:** Accepted.

## MOD-7 — Confirmed/Posted/Fulfilled orders cannot be Voided; reverse via reversing/credit order (2026-07-08)
- **Supersedes:** BO-D8's implied Voided reachability from any state (BO-D9/D10/D15 reversal machinery stands
  and becomes the ONLY path after Confirm).
- **Change:** `Voided` reachable only from Draft/Quoted. After Confirm, corrections are reversing orders /
  credit-memo orders (negative lines, `ReversesOrderID`).
- **Why / source:** Robert 2026-07-08 D4.
- **Status:** Implemented (baseline CHECK reflects Voided-from-Draft/Quoted intent; enforce in entity server).

## MOD-8 — Fulfillment ↔ revenue recognition are DISCONNECTED (2026-07-09)
- **Supersedes:** the "Fulfilled recognizes deferred revenue" intent (Q16); any JE on Posted→Fulfilled.
- **Change:** fulfillment = delivery of value, a logistics fact. Deferred revenue is recognized by
  **scheduled transactions** (the ScheduledJournalEntry waterfall, accounting AD-11/BA-D25) on their own
  cadence — never by the Fulfilled flip. No JE fires on Posted→Fulfilled.
- **Why / source:** Robert 2026-07-09 (orders decisions doc).
- **Status:** Accepted.

## MOD-9 — Additive 07-09 rulings: app-seeded roles, backdating, shipped UX (2026-07-09)
- **Supersedes:** none (additive).
- **Change:** (a) Orders seeds its own roles in migrations (order entry + an order **fulfiller** role),
  mirroring accounting's MOD-9 permissions model (MJ roles + RLS). (b) **Backdating allowed** — the order
  carries its `OrderDate` and the JE bears it; the only guard is a closed period → ⚠ gated on the
  periods reconciliation (CA-3 / accounting CA-1 / Q18). (c) Shipped: order naming (`Order.Description`),
  moving-window filter presets on Order History.
- **Why / source:** Robert 2026-07-09 (orders decisions doc).
- **Status:** (a) Accepted — not built; (b) Accepted — guard blocked on CA-3; (c) Implemented.

## MOD-10 — Forward status skipping is allowed (refines MOD-1's "linear" lifecycle) (2026-07-10)
- **Supersedes/refines:** MOD-1's "lifecycle is LINEAR: each stage required" and BO-D8's implied strict
  sequence — clarified: the ORDER of stages is fixed, but intermediate stages may be SKIPPED going forward.
- **Change:** Draft → Confirmed directly (without Quoted) is legal; Quoted is optional. What remains
  enforced: you cannot reach a later stage without its prerequisites' EFFECTS (booking still fires on the
  first Confirmed; can't Fulfill before Posted; Posted still means "JEs in the subledger").
- **Why / source:** Robert demo feedback 2026-07-10 (`meetings/2026-07-10--Robert-demo-feedback.md`:
  "You should be able to skip some of the Status values… Draft to Confirmed without hitting Quoted").
- **Status:** Accepted — enforce in the Order entity server's transition validation.
