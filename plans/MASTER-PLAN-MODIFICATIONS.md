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

## MOD-3 — Order gains a header `CompanyID` (owning company); the LINE's company derives from the PRODUCT (2026-07-02; rev. 2026-07-16 per Q2; rev-2 2026-07-17 Marcelo)
- **Supersedes:** BO-D5's `OrderLine.CompanyID` mechanism (the multi-company INTENT stands) and
  this entry's own earlier "line company = resolved `GLAccount.CompanyID`" derivation.
- **Change (current, edited in place per ledger hygiene):**
  (a) **`Order.CompanyID` IS added** — the OWNING company (owns the customer relationship + the
  document, defaulted from the sales channel). It is the **document/ownership/visibility** anchor
  (cross-company visibility = [Q23](QUESTIONS.md#q23)); it does **NOT** drive GL resolution and
  does NOT override line-level revenue ownership.
  (b) **The line's company derives from the PRODUCT** — `Product.CompanyID` (required NOT NULL;
  confirmed in Robert's written answers 2026-07-20 — the code's nullable `OwningCompanyID` flips
  with S1; UX auto-populates when only one company is in play). The resolved account MUST belong
  to the same company — invariant + enforcement tiers per accounting UPD-5.
  (b2, rev-3 — Robert's written answers 2026-07-20): **`OrderLine.CompanyID` IS added** as a
  **denormalized copy of `Product.CompanyID` stamped at line save** — NOT an RLS need (visibility
  is owner-scoped, Q23 revised answer) but a performance/reporting column: JE per-company
  splitting and per-company reporting read line company hot, and it removes the last
  account-derivation dependency. Revises this entry's earlier no-line-company stance.
  **Temporal-integrity rationale (Marcelo 2026-07-21):** the stamped copy also preserves history —
  if a product's ownership ever changes, existing lines still record who owned them at
  transaction time. The same snapshot-at-transaction mindset applies to accounts (JE lines
  already snapshot resolved GLAccount IDs).
  (c) **Naming ruled schema-wide:** `Product.OwningCompanyID` and `Subscription.OwningCompanyID`
  rename to plain **`CompanyID`**; role-qualified names stay only where the role is the point
  (`Payment.ReceivingCompanyID`, etc.).
  (d) **Account resolution walks against the PRODUCT's company:** product link → category tree →
  **the product-company's default** (rev-2 refinement of Robert's Q2 answer, which had the final
  rung resolving against `Order.CompanyID` — flag the delta to Robert). Amith's "Izzy" case still
  works (single-company adopter: product company = order company). If even the company-default
  rung misses, **fail loudly** (tripwire stays).
  (e) ⚠ **Deep-dive flag (Marcelo):** the resolution path is a coming **performance + complexity
  pain point** — a dedicated deep dive is BACKLOGged before it's load-bearing at volume.
- **Evolution note:** 2026-07-02 = no company columns; Q2 answer (2026-07-16) added the header +
  renames + a rung; rev-2 (2026-07-17) moved line-company derivation and the resolution anchor to
  the product.
- **Why / source:** 07-02 amendment S5; Robert Q2 answer; Marcelo rev-2 ruling 2026-07-17.
- **Status:** Implemented (baseline) + **schema/engine amendment pending** (Order.CompanyID +
  renames + product-company derivation + resolution rework — roadmap V1.1).

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

## MOD-6 — Pricing precedence anchored on direct entry; catalog pricing BUILD restored (2026-07-08, rev. 2026-07-14)
- **Supersedes:** BO-D33's v1 timing was deferred here on 2026-07-08 (Robert D3) — **the deferral was
  LIFTED by Marcelo on 2026-07-14** ("we should consider not [deferring]"; Robert had re-flagged the
  tables 07-10). What survives of the original entry: `OrderLine.UnitPrice` **direct entry remains valid
  and is the base of the precedence chain** — the pricing engine layers resolution/suggestion on top,
  so pricing never blocks baseline testing.
- **Change (current):** pricing tables (`PriceList`/`ProductPrice`/`PriceTier`, §4.1 shapes) build in the
  schema plan's **S5 parity wave** (BUILT 2026-07-14); the resolution engine (BO-D33 precedence + BO-D38
  behavior hooks) is feature phase **F9**.
