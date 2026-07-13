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
