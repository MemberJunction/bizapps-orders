# BizApps Orders — testing ledger

The live coverage matrix + run recipes for bizapps-orders (AM-7 step 5). Companion to the app's
plans and to the accounting-side `…/bizapps-accounting/test-harnesses/testing.md`. Keep this current
with every change (TEST-PROTOCOL: validate at BOTH the server/API and GUI layers).

## What this app is (one line)
Product catalog + order lifecycle. On the FIRST transition to `Confirmed`, an order books a balanced
journal entry into BizApps Accounting via the `Accounting.CreateJournalEntry` remote operation.

## Coverage matrix

| Tier | Harness | Covers | Status |
|---|---|---|---|
| 1 unit | `packages/CoreEntitiesServer` (vitest) `src/__tests__/orderJournalDraft.test.ts` | Pure order→JE drafts assembly — **ONE DRAFT PER COMPANY (MOD-11/F1.2)**: split grouping (2- and 3-company, interleaved), per-draft balance, Dr-first ordering, header carry, mixed Immediate/Deferred, lineage carry, error cases (empty, zero/negative amount, missing AR incl. mid-split all-or-nothing) | ✅ **14/14** (2026-07-14) |
| 2 server (tsx, live DB) | `test-harnesses/server/schema-preflight.ts` | **The FULL S1–S6 schema surface**: 32 tables, 3 invariant triggers present+enabled, filtered-unique indexes, singleton sequences seeded, PaymentTermsType(6)+ProductType(12) seeds, IsA Entity.ParentID wiring, every CHECK (OrderType/PaymentStatus/Status, Quantity<>0 incl. negative-allowed, DiscountPct bounds, ServicePeriod ordering, FulfillmentStatus, Payment Method/Status incl. GiftCard, self-bundle, PriceTier range, SalesRule lists), trigger behavior matrices: JournalEntryID set-once (Order + Payment), line freeze on Confirmed/Posted/Fulfilled + FulfillmentStatus/Description carve-out + delete-block, payment capture freeze/delete-block/no-status-regression | ✅ **25/25** (2026-07-14) |
| 2 server (tsx, live DB) | `test-harnesses/server/order-to-je.ts` | End-to-end order Confirmed → OrderEntityServer → per-company booking SET → verified vs DB | ✅ **6/6** (2026-07-14: O1 single-co 1 JE + CompanyID · O2 multi-co → **2 single-company JEs**, JournalEntryID NULL, lineage via JE.OrderID · O3 deferred revenue · O4 unresolvable→blocked · O5 ConfirmedAt-guard idempotency · O6 per-company JE-{CompanyCode}-{FY}-{seq} numbering) |
| 2 server (tsx, live DB) | `test-harnesses/server/order-to-glposted.ts` | **Full cycle**: order Confirmed → JE `Pending` → `buildBatch` → `Batched` → `approveBatch` → `sendBatch` (mock ERP) → **`GLPosted`**, asserting each JE status transition (AutoApproveGate; the JE lifecycle, not the CFO workflow) | ✅ **PASS** (2026-07-08 — Pending→Batched→GLPosted) |
| 3 API (GraphQL → MJAPI) | (schema check, this session) | MJAPI loads `@mj-biz-apps/orders-server` (+1 resolver path); Orders entity types live in the GraphQL schema; `X-API-Key` auth; resolver validates requests | ✅ live-confirmed (full create→confirm-over-GraphQL harness = follow-up, logically covered by tier 2 + accounting's op-over-GraphQL 8/8) |
| 4 GUI (Playwright/Explorer) | custom dashboards: Orders Console · Orders Management (pipeline) · Product Catalog (+ GL-link picker) · Product Categories tree | Render + drive the flow; drill-through opens an in-app form dialog; kanban lane toggles + detail JE read-back | ⚠ **ad-hoc validated 2026-07-08** — headed Playwright walks, **0 console/pageerror**, but **NO committed Tier-4 specs** yet (coverage GAP — fill with seeded Explorer specs). Generated forms wired in `orders-ng` public-api. |

## Run recipes
All tsx/unit run from the instance worktree root (`~/MJDev/instances/accounting-engine-dev/mj`).
Never pipe a live harness through `head` (SIGPIPE kills pre-teardown). Tier 2 asserts ZERO stray
Pending JEs at bootstrap (buildBatch is GLOBAL) — sweep debris first if a run dies mid-way.

```sh
# Tier 1 — unit
cd packages/dev-apps/bizapps-orders/packages/CoreEntitiesServer && npx vitest run     # 10

# Tier 2 — live server integration (MJAPI need NOT be running; uses its own provider)
npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/order-to-je.ts         # 5

# Tier 3 — API smoke (MJAPI on :4050; X-API-Key from `mjdev key accounting-engine-dev`)
curl -s -X POST http://localhost:4050/ -H "Content-Type: application/json" \
  -H "X-API-Key: $(./bin/mjdev key accounting-engine-dev)" \
  -d '{"query":"{ __schema { queryType { fields { name } } } }"}'   # expect mjBizAppsOrders* fields
```

## Design notes that tests pin
- **Balance by construction** (tier 1): each company's AR debit = exact sum of that company's revenue
  credits, so overall + per-company balance (AM-4) always hold before the engine ever sees the draft.
- **Failure is loud** (tier 2 O4): an unresolvable account BLOCKS the Confirm (Save returns false, the
  reason is logged) — there is never a Confirmed-but-unbooked order. Retries on the next save.
- **Idempotency** (tier 2 O5): the ORDER-LEVEL guard (F1.2) — `ConfirmedAt` (always stamped on
  success) + `JournalEntryID` (single-JE case only); a re-save books no second JE set.
- **All-or-nothing set booking** (F1.2): a mid-set op failure compensates by deleting the already-
  created Pending JEs (loud log if cleanup fails). Live fault-injection of a mid-set failure isn't
  harness-reachable (would need the op to fail after N successes) — the resolution-failure path (O4)
  plus tier-1's mid-split error case cover the reachable halves; compensation logic is code-reviewed.
  ⚠ half-test label: compensation is NOT live-proven.
- **Cross-process cache staleness**: OrderEntityServer does one forced `Config(true)` refresh + retry
  when resolution misses — heals a product/link written by another process (e.g. seeded out-of-band).

## Open items / follow-ups
- Full GraphQL create→confirm→JE harness (tier 3) — the confirm hop is logically identical to tier 2's
  Save path; independent HTTP verification is a follow-up.
- Live Explorer/Playwright GUI walk (tier 4) — after the peer-dep workaround chain.
- Order → JE → **batch → Posted** full cycle — uses accounting's already-validated `buildBatch`; a
  combined proof can be added once batching is exercised from an order-originated JE.
- Company-level REVENUE default resolution (Izzy example) needs a company context on the order — v1
  resolves revenue via product/category links only (OQ-I, Robert). See OrdersEngine header.

---
### 2026-07-10 rollout (Task 36) — orders tiers re-baselined + new coverage
- **T1** `orderJournalDraft` 10/10 ✓ (the pure order→JE Dr/Cr assembly — the real logic surface).
- **T2** `server/order-to-je` 5/5 ✓ (O1 single-co · O2 multi-co per-company balance · O3 deferred rev · O4 unresolvable→blocked · O5 idempotency) + `server/order-to-glposted` full cycle ✓.
- **T3 (NEW)** `api/order-to-je-api` **35/35** ✓ — the order→confirm→JE path entirely over GraphQL (create Order+lines, Confirm mutation → OrdersEngine → `Accounting.CreateJournalEntry`, JE read back), exact-value balanced-JE assertions for O1/O2/O3/O4/O5. Self-seeds via `api/order-to-je-fixture` and self-tears-down. Run: `MJ_API_URL=http://localhost:<port> MJ_API_KEY="$(mjdev key <slug>)" MJDEV_SLUG=<slug> npx tsx .../api/order-to-je-api.ts`.
- **T5 (NEW)** `orders-management` 2/2 ✓ + `orders-product-categories` 2/2 ✓ (committed to the accounting playwright dir per convention). Orders Console + Order History + Product Catalog already covered by `orders-ui-fixes` + `orders-product-catalog`.
- **OrdersEngineBase:** assessed — a BaseEngine cache-only wrapper (Config loads ProductTypes; no pure logic). No unit test written (would be vacuous); the pure order→JE logic is covered at T1 (`orderJournalDraft`) and behavior at T2/T3.

---
### 2026-07-14 schema waves S1–S6 + F1.2 (this session) — coverage re-baseline
- **Schema**: S1 (A/R primitive + terms + sequence + 2 triggers) · S2 (payments, 6 tables + capture
  trigger) · S3 (subscriptions/rev-rec, 5 tables) · S5 (catalog parity: bundles, entitlements+grants,
  PPO, Event IsA pair, StoredValue, OrderLineDimension, pricing trio) · S6 (SalesRule/SalesAuthority +
  Order.ApprovalTaskID). S4 tax SKIPPED (Robert-gated; Marcelo 2026-07-14). All collapse-into-baseline.
- **T1** orderJournalDraft 14/14 ✓ (per-company split, MOD-11).
- **T2** schema-preflight 25/25 ✓ (NEW — the whole schema surface incl. trigger behavior matrices).
- **T2** order-to-je 6/6 ✓ (reworked to N-single-company-JEs + per-company numbering, A4/F1.2).
- **Maintenance scripts (committed, run in the drop-schema loop):** `_maint-clear-cross-app-links.ts`
  (cross-app FKs into __mj.Entity block drop-schema — MJDEV-ISSUES filed) · `_maint-set-isa-parents.ts`
  (codegen doesn't infer IsA parentage; retires at codegen-migration recapture per PR #3004).
- **Known gaps (fill as the features land):** entity-server engine features (totals, DueDate,
  transition matrix, fulfillment auto-advance) are F1 scope — schema is deliberately behavior-neutral;
  their tests land with F1. Payment/Subscription/pricing engine behavior = F3/F4/F9. Tier 4/5 GUI specs
  for the new forms = UI plan wave. `order-to-glposted` re-run pending in the final sweep (below).
