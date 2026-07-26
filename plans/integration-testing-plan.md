# Integration Testing Plan — BizApps Orders

> **Status:** Proposal for review (2026-07-25).
> **Parent plan:** [`bizapps-orders-master.md`](./bizapps-orders-master.md)
> **Goal:** a deterministic, headless, end-to-end suite that drives a clean database through the real
> stack — product setup → GL linking → orders → payments → subscriptions → cancellations — and
> asserts actual table state (`OrderHeader`, `OrderLine`, `JournalEntry`, `JournalEntryLine`,
> `PaymentHeader`, `PaymentLine`, `SubscriptionTerm`, …) against expected. Run it to *find* defects;
> keep it as the regression harness.

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
