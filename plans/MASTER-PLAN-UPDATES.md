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
  the line's service period). Recognition cadence (batch-monthly vs continuous running balance) is open —
  `BACKLOG.md` `[decision needed: Amith]`.
- **Why / source:** Robert demo feedback (`meetings/2026-07-10--Robert-demo-feedback.md`) + Jeremy meeting
  (`meetings/2026-07-10-decisions.md` §D).
- **Status:** Accepted.

## UPD-3 — `RequiresFulfillment` drives auto-advance to Fulfilled (2026-07-10)
- **Amends:** MASTER-PLAN.md §4.1 (`ProductType.RequiresFulfillment`) — clarifies planned behavior.
- **Change:** on save of a Posted order, if NO line's product requires fulfillment, the order may
  auto-advance to `Fulfilled`; any fulfillment-requiring line (e.g. physical goods) holds the order for
  the fulfiller role (MOD-9 item a). Per MOD-8, this flip has NO revenue-recognition effect.
- **Why / source:** Robert demo feedback 2026-07-10 ("Physical products require fulfillment and that will
  be part of the logic when saving a Committed Order").
- **Status:** Accepted — implementation task in `BACKLOG.md`.
