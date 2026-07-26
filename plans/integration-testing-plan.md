# Integration Testing Plan — BizApps Orders

> **Status:** BUILT (2026-07-25). Phases 0-3 are done and green — 37 checks across 4 bundles,
> dispatched by `mj test suite --name "BizApps Orders Integration"` and by
> `node test-harnesses/integration.mjs`. Phases 4-5 (breadth, CI) remain. Sections below are the
> original proposal; **§0 records what the build actually decided**, including where it diverged.
> **Parent plan:** [`bizapps-orders-master.md`](./bizapps-orders-master.md)
> **Goal:** a deterministic, headless, end-to-end suite that drives a clean database through the real
> stack — product setup → GL linking → orders → payments → subscriptions → cancellations — and
> asserts actual table state (`OrderHeader`, `OrderLine`, `JournalEntry`, `JournalEntryLine`,
> `PaymentHeader`, `PaymentLine`, `SubscriptionTerm`, …) against expected. Run it to *find* defects;
> keep it as the regression harness.

---

## 0. What was built, and what the build changed

### Phase 0 answered: transaction-per-check ROLLBACK, and it holds

The spike ran the real thing — an outer test transaction, `OrderEntityServer.Save`'s transaction
inside it, `CreateJournalEntries`' savepoints inside that — and confirmed all of it:

- the confirm SUCCEEDS three deep, and the journal entry is visible INSIDE the transaction;
- after rollback, zero `OrderHeader` / `OrderLine` / `JournalEntry` / `JournalEntryLine` rows;
- teardown is a plain FK-ordered sweep with **no `DISABLE TRIGGER` at all** — the fallback's worst
  part is gone, because there is no booked history left to fight.

Two runs of the full suite plus the legacy harness leave the database at exactly zero residue.

**The spike also found the constraint that governs every check we write:** while a check's
transaction is open, reads must go through the PROVIDER, never a second connection. The first probe
attempt read an in-flight row via the raw pool and BLOCKED on the transaction's own write locks
until the request timed out. `fixture.ts` routes everything through the provider for this reason
(and a second one — see below).

### Divergences from the proposal

| Proposed | Built | Why |
|---|---|---|
| 12 bundles (`orders-*`) | 4 bundles: `order-booking`, `revenue-recognition`, `subscriptions`, `payments-rollups` | Bundles follow the code that exists. Events, permissions and concurrent numbering have no implementation to test yet; writing their bundles first would have produced tests that assert nothing. |
| Author a `MJ: Test Types` row | Use MJ core's | `Integration Test` (`502A3E67-…`) ships in MJ core metadata and was already present after `mj migrate`. Authoring a duplicate would have split the driver lookup. |
| Assertions via `RunView` because "raw-SQL helpers won't reach our schemas" | Assertions via `provider.ExecuteSQL` with explicit schema names | The premise was wrong: `ctx.Schema` only defaults the CORE schema for MJ's own helpers; a query we write ourselves can name any schema. Direct SQL also lets us assert on the LEDGER (journal entry lines, balances) which no orders entity exposes. |
| `ctx.Pool` for fixture setup | the provider for everything | `ctx.Pool` is only populated when the driver owned the bootstrap. Under `mj test` the CLI installs the instrumented cache first, so it arrives `undefined` — a pool-based fixture fails at setup with a message that reads like a platform problem. |
| Fixture state on the check context | module-scoped holder in our package | `IntegrationCheckContext` is a CLOSED interface owned by MJ; it enumerates MJ's own fixtures as named optional fields, so an external adopter has no slot to assign to. |

### What the suite found

Writing the tests was worth it before the code was "finished" — five real defects surfaced, four of
them in product code:

1. **`Subscription.OrderLineID` was never set** — NOT NULL, so every subscription purchase failed.
2. **Calendar-anchored terms could end before they started.** `OrderDate` returns as UTC midnight
   while `new Date(y, m, d)` builds LOCAL midnight; west of Greenwich a purchase on the anchor date
   resolved "next anchor" to the same day and `EndDate = anchor − 1` landed before the start,
   violating `CK_SubscriptionTerm_Dates`. All the arithmetic is UTC now, with a unit regression
   guard that fails on the old code.
3. **A rejected confirm told the caller nothing** — `Save()` returned bare `false` while
   `LatestResult` still held the header's SUCCESSFUL save. The reason now lands on `LatestResult`,
   which the UI and the API need as much as the tests do.
4. **`SubscriptionNumber` was derived from the order number plus a timestamp suffix** — collides
   when one order buys two subscription products in the same millisecond. Now a real
   `SubscriptionSequence` singleton, matching `OrderSequence`/`PaymentSequence`.
