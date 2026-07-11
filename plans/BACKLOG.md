# BACKLOG — bizapps-orders (plans-level)

Repo-level wanted-but-not-started work + decision-needed items. Holding pen only — promote an entry into
an `action-plans/ActionPlan - *.md` when picked up and mark it promoted. Entry: what · source · status.
Convention: `~/MJDev/shared-plans/repo-planning-system.md` §5.1. (The instance-level
`instances/<slug>/BACKLOG.md` tracks agent working items; this file tracks repo/plan-level items.)

## Tasks

- [ ] **Order form: surface the full field set** (customer org + contact, order date, status, billing/
      shipping addresses) once the §4.2 fields land in the schema. — Robert demo feedback 2026-07-10.
- [ ] **Compose Order takes the full available space** when composing. — Robert demo feedback 2026-07-10.
- [ ] **Void affordance ≠ delete** — distinct Void button/action (trashcan reads as delete); Void reachable
      only per MOD-7. — Robert demo feedback 2026-07-10.
- [ ] **State-based validation matrix** — define + enforce what's valid per Order/JE status; audit current
      coverage (Robert: "how much validation is in place?"). Includes LOUD failure when a Product/Category/
      Company account map is missing at Confirm — fail the Confirm with a clear error, never book a partial
      JE. — Robert demo feedback 2026-07-10.
- [ ] **Fulfillment auto-advance** per UPD-3 (RequiresFulfillment save-logic + fulfiller-role hold).
- [ ] **Forward status skipping** per MOD-10 (transition validation in the Order entity server).
- [ ] **Customer identifier stability strategy** — stable account number across systems (dups/acronym
      mismatches are a real pain today); lean on bizapps-common Organization identity + external refs when
      the BC/bill.com integration lands. — Jeremy 2026-07-10.

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