- **➕ Extended 2026-07-14 — COUPONS/PROMO CODES join the pricing scope (LXP D10, Amith: "v1, not
  hard"):** the master plan carried no discount-code machinery (only per-line `DiscountPct`); the LXP's
  LH4I checkout needs codes at launch. New schema stage **S7** (Coupon + CouponRedemption, §4.1-adjacent
  shapes) + an F9 resolution-hook. Full feature (schema → engine → UI) is specified in
  `action-plans/ActionPlan - Coupons (schema to UI).md` — **pending Robert's schema-structure review
  (their A2: Robert specs/blesses), then it executes as written**.
- **Why / source:** Robert 2026-07-08 D3 (defer) → Robert 07-10 re-flag → Marcelo 2026-07-14 (un-defer) →
  LXP requirements 2026-07-14 (D10, coupons v1; Marcelo approved the plan-first path).
- **Status:** Accepted — S5 (tables, built) + F9 (engine) + S7/coupon plan (awaiting Robert review).

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

## MOD-12 — Rev-rec staged as REAL forward-dated JEs; the ScheduledJournalEntry bridge retires (BO-D11 rewrite) (2026-07-14/15)
- **Supersedes:** BO-D11's `ScheduledJournalEntry` emission + UPD-2's schedule-bridge mechanics
  (G.3) + the materialization path (G.4). The **waterfall computation itself stands** (BO-D24
  math, UPD-2's two recognition shapes, `RevenueRecognitionSchedule` may remain as the computed
  envelope) — what changes is what gets WRITTEN.
- **Change:** at booking-lock, Orders writes the recognition waterfall as **actual future-dated
  JEs** into accounting (12-month sub → 12 real JEs, each with its own `EffectiveDate`) via the
  same singular transactional call pattern (MOD-5). No schedule records to materialize, no
  materializer, no daily job. **Contract change/cancel = a correcting Order** whose new rev-rec
  entries NET against the staged ones (staged entries are never edited/deleted) — the same
  reversal model as MOD-7. Batches only pick up forward-dated entries when their date filter
  explicitly reaches forward (default cutoff = today, accounting MOD-17).
- **Why / source:** Robert P5 (`meetings/2026-07-14-je-single-company-batching-proposal.md`) +
  his 2026-07-14 meeting ruling ("just create them" — a scheduled wake-up task is fragile);
  Jeremy agreed 2026-07-15 ("cleaner model than what I had in mind"). Accounting counterpart:
  **MOD-17** there.
- **Status:** Accepted — engine rework (F4 family) + accounting schema retirement to schedule.

## MOD-13 — LH4I launch wiring: LXP → Orders DIRECT; BCSaaS wrap is a fast-follow; Teams-first contingency (2026-07-14)
- **Supersedes:** nothing in the master text (additive launch-path decision) — recorded as a MOD
  because it sets the build's critical path and reverses the default `LXP → BCSaaS → Orders`
  layering for launch.
- **Change:** for the ~30-day LXP launch, the LXP consumes BizApps Orders **directly** for the
  LH4I flow (3 tiers + coupons + track/bundle + upfront Stripe payment); the BCSaaS-wrap (their
  D4) moves OFF the launch critical path to fast-follow. If BAO cannot make the launch window,
  the sequencing contingency is **Teams-first** (LH4T is AD/manual, zero checkout dependency) and
  LH4I self-serve switches on the moment Orders lands — never any new CDP wiring. **The open item
  (their A7): Robert + Marcelo owe Ethan a realistic date for a minimal LH4I-capable BAO** —
  tracked in [Q22](QUESTIONS.md#q22) + `ROADMAP-lxp-launch.md`.
- **Why / source:** `meetings/2026-07-14 - lxp-commerce-and-fulfillment 2.md` §8 (Ethan's team
  lean, decisions D1–D16 locked by Amith + John).
- **Status:** Accepted (the lean is the plan unless Amith/Robert object at the A7 date sitting).

## MOD-14 — Booking JE shape: SELLER-OF-RECORD AR + mirrored intercompany legs at booking (2026-07-20)
- **Supersedes:** the as-built per-company booking draft (each company Dr own-AR / Cr own-revenue,
  AM-4's per-company self-balance) on the AR side. MOD-11's one-JE-per-company SPLIT stands; what
  changes is what each JE contains.
- **Change (Robert's mechanics, 2026-07-20 Monday meeting — accounting Q39 answer):** at booking
  of a multi-company order (owner A, sibling B):
  **A's JE:** Dr AR (FULL order amount) · Cr A-revenue/DefRev (A's lines) · Cr **Due-To-B (AP)**
  (B's share) — one per sibling.
  **B's JE:** Dr **Due-From-A (intercompany AR)** · Cr B's revenue-or-DefRev — resolved against
  B'S OWN accounts (product → B's category tree → B default). Revenue is NEVER recognized in the
  owner for a sibling's product (no double recognition); forward-dated rev-rec entries (MOD-12)
  live entirely under the sibling's accounts. Each JE balances within its company (whole-entry
  balance rule unchanged). Due-to/due-from = money only, disconnected from revenue. Payment side
  unchanged in ownership: Payments clears the owner's AR to cash and clears the Due-To/Due-From
  pair on the cash transfer (accounting MOD-5 as revised).
- **Anchor split (reconciles Robert's Q2 answer with MOD-3 rev-2):** revenue-side account
  resolution anchors to the PRODUCT's company; **AR/cash/due-to-from anchor to the ORDER-owning
  company** (seller of record). Tax remit: selling company (Robert; Jeremy verifies nexus via
  acct Q19).
- **Account mechanics (Robert's written answers, 2026-07-20 — canonical worked example in
  `meetings/2026-07-20-Robert-q23-q38-q39-answers.md`):** the IC link is one account-type pair —
  **Intercompany AR (Due-From)** on each sister · **Intercompany AP (Due-To)** on the owner, per
  counterparty — affiliate CONTROL accounts, separate from trade AR/AP; settlement moves only
  Cash + this pair, never revenue. Requires **two new GLAccountRoles** (+ Sales Tax Payable if
  tax launches) and a **per-affiliate resolution key (entity x counterparty)** — richer than
  ResolveAccount's (product x role x company); decide the routing shape BEFORE building legs.
  **`IntercompanyFlow` pulls FORWARD from deferred to the launch model** — a real scope item to
  surface in the BAO-date discussion. No COGS/inventory in v1 (digital goods).
- **Why / source:** `meetings/2026-07-20 - Accounting Meeting - Marcelo robert Ian.md`; acct Q39
  answer; Marcelo: "when I write the order creation system, it's got to do that."
- **Status:** Accepted — engine rework rides roadmap **V1.7 / slice S3** (pairs with the rev-rec
  emission rework; the intercompany per-pair accounts must exist for the legs — provisioning
  detail lands with the slice).