5. **(harness, not product)** `AccountingEngineBase` caches GL links in-process, so a second
   bundle's fixture was invisible to booking. Setup forces a refresh.

Two checks also had to be **hardened after passing for the wrong reason**: `OB7`/`OB8`/`OB9`
asserted only that a confirm was rejected, which is also true when the entity subclasses were never
registered and no booking logic ran at all. They now assert the rejection MESSAGE names the
unresolvable GL role. `SB8` got the same treatment. This is the anti-vacuity rule in §4 biting in a
form the proposal didn't anticipate: not an empty collection, but a negative assertion satisfied by
total absence of the feature.

### Deliverables

| Path | What |
|---|---|
| `packages/IntegrationTests/src/fixture.ts` | catalog fixture, transaction discipline, GUID/query helpers |
| `packages/IntegrationTests/src/order-builder.ts` | build/confirm orders through the ENTITY API, so the Save override fires |
| `packages/IntegrationTests/src/checks/*.checks.ts` | the 4 bundles |
| `test-harnesses/integration.mjs` | standalone dispatcher over the same registry — the fast inner loop |
| `metadata-tests/` | `MJ: Tests` × 4 + `MJ: Test Suites` + membership, kept OUT of the production-pushed `metadata/` |
| `scripts/rebuild-db.sh` | Phase 2's provisioning script — the four-layer build, encoded |
| `scripts/append-codegen.sh` | folds CodeGen output back into the baseline migration |

### Still open

- **Phase 4 breadth** — the eight bundles listed in §3 that have no implementation behind them yet.
- **Phase 5 CI** — Docker SQL Server → `scripts/rebuild-db.sh` → `mj test suite` as a blocking gate.
- **The drift guards from §5** — per-bundle count table and sibling-parity test. Not yet written;
  with 4 bundles the drift risk is small but it grows with every addition.
- **`mj test` needs `RUN_MUTATION_TESTS=1`.** Every check is mutation-class, so a run without the
  gate reports zero checks and passes. That is skip-as-pass, exactly what §4 warns about, and it is
  the first thing CI must assert against.

---

## 1. What we reuse vs. build

MJ's testing framework was split in July 2026 precisely so external adopters could consume it:

| Package | Published? | For us |
|---|---|---|
| `@memberjunction/testing-integration@5.49.0` | **yes** | **Import.** Check contract, registry, `IntegrationTestDriver`, bootstraps, assertion helpers (`Assert`, `AssertEqual`, `AssertRowShape`, `settle`), config loading, tier gating |
| `@memberjunction/testing-cli`, `-engine`, `-engine-base` | yes | Import (already reachable through our vendored `mj` CLI) |
| `@memberjunction/integration-test-suite` | **no — `private: true`** | **Do not depend on.** It is MJ's *content*; we write our own equivalent |

The extension seam is explicit — the loader's own header says *"external adopters point it at their own check packages"*:

```javascript
// mj.config.cjs
testing: {
  checkModules: ['@mj-biz-apps/orders-integration-tests'],
}
```

So: **new private workspace package `packages/IntegrationTests`**, registering check bundles into
`IntegrationCheckRegistry`, dispatched by `mj test suite`.

⚠️ **Gotcha to design around:** a *globally installed* `mj` cannot resolve our private package. Node
resolution for the bare specifier must reach our workspace from the CLI's location — we already run
the vendored CLI (`apps/MJAPI/node_modules/@memberjunction/cli/bin/run.js`), so this works, but it
must stay that way.

## 2. Database lifecycle — where we diverge from MJ, deliberately

**MJ's model:** fresh Docker SQL Server + `CREATE DATABASE` + `mj migrate` per CI run; then **one
shared DB with per-bundle teardown by convention** — every mutating check stamps a per-run prefix
(`mj-tg-${Date.now()}`) and a `(mj-integration-test — safe to delete)` tag, and teardown sweeps
`Name LIKE '<prefix>%'` with FK-ordered deletes, each wrapped `.catch(() => undefined)`.
**There are no per-test transactions and no rollback.**

**That teardown model is the single biggest risk for us,** and we already have direct evidence.
Our booking harness teardown had to be fixed *twice*: first because trigger 51008 refused to clear a
booked `JournalEntryID` and `FK_OrderLine_JournalEntry` refused to orphan a JE, then again because
`FK_OrderHeader_InitialPaymentDetail` blocked deleting payment details. Our FK depth is far worse
than MJ's:

```
PaymentDetail ← PaymentHeader ← PaymentLine → OrderHeader → OrderLine → JournalEntry → JournalEntryLine
                                                    ↑              ↓
                                          Subscription ← SubscriptionTerm
```

