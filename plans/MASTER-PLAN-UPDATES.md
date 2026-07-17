# MASTER-PLAN-UPDATES — bizapps-orders

A **living collection** (overlay) of **small refinements/additions** to existing `MASTER-PLAN.md`
sections — changes that keep a section's intent (new field, clarified behavior). Edit entries in place as
decisions evolve; never self-contradictory (git is the history); IDs stable/never reused; reciprocal ➕
inline markers kept in sync. Reversals/supersessions go to `MASTER-PLAN-MODIFICATIONS.md` (MOD-*);
meaningful scope expansion is an Extension. **Precedence: Modification > Update > Extension > original
text.** Convention: `~/MJDev/shared-plans/repo-planning-system.md` §3.1.

---

## UPD-1 — Order carries an `ExternalDocumentNumber` (2026-07-10)
- **Amends:** MASTER-PLAN.md §4.2 (Order) — additive field; section intent unchanged.
- **Change:** add `Order.ExternalDocumentNumber NVARCHAR` — required for the bill.com sync path (bill.com
  will not sync an invoice without it). May equal `OrderNumber`, but exists as its own column (BC +
  bill.com carry two identifiers today). Related open decision — single vs BC-style dual numbering
  (draft sequence → separate posted sequence) — is in `BACKLOG.md` `[decision needed: Jeremy]`.
- **Why / source:** Jeremy feature-collection meeting 2026-07-10 (`meetings/2026-07-10-decisions.md` §C).
- **Status:** Accepted.

