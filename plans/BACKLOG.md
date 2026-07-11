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