…crossing into `__mj_BizAppsCommon` and `__mj_BizAppsAccounting`, and guarded by immutability
triggers that *deliberately refuse* deletion of booked history. Hand-written sweeps will rot.

### Recommendation: transaction-per-check rollback, which MJ could not use

MJ rejected transactional isolation because their client-transport bundles have no transaction
surface. **Every test we care about is server-transport** (entity subclasses, remote operations,
triggers), so that constraint doesn't bind us. A check would run inside
`provider.BeginTransaction()` … `RollbackTransaction()`, leaving nothing behind — no sweeps, no
FK ordering, no trigger fights, and immune to a mid-run crash.

**This must be validated before we commit to it** (§6, Phase 0). The open risk: `OrderEntityServer.Save`
*already* opens a transaction, and accounting's `CreateJournalEntries` nests inside it as savepoints.
An outer test transaction makes that three deep. Accounting's design notes say nesting composes via
savepoints, so it should hold — but "should" isn't good enough for the foundation of a test suite.

**Fallback if nesting fails:** MJ's prefix-and-sweep, with one addition they lack — a
`DisableTriggers` helper around teardown, since our immutability triggers will otherwise block
cleanup exactly as they did in the booking harness.

### Provisioning: the gap MJ has no template for

MJ's CI provisions one database from one repo's migrations. We need **four layers in dependency
order** — and one of them can't be installed the supported way today:

```
1. mj migrate -t v5.49.0                                    # MJ core
2. bizapps-common                                           # ⚠ see below
3. mj migrate --schema __mj_BizAppsAccounting --dir ...     # accounting
4. mj migrate --schema __mj_BizAppsOrders --dir ./migrations # orders
5. mj sync push  (accounting metadata, then ours)           # currencies, GL roles, payment types, rev-rec types
```

Known constraints, all hit during development:

- **common's migrations invert the placeholder convention** — they use `${flyway:defaultSchema}` to
  mean the *core* schema, so `mj migrate --schema __mj_BizAppsCommon` fails. They also predate MJ's
  baseline, so flyway silently skips them (reports "0 applied"). Current workaround: substitute the
  placeholder and apply via `sqlcmd`.
- **`mj app install` rejects `__mj_*` schemas** without `--dangerously-ignore-dbl-underscore-schema-rule`
  (a hidden flag), and accounting's manifest pins `mj-bizapps-common: ">=1.0.0 <2.0.0"` against a
  published `5.32.0`, so the installer refuses it outright.
