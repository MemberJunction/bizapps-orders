# ActionPlan — S1 · Order lineage & product ownership (roadmap V1.1 + V1.2)

> **Status:** Draft · **Created:** 2026-07-20 · **Slice:** S1 (ROADMAP-lxp-launch.md board)
> **Implements:** orders MOD-3 rev-2 + the 2026-07-20 company-owned-categories ruling (UPD-5 rev.; Order.CompanyID; line company FROM the product; resolution
> anchored to the product's company) · UPD-7 (OrderJournalEntry junction) · MOD-11 idempotency
> rework · accounting UPD-5 items 1–3 (same-company link enforcement — the hard-block tier) ·
> acct Q38 proceed-by-default lean · FEATURE-LIST: ORD-C.1, ORD-E.2, ORD-E.8, ORD-O.2 (+ acct B.1
> enforcement touchpoint)
> **Sources:** the roadmap; Robert Q2 answer (`meetings/2026-07-16 - marcelo-questions-draft-answers.md`);
> Marcelo rev-2 rulings 2026-07-17. **Cite, don't re-narrate — the MOD/UPD entries are the design.**
> **Entry gate:** S0's orders-spine verticals closed (green baseline to diff against).
> **Exit gate:** all cheap-tier (1–3) tests green pre-AND-post; demo artifact per phase. NO GUI
> validation here — that is S4. (Known UI consumer: the Order editor's Accounting tab reads
> `Order.JournalEntryID`; see phase 1 decision below.)

## Scope (one paragraph)

Make the company-ownership chain real in the schema and engine: orders carry their owning company;
products' company is the source of truth for each line's company; account resolution walks WITHIN
the product's company; order↔JE lineage becomes a real junction. Enforce the same-company link
invariant at creation time (engine + trigger floor). Nothing else rides along.

## Phases (vertical: schema → engine → proof)

**P1 — Schema (migration + app codegen).**
`Order.CompanyID` (backfill: unanimous line-product company, else the seed/demo default — record
choice in Decisions taken; then NOT NULL) · `Product.OwningCompanyID` → `CompanyID` NOT NULL ·
`Subscription.OwningCompanyID` → `CompanyID` · **`ProductCategory.CompanyID` NOT NULL (added
2026-07-20 — categories are COMPANY-OWNED, Robert ruling; backfill: the unanimous company of the
category's products, flag mixed trees for manual split)** · new `OrderJournalEntry` (OrderID +
JournalEntryID, real FKs, unique pair) · `Order.JournalEntryID`: keep as DEPRECATED read-only
during S1 (stamped with the owning-company JE) so the UI tab doesn't break before S4 — removal is
an S4-or-later item.
*Demo artifact:* schema-preflight extension green + a one-page "what you can now record" note.

**P2 — Engine.**
Line company = the line's product's `CompanyID` (derivation-from-resolved-account deleted) ·
booking splits JEs by product company (MOD-11 basis swap) · junction rows written in the Confirm
unit-of-work; idempotency = "order already booked" (any-junction-row + ConfirmedAt) · resolution
walk re-anchored: product link → the product-company's OWN category tree → PRODUCT-company
default → loud tripwire (unchanged; anchor split per MOD-14 — this slice touches only the
revenue-side walk, NOT the booking AR shape, which is S3/V1.7) · hard-blocks per UPD-5 as revised:
product/category links must match their owner's company; product assigned only to its own
company's category; duplicate (target × role) route on a category rejected (engine typed errors +
DB trigger floor, accounting repo). *Demo artifact:* a multi-company order booked live —
junction rows + per-product-company JEs shown with real numbers.

**P3 — Proof (cheap tiers).**
Re-run the S0 orders-spine verticals on the new shape (downstream re-run discipline) + new tests:
derivation cases (incl. company-default rung + tripwire), junction integrity, backfill
correctness, link-validation rejections (engine AND raw-SQL trigger). *Demo artifact:* the test
matrix delta (before/after counts, no regressions) in testing.md.

## Decisions taken (micro-decisions only — one line each)

- _(record here as they happen; plan-affecting decisions go to MOD/UPD, never here)_

## Out of scope (do not drift)

Batch anything (S2) · forward-dated rev-rec (S3) · GUI validation/forms (S4) · category
route-management UI (design pass) · line-company materialized column (deep-dive backlog row) ·
cross-company link support (Q38 — proceed on the NO lean; a YES reopens via the sitting).
