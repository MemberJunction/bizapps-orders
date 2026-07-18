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
- **All-or-nothing set booking** (F1.2 + Amith's transaction rule, 2026-07-14 rework): the whole
  per-company draft set books through ONE `Accounting.CreateJournalEntries` call — every header,
  line, and dimension across every company in a single TransactionGroup. The DB commits all or
  none; the former compensation path is DELETED. Cross-draft atomicity is LIVE-PROVEN (accounting
  engine-runtime E5: a mid-write FK failure in draft 2 rolls back draft 1's rows — raw-SQL
  verified zero survivors). The previous half-test label is retired.
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

---
### 2026-07-15 — F1.2b Confirm UNIT OF WORK (atomic order-row + JE set)
The order's status/guard-field update now commits in the SAME TransactionGroup as its per-company JE
set — order + all JEs, or nothing. New `Orders.ConfirmOrder` remotable op (in-process + over GraphQL)
composes the unit of work server-side; a direct order Save to 'Confirmed' self-composes the identical
atomic unit of work (`OrderEntityServer` — guard `shouldBook && !TransactionGroup`). The interim
any-JE-exists ADOPTION guard is retired to a **defensive assert** (refuse-don't-adopt). Accounting adds
`AccountingEngine.QueueJournalEntries` (validate + queue onto a caller-owned TG, no Submit).

- **T1** unchanged (pure draft logic): orderJournalDraft **14/14** ✓ · acct EngineBase **39/39** ✓ · acct CoreEntitiesServer **39/39** ✓.
- **T2** `server/order-to-je` **10/10** ✓ (2026-07-15): O1–O6 direct-save path still atomic; **O7 REWRITTEN** to the
  refuse-don't-adopt semantics (pre-existing JEs for an unbooked order → confirm REFUSED, both entry points);
  **O8** op-path atomic booking; **O9** JE-failure rolls back the order row; **O10** order-row failure ROLLS BACK
  the JEs (temp-trigger injection at Submit + the MJ-core TG-crash guard) — proves ONE transaction, BOTH directions.
  Teardown now disables the OrderLine/Order freeze triggers. Accounting `engine-runtime` **16/16** ✓ (CreateJournalEntries
  refactor — extracted validate/queue privates — unaffected).
- **T3** `api/order-to-je-api` **44/44** ✓ (2026-07-15): the confirm-over-GraphQL path (entity Update → server-side
  OrderEntityServer.Save → atomic booking) proven post-F1.2b. Fixed 3 pre-existing STALE MOD-11/12 assertions
  (per-company `JE-{CompanyCode}-{FY}-{seq}` numbering regex; O2 reworked to per-company: 2 JEs, JournalEntryID NULL,
  per-company balance + single-company purity).
- **Intentional coverage (not a gap):** `Orders.ConfirmOrder` **over GraphQL** (ExecuteRemoteOperation) is logically
  covered — the code-only remotable-op-over-GraphQL mechanism is proven by accounting `engine-op-api` 8/8, and this op
  uses the identical `BaseRemotableOperation` pattern; the op itself is proven in-process at T2 (O8/O10) and the
  browser confirm path at T3. A dedicated op-over-GraphQL smoke is a cheap future add if desired.

---
### 2026-07-15 — F1 lifecycle engine (transition matrix, totals, customer rule, DueDate, fulfillment)
The centerpiece: the pure rules live in orders-engine-base (browser+server shared), wired into the entity servers.
- **T1** `orderLifecycle.test` **19/19** — ALL 36 status pairs vs the DAG (forward skips legal, backward rejected,
  Voided only from Draft/Quoted, terminals); totals math (discount clamp, credit-memo negative balance);
  payment-status (WrittenOff preserved); DueDate rollover.
- **T2** `server/order-to-je` **15/15** — O1–O10 booking/unit-of-work stay green (orders now carry a customer +
  RequiresFulfillment=true → hold at Posted); O5 idempotency rewritten (Posted→Confirmed is a rejected backward
  move now); **L1** transition gate (backward rejected), **L2** customer-required (blocked, no JE), **L3** totals
  materialization + discount, **L4** DueDate from terms, **L5** fulfillment auto-advance (no-fulfillment → Fulfilled).
- **Intentional coverage:** F1 gates run in OrderEntityServer.Save (server-side), so they hold identically over
  GraphQL — the confirm-over-GraphQL path is proven by `order-to-je-api` (44/44); a dedicated F1-over-GraphQL
  re-assert is a cheap future add. Booking now credits revenue NET of discount (computeLineNet).
- **Known follow-ups (F1 fulfillment queue):** the per-line Fulfiller flip Pending→Fulfilled + last-line
  auto-advance to Fulfilled is OrderLine-save-driven and role-gated (F6/A2) — engine hook TBD; logged for circle-back.

---
### 2026-07-15 — FEATURE WAVE COMPLETE (F2 · F3 · F9 · F4 · F7 · F3.6). Unified harness order-to-je = 24/24.
`order-to-je.ts` is now the single orders behavior harness (tier-2, live DB): O1-O10 booking + F1.2b unit
of work · L1-L5 F1 lifecycle · **R1-R3 F2 reversals** (mirror JE + net-zero, partial stacking, unbooked
guard) · **P1-P4 F3 payments** (Manual capture Dr Cash/Cr AR customer-tagged, Stripe-STUB capture op,
cash application + over-application reject, refund mirror) · **F4 rev-rec bridge** (deferred line → 12
dated releases → materialize) · **E1 F7 entitlement grants**. Tier-1 (vitest, 58): orderJournalDraft 17
(+reversals) · orderLifecycle 24 (+isOverdue) · paymentJournalDraft 6 · pricing 6 · revrec 5.
- **F9 pricing** T1 pricing 6/6 (resolveProductPrice precedence; never-blocking). **F3.6 dunning** T1
  isOverdue 5/5 + Orders.GetOverdueWorklist (read-only over the predicate).
- **Tier-3 (over GraphQL, MJAPI :4030)** — final integration on the full F1-F4 dist: **order-to-je-api
  44/44** (confirm/booking over GraphQL, real customer Org + fulfillment-hold), accounting engine-op-api
  8/8, accounting **readmodels-api 29/29** (AR-by-customer / aging / DefRev-rollforward views FED by the
  order-to-cash flow — the F3 CounterpartyOrganizationID threading was the enabler).
- **Cross-app ops added:** Orders.ConfirmOrder · Orders.CreateReversalOrder · Orders.CapturePayment ·
  Orders.CreateRevRecSchedule · Orders.GrantEntitlements · Orders.GetOverdueWorklist · (acct)
  Accounting.QueueJournalEntries · CreateScheduledJournalEntries · MaterializeDueScheduledEntries.
- **B2 dashboards** (AR-Aging = TrialBalanceAR "Aging" tab, DefRev-Rollforward = RevenueTax) already
  existed; my feature work fed their read models (validated readmodels-api 29/29). Deferrals: plans/DEFERRALS.md.

**Run-order note (2026-07-14):** `order-to-je` asserts ZERO stray Pending JEs at bootstrap (buildBatch
is global), and the DEMO seeds legitimately create Pending JEs (3 confirmed demo orders). So: run the
tier-2 harnesses BEFORE seeding demo data (the drop-schema loop naturally gives that order), or sweep
demo Pending JEs first. The 2026-07-14 6/6 green run happened pre-reseed; a post-reseed re-run refusing
to start is the guard working, not a failure.


---
### 2026-07-18 — 5-tier roll-through (tier-3 verified on real path; NEW tier-4 gui harness)
Instance accounting-engine-dev · MJAPI :4030 (restarted — was stale) · Explorer :4390.

**Tier 1:** CoreEntitiesServer **58/58** · Angular **49/49** (re-run, green).
**Tier 2:** schema-preflight **25/25** · order-to-je **24/24** (after the accounting-side test-data reset).
**Tier 3 (over real GraphQL):** `api/order-to-je-api` **44/44** verified on fresh MJAPI (order create→Confirm→JE booking, exact balanced-JE values). Orders' own clients (`OrderEditorClient.Confirm`, `PaymentEntryClient.Capture`, `OverdueWorklistClient.Get`) are REMOTE-OP wrappers (take `IRemoteOperationProvider`) — the op IS the real mechanism, so order-to-je-api already drives the real path (kept + verified rather than rewritten). Reasonable-default logged.
**Tier 4 — NEW mjdev gui harness:** installed via `mjdev app gui-test init accounting-engine-dev bizapps-orders`. `example.dom.test` smoke GREEN + NEW `product-catalog.dom.test` GREEN — the Product Catalog dashboard renders real seeded catalog data through the real GraphQL client (products load well-formed, categories present), keystone clean. Same BaseDashboard `push`-TypeError noise as accounting (non-blocking; for the MJDev agent).
**Tier 5:** shares the accounting playwright harness (verified working); orders specs (orders-management/product-catalog/product-categories/ui-fixes) carry the same UI-wave nav-debt to reconcile with the proven pattern.

_New files uncommitted (holding per instruction)._

### 2026-07-18 (correction) — orders tier-3 REWRITTEN onto the real client
Per Marcelo: the old `order-to-je-api.ts` (hand-rolled `fetch`) is a mimic; the regression path must
use the real client. NEW `api/order-to-je-client.ts` **21/21** — creates Order+OrderLines via
`Metadata.GetEntityObject().Save()`, confirms via **`OrderEditorClient.Confirm` → `RouteOperation('Orders.ConfirmOrder')`**
(the atomic unit-of-work op the Order Editor uses — NOT a `Status='Confirmed'` update), reads the JE via
`RunView`, and drives **`OverdueWorklistClient.Get`** (the dunning read I had wrongly skipped as a "wrapper").
Exact values: O1 Dr AR 200/Cr Sales 200 · O2 per-company 300/150 single-company-pure · O3 deferred 120 ·
O4 unresolvable → Confirm BLOCKED + no JE · overdue rows drift-proof (DaysOverdue>0). Overlaps order-to-je-api
by design (regression path). Provider bootstrapped AFTER the fixture subprocess (stale-keep-alive rule).