## UPD-2 — Service period rides the order line; deferred revenue has two recognition shapes (2026-07-10)
- **Amends:** MASTER-PLAN.md §4.2 (OrderLine), §4.4/§4.6 (subscription/rev-rec) — refines, intent unchanged.
- **Change:** (a) add `OrderLine.ServicePeriodStart` / `ServicePeriodEnd` — the contract/subscription
  coverage period rides the line (Jeremy's invoice lines carry it; Robert: "store dates with the Order
  Line (or the related Subscription entity)"). (b) Deferred recognition supports at least TWO shapes:
  **single-date** (e.g. an Event Date — 100% recognized on that date; maps to accounting's
  `ScheduleCount=1` deferral, BA-D25) and **period subscription** (Annual/Quarterly/Monthly waterfall over
  the line's service period).
- **Concrete semantics (Robert 2026-07-13 → accounting MOD-11):** the waterfall's rows are **dated
  entries created up-front at booking-lock** — a $1,200 annual sub sold 7/13 yields 12 × $100 scheduled
  entries dated 7/13, 8/13, … 6/13 (monthly **anniversary dates**); an event product yields ONE entry
  dated the event date. Recognition fires by date; accounting batches pick entries up by date window.
  The remaining Amith cadence question (`BACKLOG.md`) now only concerns the producer's date granularity
  (anniversary vs month-end buckets) — low stakes.
- **Why / source:** Robert demo feedback (`meetings/2026-07-10--Robert-demo-feedback.md`) + Jeremy meeting
  (`meetings/2026-07-10-decisions.md` §D) + Robert 2026-07-13
  (`meetings/2026-07-13-robert-meeting-decisions.md` D1).
- **Status:** Accepted.

## UPD-3 — `RequiresFulfillment` drives auto-advance to Fulfilled (2026-07-10)
- **Amends:** MASTER-PLAN.md §4.1 (`ProductType.RequiresFulfillment`) — clarifies planned behavior.
- **Change:** on save of a Posted order, if NO line's product requires fulfillment, the order may
  auto-advance to `Fulfilled`; any fulfillment-requiring line (e.g. physical goods) holds the order for
  the fulfiller role (MOD-9 item a). Per MOD-8, this flip has NO revenue-recognition effect.
- **Why / source:** Robert demo feedback 2026-07-10 ("Physical products require fulfillment and that will
  be part of the logic when saving a Committed Order").
- **Status:** Accepted — implementation task in `BACKLOG.md`.

## UPD-4 — Positioning wording: an invoice/payment-management system NAMED "Orders" (2026-07-11)
- **Amends:** MASTER-PLAN.md §1 (Context and positioning) — clarifies wording; intent unchanged.
- **Change:** the app is best understood as an **invoice creation & tracking + payment management**
  system — but its official name and entity vocabulary are **Orders** (a deliberate wording choice from
  the higher-ups; respect it). Use "invoice management / payment management" only as category ANALOGS
  when explaining the app; never reintroduce "Invoice" as an entity, type, or status (consistent with
  BO-D45/CA-2 and Robert's 2026-07-10 terminology ruling: orders ≡ invoices, the term is "order").
- **Why / source:** Marcelo directive 2026-07-11 (overnight planning session); Robert check-in 2026-07-10
  (`meetings/2026-07-10-decisions.md` §A).
- **Status:** Accepted.

## UPD-5 — OrdersEngine splits into `OrdersEngineBase` + server-only `OrdersEngine` (2026-07-11)
- **Amends:** MASTER-PLAN.md §3 "Engine architecture (BO-D30)" — refines the engine's packaging; the
  engine-pair intent is unchanged.
- **Change:** the catalog/config **metadata caching** (Product / ProductType / ProductCategory / GL-link
  lookup info) lives in an **`OrdersEngineBase`** (client-safe base class), and the server-only
  **`OrdersEngine`** simply wraps the base for convenience — the **AIEngineBase/AIEngine pattern**,
  mirroring accounting's as-built `@mj-biz-apps/accounting-engine-base` + `AccountingEngine` split. The
  currently-built server-only `OrdersEngine` (in CoreEntitiesServer) is refactored into this shape.
- **Why / source:** Amith demo feedback 2026-07-11 (`meetings/2026-07-11--Amith's Demo Feedback.md`) —
  Amith's guidance carries master-plan-level authority (project originator).
- **Status:** Accepted — refactor task F0 in `action-plans/ActionPlan - Feature build (lifecycle, payments,
  rev-rec).md`.

## UPD-6 — The LXP is the first integrating consumer; D1–D16 recorded; overdue + grace policy (2026-07-14)
- **Amends:** MASTER-PLAN.md §1 (positioning/consumers), §4.2 (Order — computed-field surface), Phase E
  (dunning). Additive record + two small feature deltas; no schema change (S1 already shipped `DueDate` —
  the doc's A1 question is answered in place: it exists).
- **Change:**
  1. **First integrating consumer recorded:** Sidecar's **LXP** (Ethan's team) — Amith + John decided
     2026-07-14 that **BizApps Orders is the exclusive go-forward order/payment engine** (their D1), on a
     **dedicated Sidecar instance** (D5), with **BCSaaS refactored to wrap Orders** (D4, their side).
     Launch surface: the **LH4I individual checkout** (3 tiers + coupons + track/bundle selection +
     upfront Stripe card payment); LH4T (teams) is AD/manual. Full decision table (D1–D16) in
     `meetings/2026-07-14 - LXP Requirements.md`.
  2. **`IsOverdue` is an explicit computed/virtual surface** (their D15): `Balance > 0 AND DueDate < now` —
     computed in the base view / entity layer, **never stored state** (consistent with the existing
     F1.3 ruling that `Overdue` is time-derived; this makes it a first-class consumable field).
  3. **Dunning grace policy (their D16) — CONFIGURABLE, not hardcoded** (Marcelo 2026-07-14: the period
     must be modifiable): a **`DunningGracePeriodDays`** setting (default **7**) governs how long after a
     failed renewal payment access-relevant state holds before cut-off, and dunning **notifies CS** rather
     than auto-cancelling. Placement: per-company on `AccountingCompanyProfile`-style config is wrong-side
     (it's an Orders policy) — plan it as an **Orders configuration setting** (per owning company when
     multi-company needs it; single setting suffices for launch), consumed by F3.6. Consumers (the LXP)
     read the order/subscription state; the grace window is OURS to compute, theirs to render.
  4. **Entitlement change notification** (their D14) needs **no Orders-side build**: standard MJ
     (`BaseEntityEvent` / entity subclass / Scheduled-Job + Record-Set-Processing poll — Amith recommends
     the poll). Recorded so nobody invents a webhook system.
- **Why / source:** `meetings/2026-07-14 - LXP Requirements.md` (Ethan; decisions by Amith + John,
  2026-07-14). Coupons (their D10/A2) are handled separately — see MOD-6 revision + the dedicated
  coupon action plan. Tax (their D13/A4) stays deferred — see DEFERRALS + QUESTIONS (Robert).
- **v3 addendum (2026-07-17):** Ethan's v3 (`meetings/2026-07-14 - lxp-commerce-and-fulfillment
  2.md`) LOCKS the fork closed (Orders exclusive, no CDP checkout ever, Auth0 permanent, Model 1
  at launch) and adds the launch path — **LXP→Orders DIRECT, BCSaaS wrap fast-follow, Teams-first
  contingency** — recorded as **MOD-13**; the A7 BAO-ready-date ask is [Q22](QUESTIONS.md#q22).
  Robert's A1 check is closed (DueDate exists; overdue works as D15 describes); A3 entitlement
  "robustness" confirmation awaits Ethan's answers to Robert's four questions (grant granularity ·
  lifecycle coupling · read contract · team beneficiary semantics — Robert owns asking).
- **Status:** Accepted (Marcelo review 2026-07-14; v3 addendum folded 2026-07-17).

## UPD-7 — Order↔JE linkage becomes a junction entity (`OrderJournalEntry`) (2026-07-14)
- **Amends:** MOD-11's "the single `Order.JournalEntryID` column is reworked" — this is the ruled
  shape. Intent unchanged (orders trace to their JEs); mechanism refined for one-JE-per-company.
- **Change:** a junction entity (`OrderJournalEntry`: OrderID + JournalEntryID, real FK
  constraints) replaces the single `Order.JournalEntryID` field. JEs continue to reference the
  order via the soft origin key (accounting side); the junction gives orders-side FK-integrity
  navigation to ALL of a multi-company order's JEs. Idempotency guard = "order already booked"
  (ConfirmedAt/any-junction-row check), per MOD-11.
- **Why / source:** Robert, `meetings/2026-07-14 - Accounting Meeting.md` ("that's the way to do
  it if we're going to support multiple journal entries per order").
- **Status:** Accepted — schema amendment with the MOD-11/F1 rework.

## UPD-8 — Coupons: provider-model **Option A for launch** (Stripe = first adapter); discount recording at BOTH levels regardless (2026-07-14/16)
- **Amends:** MOD-6's coupon extension + the S7/coupon action plan's execution order.
- **Change:** (a) **Launch path = Option A** — a `CouponProvider` abstraction where the provider
  (Stripe: hosted checkout + promotion codes, exactly today's CDP behavior) owns coupon
  configuration/application and **Orders records the outcome**. The Orders-native `Coupon` entity
  (Option B, the S7 draft) becomes the **fast-follow** for non-provider channels (AD/manual
  orders) — and slots in as just another provider. (b) **Recording schema lands NOW either way:**
  order-level discount structure (code used, provider, provider coupon/promotion-code IDs, total
  discount) AND line-level `DiscountAmount` (providers prorate order-level coupons across lines;
  tax + GL operate on line amounts; `DiscountPct` alone cannot capture fixed-amount or
  order-level discounts). (c) **Before the recording schema freezes:** two investigations — map
  Stripe's Coupon-vs-Promotion-Code model end-to-end (incl. how discounts report back at order +
  line level) and evaluate one second provider (Square/Shopify class) to find where models differ.
  (d) **OS7 schema review is BLOCKED on sharing the artifact** — Robert cannot see
  `ActionPlan - Coupons (schema to UI).md` (it exists only in this instance's branch); his review
  checklist (provider traceability · definition-vs-code split · both-level recording · redemption
  constraints/stacking · doesn't block the Stripe-only launch path) is recorded in the answers
  doc. (e) **Open Sidecar/Ethan questions (Robert owns asking):** coupon surfaces at launch
  beyond Stripe checkout? coupon shapes actually used (percent/fixed/order-level/repeating +
  today's ASAE coupon config)? does the LXP need to display/validate codes in its own UI?
- **Why / source:** Robert A2 (`meetings/2026-07-14 - lxp-open-items-response.md`) + OS7
  (`meetings/2026-07-16 - marcelo-questions-draft-answers.md`).
- **Status:** Accepted (lean) — coupon action plan to be re-sequenced against it; schema freeze
  awaits the investigations + Sidecar answers.

## UPD-9 — Renewals spawn as Draft at launch; `RenewalSpawnStatus` per type/plan (2026-07-16)
- **Amends:** BO-D40 (renewal-order spawning) — refinement, intent unchanged.
- **Change:** renewal orders spawn as **Draft** at launch (Confirm books the JE; a human
  confirming renewals is the right conservative start). The fuller shape: a **`RenewalSpawnStatus`**
  setting on SubscriptionType/SubscriptionPlan ∈ {Draft, Quoted, Confirmed} (Quoted = the classic
  association renewal-notice flow; Confirmed = zero-touch once the pipeline is trusted — the LH4I
  tiers' eventual mode). No per-order accounting gate by default (batch approval is accounting's
  control point); when a gate IS warranted it's a tasks-substrate approval at Draft→Confirm;
  per-order exceptions via the existing `SalesRule`/`SalesAuthority` engine; custom logic via the
  `ProductBehavior` seam. ⚠ Terminology drift to reconcile: master BO-D8/§9 put the pen-commit at
  **Posted**; the build books at **Confirm** — align vocabulary when this records into the master.
  The "nightly vs continuous cadence" half of the original question is SUPERSEDED by MOD-12 (no
  materialization job exists).
- **Why / source:** Robert OF4, `meetings/2026-07-16 - marcelo-questions-draft-answers.md`.
- **Status:** Accepted (Jeremy validates the Draft-at-launch default at his sitting).

## UPD-10 — Invoice delivery lean (email render first) + open-AR cutover rule (2026-07-16)
- **Amends:** §15 Q8 (delivery — lean recorded, decision stands as lean) + §13/N.2 (CDP
  migration — cutover scope RULED).
- **Change:** (a) **Delivery:** thin built-in send-via-email of the rendered posted Order first,
  with an Action-plugin seam; bill.com becomes a delivery adapter when a channel needs it.
  (b) **Cutover rule (ruled):** transfer **open invoices only, and only those WITHOUT existing GL
  journal entries** — they enter Orders and generate JEs through the normal pipeline (importing an
  already-journalized invoice would double-book). **Ask for Jeremy:** identify which open
  invoices in the BC Data Platform lack GL JEs (defines the transfer set) + rule for
  already-journalized open invoices (stay in legacy for collection vs JE-suppressed import).
  Timing rides aidp Stage 4.
- **Why / source:** Robert OQD, `meetings/2026-07-16 - marcelo-questions-draft-answers.md`.
- **Status:** Accepted (delivery = lean; cutover = ruled, Jeremy identifies the set).