- **bizapps-tasks cannot be installed at all** against our common (its generated views select
  `Person.DisplayName`, which exists only on common's enriched view).

**The provisioning script is therefore a first-class deliverable, not a footnote** — it encodes
knowledge that currently lives only in this conversation.

## 3. Test surface

Bundles map to business flows. Each check throws on failure; assertions come from the framework.

| Bundle | Covers |
|---|---|
| `orders-catalog` | product types, per-company categories + hierarchy, products, pricing, rev-rec type assignment |
| `orders-gl-linking` | `GLAccountLink` at product / category / **ancestor** / company level; most-specific-wins; **fail-loudly when nothing resolves**; the D6 cross-company hard block |
| `orders-booking` | confirm → one JE per line; balanced; single-company; D25 origin pair on the line; `EntryType='OrderBooking'`; discount contra vs net-into-sales fallback |
| `orders-atomicity` | unresolvable account → whole confirm rolls back, zero JEs, order unconfirmed; double-confirm idempotency; `JournalEntryID` NULL→value-once (trigger 51008) |
| `orders-revrec` | `UpFront` → no deferral; `EvenOverTime` → N dated releases summing **exactly** to the line; `AllBackEnd` → single release on end date; rounding remainder in period 1 |
| `orders-payments` | initial payment auto-generation at confirm; `PaymentDetail` **copied not shared**; split payment across multiple orders; refund via `Orders.RefundPayment`; capture JEs |
| `orders-rollups` | `TotalGross`/`AmountPaid`/`Balance`/`PaymentStatus` under line add/change/delete, payment apply/unapply, and `PaymentHeader` status transitions; `WrittenOff` never overwritten |
| `orders-subscriptions` | create; renew; **extend vs new** per `ConcurrencyMode`; reactivation; calendar anchoring + proration; term records; cancellation policies and the unearned remainder |
| `orders-events` | event products end-to-end — `EventProduct`/`EventOrderLine` IsA pairs, attendee data, `AllBackEnd` recognition on the event date |
| `orders-numbering` | `ORD-`/`PAY-` sequences gap-conscious under **concurrent** confirms |
| `orders-immutability` | line financials frozen after confirm; payment financials frozen after capture; `PaymentDetail` instrument fields immutable (51009) |
| `orders-permissions` | RLS/company-scope visibility per D28 |

Assertions go through the **entity API** (`RunView` with `BypassCache: true`), not raw SQL —
MJ's `ctx.Schema` is a single string defaulting to `__mj`, so raw-SQL helpers won't reach our
schemas, whereas entity-name access is schema-agnostic.

## 4. Determinism

- **Serial by construction.** `MJ_INTEGRATION_TEST=1` forces `parallel: false, maxParallel: 1`.
  Accept it; our checks share provider and cache singletons.
- **Order matters within a bundle** — array order is load-bearing in MJ's design, and ours will be
  too (a subscription must exist before it can be extended).
- **Anti-vacuity floors.** MJ's hard-won rule: assert a collection is non-empty *before* iterating,
  or a broken read passes silently. Directly relevant to us — "every JE balances" is trivially true
  across zero JEs, and our booking harness would have passed with no entries at all.
- **No skip-as-pass without a CI existence assertion.** MJ's suite degrades to `passed: true` with a
  console note when fixtures are missing, and they had to add an explicit CI step failing the build
  when fewer than 3 `@integration.test` users exist — because the seeding could exit 0 having done
  nothing. Any skip we write needs the same guard or it rots green.
- **Fresh `RunView` params per call** — the pipeline mutates `params.Fields` in place on cacheable
  calls, so a reused object silently becomes an all-fields request on the second call.

## 5. Metadata we must author

None of this is auto-provisioned:

- **`MJ: Test Types`** row named for our driver. MJ's `Integration Test` type ships only as metadata
  JSON in *their* repo, not in any migration — so we author our own record.
- **`MJ: Tests`** — one per bundle, with the `Configuration` naming the bundle.
- **`MJ: Test Suites`** + `Test Suite Tests` with explicit `Sequence` values.
- Seed fixtures (companies, COA, GL links, catalog) in a **separate metadata root** kept out of the
  production-pushed `metadata/` directory.

The Testing Framework *tables* come free with `mj migrate`.

**Port MJ's two drift guards** — they exist for good reason: a per-bundle **count table** so silently
deleting a check reds the build, and a **sibling-parity test** asserting every registered bundle has a
Test record, suite membership, and a `checkModules` entry. Bundle name lives in four places
(code, Test `Configuration`, suite membership, config); without the guard, adding a bundle nothing
dispatches is a silent no-op.

## 6. Phasing

**Phase 0 — decide the isolation model (do first, ~half a day).** Spike the three-deep nesting:
outer test transaction → `OrderEntityServer.Save` transaction → `CreateJournalEntries` savepoints.
If rollback holds, everything downstream gets simpler and the FK-teardown risk disappears. If not,
fall back to prefix-and-sweep plus a trigger-disable helper. **Everything else depends on this
answer, so it comes before any test authoring.**

**Phase 1 — skeleton.** `packages/IntegrationTests`, `checkModules` wiring, the Test Type / Tests /
Suite metadata, one trivial green bundle proving `mj test suite` dispatches into our package.

**Phase 2 — provisioning script.** The four-layer build encoded and repeatable, with the common
placeholder workaround and a seed-verification step that fails loudly.

**Phase 3 — port the existing harness.** `test-harnesses/booking-live.mjs` already covers 30 checks
across booking, atomicity, rollups, rev-rec, numbering, and payments. Convert to bundles — this is
the fastest path to real coverage and validates the authoring pattern against known-good tests.

**Phase 4 — breadth.** The remaining bundles, subscriptions last since that model is still in
design ([`subscriptions-design.md`](./subscriptions-design.md)).

**Phase 5 — CI.** Docker SQL Server → provision → `mj test suite`, as a blocking PR gate.

## 7. Known limits

- **No UI coverage.** Headless only — Angular generated forms and custom components are outside
  this suite (computer-use testing is the separate answer).
- **MJAPI/GraphQL transport untested in CI** unless we add an API start step. MJ's own CI runs no
  MJAPI, so their client-transport tests skip-as-pass. Our valuable logic is server-side, so this is
  a low-priority gap — but it *is* a gap, and it's the one MJ's design quietly leaves open.
- **PostgreSQL parity is aspirational** — MJ's own bootstrap throws on PG (`UserCache.Refresh` is
  mssql-only). SQL Server only, in practice, despite our PG conversion path.
- **Cache-instrumentation tier not worth adopting.** It's the reason for MJ's dedicated-process and
  serial constraints; our tests are business-logic invariants and gain nothing from cache counters.
  We inherit the constraints regardless, but we shouldn't write cache checks.
