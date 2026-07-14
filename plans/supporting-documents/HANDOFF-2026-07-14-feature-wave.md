# Handoff — orders feature wave (from the schema-plan run, 2026-07-14)

> For the agent executing `action-plans/ActionPlan - Feature build (lifecycle, payments, rev-rec).md`.
> Written by the orchestrator at schema-plan completion. Companion packet: bizapps-accounting
> `plans/supporting-documents/HANDOFF-2026-07-14-feature-wave.md`.

## What you inherit (all committed on `feature/accounting-integration`, HEAD ≈ `c8c027a`)

- **The FULL parity schema is built** (32 tables) via collapse-into-baseline: the baseline is
  **`migrations/B202607061431__v0.1.x__Schema_and_Tables.sql`** (edit IT in place per stage; dev loop =
  clear-links → `mjdev app drop-schema` → `migrate` → `codegen` → `build`; commit migration +
  regenerated code together). S1 A/R primitive · S2 payments · S3 subscriptions/rev-rec · S5 catalog
  depth (bundles, entitlements+grants, PPO, Event IsA pair, StoredValue, OrderLineDimension, pricing
  trio) · S6 sales rules. **S4 tax + S7 coupons are NOT built** (gated — see below).
- **Booking is atomic + per-company** (MOD-11/12): `OrderEntityServer` → `buildDraftsForOrder` (one
  single-company draft per company) → ONE `Accounting.CreateJournalEntries` call (single
  TransactionGroup, all-or-none). Guards: `ConfirmedAt` + any-JE-exists adoption. `JournalEntry.OrderID`
  finds every JE for an order.
- **Suites green** (run BEFORE demo seeding — the stray-JE guard): T1 vitest 14/14 ·
  `schema-preflight.ts` 25/25 (the whole schema surface — extend it with every schema change) ·
  `order-to-je.ts` 7/7 · `order-to-glposted.ts` PASS. Ledger: `test-harnesses/testing.md`.
- **MJ fixes cherry-picked into this instance's MJ** (`19751e19e0`, `2d61aab0b7`): IsA ParentID is now
  auto-detected by codegen (the `_maint-set-isa-parents` workaround is retired); Application/Role
  emission is idempotent. The `_maint-clear-cross-app-links.ts` script (UNTRACKED, on disk) is still
  required before each drop-schema until the mjdev fix lands (workspace `MJDEV-ISSUES.md`).

## Order of work (locked by Marcelo — do not reorder)

1. **F1.2b Confirm UNIT OF WORK — FIRST, before any other feature phase.** Order row + JE set commit in
   ONE TransactionGroup via a new `Orders.ConfirmOrder` remotable op; accounting exposes
   `QueueJournalEntries(drafts, tg)` (the seam is pre-built — `AccountingEngine.queueDraftRows` is
   already TG-parameterized). Retires the adoption guard (keep as defensive assert). Rollback proof
   BOTH directions required.
2. **F0** engine split (`OrdersEngineBase` + server `OrdersEngine`, UPD-5) → **F1** remainder
   (transition matrix, totals, DueDate, customer rule, fulfillment auto-advance F1.6, `IsOverdue`
   computed surface per UPD-6) → **F2** reversals → **F3** payments: Manual provider, then the
   **Stripe success STUB** (permanent default test provider), then **F3.5b** real sandbox subset —
   creds from `.env` / Credentials engine ONLY, never committed; sandbox tier skips loudly without
   them → **F4** rev-rec → **F7** grants → **F8/F9** per plan.

## Gates you do NOT own (skip, don't wait)

- **S7 coupons**: `action-plans/ActionPlan - Coupons (schema to UI).md` is DRAFT awaiting **Robert's
  schema review** — executes as written on his approval (F10 engine rides F9 hooks).
- **S4 tax**: deferred; **Q21** (instance QUESTIONS.md) with Robert. `LineTax` stays 0.
- **Roles/RLS (§6.2)**: Marcelo co-design + Ethan (LXP) input; R1/R3 research findings in the
  accounting packet's companion file.

## Ground rules (non-negotiable)

Tests are first-class — full matrix per `testing.md`, integrate into the harness (no one-offs); honest
results (label half-tests). Commit as you go (standing feature-branch auth), NEVER push. No `any`; rule
2b/2c; BaseSingleton; ≤40-line functions. The LXP is the first integrating consumer (UPD-6) — their
launch needs F1 + F3(+b) + F7 + coupons; estimate given to Marcelo: ~13–17 agent-days.
