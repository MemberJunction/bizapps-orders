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
| 1 unit | `packages/CoreEntitiesServer` (vitest) `src/__tests__/orderJournalDraft.test.ts` | Pure order→JE draft assembly: Dr AR per company / Cr revenue per line, balanced overall + per company, mixed Immediate/Deferred, lineage carry, error cases (empty, non-positive, missing AR) | ✅ **10/10** |
| 2 server (tsx, live DB) | `test-harnesses/server/order-to-je.ts` | End-to-end order Confirmed → OrderEntityServer → OrdersEngine resolution → op → balanced JE, verified vs DB | ✅ **5/5** (O1 single-co · O2 multi-co per-company balance · O3 deferred revenue · O4 unresolvable→blocked · O5 idempotency) |
| 2 server (tsx, live DB) | `test-harnesses/server/order-to-glposted.ts` | **Full cycle**: order Confirmed → JE `Pending` → `buildBatch` → `Batched` → `approveBatch` → `sendBatch` (mock ERP) → **`GLPosted`**, asserting each JE status transition (AutoApproveGate; the JE lifecycle, not the CFO workflow) | ✅ **PASS** (2026-07-08 — Pending→Batched→GLPosted) |
| 3 API (GraphQL → MJAPI) | (schema check, this session) | MJAPI loads `@mj-biz-apps/orders-server` (+1 resolver path); Orders entity types live in the GraphQL schema; `X-API-Key` auth; resolver validates requests | ✅ live-confirmed (full create→confirm-over-GraphQL harness = follow-up, logically covered by tier 2 + accounting's op-over-GraphQL 8/8) |
| 4 GUI (Playwright/Explorer) | — | Order-entry generated forms render; confirm drives the booking; JE visible | ⏳ **not run this session** — Explorer needs the peer-dep workaround chain (see accounting testing.md §Explorer); generated forms wired in `orders-ng` public-api |

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
- **Idempotency** (tier 2 O5): `JournalEntryID` non-null is the guard — a re-save books no second JE.
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
