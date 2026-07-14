# MASTER-PLAN-MODIFICATIONS — bizapps-orders

A **living collection** (overlay) of changes to `MASTER-PLAN.md` (the write-forward-only source of
truth) — edit entries in place as decisions evolve; the file must never be self-contradictory (git is
the history). IDs are stable and never reused; keep each entry's reciprocal ⚠ inline marker in
MASTER-PLAN.md in sync when editing/withdrawing. **Precedence: Modification > Update > Extension >
original master-plan text.** Convention: `~/MJDev/shared-plans/repo-planning-system.md` §3.

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
- **Amith confirmation + general principle (2026-07-11 demo feedback):** use **Remotable Operations for
  larger encapsulated units of logical work**; plain BaseEntity subclasses are fine for creating
  Order/OrderLine-type records one at a time. It is **critical** that a JE + its line items are created
  through a **singular `AccountingEngine.CreateJournalEntry`-type call** so there is a proper transaction
  wrapper (the as-built op satisfies this; the same requirement extends to `CreateScheduledJournalEntries`).
  JE-creation logic belongs in the **OrdersEngine** (it knows the Product's accounting rules + GL mapping).
- **Why / source:** as-built integration (accounting engine action plan); 07-08 banner;
  `meetings/2026-07-11--Amith's Demo Feedback.md`.
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
- **Status:** (a) Accepted — not built; (b) Accepted — **backdating allowed with NO guard (final,
  2026-07-14; accounting MOD-13 was withdrawn same-day)** — accountants batch entries into the right
  periods; future timing rules would detect by date, never a period FK; (c) Implemented.

## MOD-10 — Forward status skipping is allowed (refines MOD-1's "linear" lifecycle) (2026-07-10)
- **Supersedes/refines:** MOD-1's "lifecycle is LINEAR: each stage required" and BO-D8's implied strict
  sequence — clarified: the ORDER of stages is fixed, but intermediate stages may be SKIPPED going forward.
- **Change:** Draft → Confirmed directly (without Quoted) is legal; Quoted is optional. What remains
  enforced: you cannot reach a later stage without its prerequisites' EFFECTS (booking still fires on the
  first Confirmed; can't Fulfill before Posted; Posted still means "JEs in the subledger").
- **Why / source:** Robert demo feedback 2026-07-10 (`meetings/2026-07-10--Robert-demo-feedback.md`:
  "You should be able to skip some of the Status values… Draft to Confirmed without hitting Quoted").
- **Status:** Accepted — enforce in the Order entity server's transition validation.

## MOD-11 — Booking emits ONE JE PER COMPANY (restores §5/§7; supersedes the as-built multi-company JE) (2026-07-13)
- **Supersedes:** the AS-BUILT single multi-company booking JE (Amith's 2026-07-02 CH-2 ruling, recorded
  in the amendment/baseline — never a master-plan text change) and MOD-1's single-`JournalEntryID`
  idempotency-guard mechanics. **RESTORES the master plan's original design:** §5's per-company JE
  example (JE A/B/C) and §7's "the generator emits **multiple JEs** (one per Company involved) all
  referencing the same Order."
- **Change:** at booking (first Confirmed), the draft builder **splits lines by resolved
  `GLAccount.CompanyID` and books ONE single-company JE per company involved**. Order↔JE becomes
  **one-to-many** (lineage via `JournalEntry.OrderID` + `JournalEntryLink`; the single
  `Order.JournalEntryID` column is reworked — idempotency guard becomes "order already booked", e.g.
  ConfirmedAt/BookedAt + any-JE-exists check). **NOT restored:** §5's booking-time intercompany AR/AP
  legs — leg generation stays Payments-side (accounting MOD-5); each company's booking JE already
  balances within itself (Dr own-AR / Cr own-revenue — the as-built per-company balance rule, AM-4).
  MOD-3 (no CompanyID columns on Order/OrderLine; per-line company via the resolved account) is
  **unchanged** by this.
- **Why / source:** Marcelo ruling 2026-07-13: accounting needs to see the separate per-company
  movements, and — decisive — **locks are JE-grained** (batch/approve locks whole JEs), so letting one
  company close/lock before another REQUIRES per-company JEs; a multi-company JE cannot be half-locked.
  Robert's model agrees (2026-07-13 meeting D3); the master plans already specified it (orders §5/§7;
  accounting master `JournalEntry.CompanyID NOT NULL`). ⚠ Supersedes an explicit Amith ruling (CH-2) —
  sanity-check with Amith (residual, with the Q20-residual batch).
- **Status:** Accepted — engine rework in the feature action plan F1/F0; accounting counterpart =
  accounting MOD-12 (single-company JE validation + CompanyID decision).
