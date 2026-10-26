# @mj-biz-apps/orders-integration-tests

Integration check bundles for BizApps Orders. **Private — never published.** Importing this package
registers its bundles on `IntegrationCheckRegistry`; that is its entire runtime job.

```
mj.config.cjs → testing.checkModules → this package → IntegrationCheckRegistry → IntegrationTestDriver
```

## Transports

| Path | What it proves | How |
|---|---|---|
| **Server** (`test-harnesses/integration.mjs`) | Booking, JEs, payments — `OrderEntityServer` + rolled-back SQL | `SQLServerDataProvider` |
| **Client** (`test-harnesses/integration-client.mjs`) | MJAPI / GraphQL for catalog + party CRUD + committed volume | `bootstrapIntegrationClient` |

The client path does **not** import `@mj-biz-apps/orders-server`. Those `*EntityServer` constructors throw on `GraphQLDataProvider`. Server booking checks stay on the server transport because they nest provider transactions and `TxQuery`. Confirm on the wire is still `Status = 'Confirmed'` + `order.Save()` — `MJ.SaveEntityGraph` — which is what `wire-volume` measures at population scale.

```bash
GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs
GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs wire-volume
WIRE_VOL_COUNT=40 GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs wire-volume
```

`wire-volume` **commits**. Each header `Notes` is `WIRE-VOL:<runId>` so you can inspect and later purge. Default count is 200 (`WIRE_VOL_COUNT`). ORD-WORLD must already be loaded (catalog-world / ORD-00). See `docs/reviewing-the-data.md`. Purge with `node test-harnesses/purge-wire-volume.mjs`.

## Running

```bash
# fast inner loop: every server bundle, one bundle, or one check. Stack traces with IT_VERBOSE=1.
node test-harnesses/integration.mjs
node test-harnesses/integration.mjs subscriptions
node test-harnesses/integration.mjs subscriptions.SB5

# the recorded path — same registry, results written against the metadata Test records
RUN_MUTATION_TESTS=1 MJ_INTEGRATION_TEST=1 \
  pnpm run mj test suite --name "BizApps Orders Integration"
```

Both need a working database (`scripts/rebuild-db.sh` from zero) and the built packages: they load
`dist/`, so run `pnpm run build` after a change.

`RUN_MUTATION_TESTS=1` is **required** for `mj test`. Every check here is mutation-class, so without
the gate the driver skips every check and the suite still exits 0, having done nothing. The standalone
harness runs every check regardless.

Run the **workspace** CLI (`pnpm run mj`), never a global `mj`: a global install ships its own
published testing packages and cannot resolve this private one, so the bundles never register.

From the repo root:

| Command | What it does |
|---|---|
| `pnpm run test:integration` | `node test-harnesses/integration.mjs`: every server bundle, no count check. |
| `pnpm run verify` | Unit tests, the full build, every server bundle with the output saved to `/tmp/integration.log`, then `scripts/assert-check-count.mjs` on that log. |
| `pnpm run test:coverage-gate <log>` | `scripts/assert-check-count.mjs` alone, against a saved run log. |

`assert-check-count.mjs` reads the expected counts from `EXPECTED_BUNDLES` in the parity test (see
[Drift guards](#drift-guards)) and fails when any check failed, when fewer checks ran than declared,
when a bundle never ran or registered a different number of checks than declared, or when the run
never printed its final tally. A green tally alone is not evidence that anything ran.

`verify` runs the unit tests before its build step, and they import the workspace packages' built
`dist/`, so on a clean checkout run `pnpm run build` first.

## Isolation

The fixture is ORD-WORLD, the committed catalog in [`src/world/`](src/world/README.md): companies,
GL accounts and links, people, organizations, the product catalog, tax geography, and a price list
with two sample orders (one Draft, one Confirmed) for Explorer. Bundle Setup calls
`CreateOrdersFixture()`, which loads it (an idempotent upsert) and maps it onto the `Fx()` shape;
`catalog-world` loads it inside its one check instead, and `party-roster` needs none. It is shared
with Explorer, and bundle Teardown leaves it in place, except that `intercompany` and
`account-credit` delete the intercompany account matches among BCP, HH and ORPHAN, which the next
bundle's Setup creates again. Every check then runs inside a provider transaction that **always
rolls back**, so the orders, journal entries, payments and subscription terms a check creates never
reach disk.

This works because the booking path's own transaction and accounting's `CreateJournalEntries`
savepoints nest correctly three deep — verified by a spike before any check was written
(`plans/archive/integration-testing-plan.md` §0).

Work the product runs on an isolated provider (`WithIsolatedProvider` in CoreEntitiesServer: the
checkout capture, the webhook's delivery row) would write on another pooled connection, outside the
check's transaction, and wait on that transaction's locks until the request timeout (#947).
`InRolledBackTransaction` runs its body inside `JoinCallerTransactionForTests` (imported from
`@mj-biz-apps/orders-core-entities-server/testing`; the package root does not export it), so that work
joins the check's transaction instead. A check run that way proves what isolated work writes, not that it
writes on its own transaction. Two things cover the isolation itself: `isolatedProvider.test.ts`, and
`subscription-renewal.SR46-OT`, which runs SR46's payment `OutsideTransaction` so the capture uses its own
provider as in production. A capture that waited on a transaction its own request holds times out there
while SR46 still passes. SR46-OT commits, so it deletes its rows afterwards (`PurgeCheckoutRun`, scoped to
the IDs it made) and fails if any are left.

Apart from those two teardowns, removing committed data is a separate, manual step.
`node test-harnesses/purge-fixture-data.mjs` deletes what older per-run fixtures left behind
(companies named `IT-ORD-…` and everything hanging off them), and `seed-review-data.mjs` runs the
same purge before it seeds unless given `--keep-existing`.
The sweep is FK-ordered, and it **does** disable the immutability triggers while it runs. It has to:
a booked `OrderLine.JournalEntryID` cannot be cleared and a captured `PaymentLine` cannot be deleted,
because in the application a correction is a reversal and never an edit. Housekeeping is the one
caller genuinely removing history rather than rewriting it. The triggers go back on in the same
statement list. The sweep also deletes every charge-type `GLAccountLink`, because those are keyed by
charge type rather than by company; run it against a development database only.

The trigger handling was not always there, and the reason it went unnoticed is worth keeping in mind
when reading anything here: because every check rolls back, the sweep had only ever been asked to
delete rows that were not there. It "worked" by having nothing to do, and was missing five child
tables as well. Both only surfaced once `seed-review-data.mjs` started committing orders on purpose —
see `docs/reviewing-the-data.md`.

## Writing a check

```ts
{
    Id: 'my-bundle.MB1',
    Name: 'MB1: what this proves, in one line',
    RequiresMutation: true,
    Fn: async (ctx) => InRolledBackTransaction(ctx, async () => {
        const f = Fx();
        const result = await ConfirmOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [...] });
        Assert(result.Saved, `confirm failed: ${result.Message}`);
        const rows = await TxQuery(ctx, `SELECT ... FROM ${ORDERS_SCHEMA}.OrderLine WHERE ...`);
        AssertEqual(rows.length, 3, 'order line count');
    }),
}
```

Four rules, each of which has already cost us a debugging session:

1. **Every query goes through `TxQuery`/`TxOne`** (the provider). `ctx.Pool` is a different
   connection: it blocks on the open transaction's write locks until timeout, and under `mj test`
   it is `undefined` anyway.
2. **Build orders through `ConfirmOrder`/`BuildOrder`**, never raw INSERTs — that is the path
   `OrderEntityServer.Save` intercepts, and it is the thing under test.
3. **Compare GUIDs with `SameID`.** SQL Server returns them uppercased; `randomUUID()` is lowercase,
   so `===` is silently always false.
4. **A negative assertion must assert the REASON.** `Assert(!result.Saved)` is also satisfied when
   the entity subclasses were never registered and no logic ran at all. Match the message.

For a check that deliberately trips a database guard, use `OutsideTransaction(body, cleanup)`
instead: a trigger raising a severity-16 error dooms the enclosing transaction outright, savepoints
included, so rollback-based isolation is impossible for that check.

## Bundles

The server bundles and their exact check counts are `EXPECTED_BUNDLES` in
[`src/__tests__/registry-parity.test.ts`](src/__tests__/registry-parity.test.ts); `src/index.ts`
exports each one, and the parity test fails when the two disagree. What a bundle covers is in its
check file's header comment (`src/checks/<bundle>.checks.ts`) and in the description of its `MJ: Tests`
record (`metadata-tests/tests/`).

Three client-only bundles run over GraphQL instead:

| Bundle | Checks |
|---|---|
| `wire-crud` | W1–W3 |
| `wire-volume` | WV1–WV7 (committed) |
| `wire-entitlements` | WE1–WE5 (Check/List over GraphQL; WE1 confirms) |
| `wire-party-keep` | KP1–KP3 (a kept party organization survives a bill-to replacement saved over GraphQL) |

`wire-crud`, `wire-volume`, `wire-entitlements` and `wire-party-keep` are **not** in `src/index.ts` or `EXPECTED_BUNDLES`. They register from `src/client-index.ts` and `test-harnesses/integration-client.mjs` so a GraphQL process never loads `*EntityServer`. `wire-entitlements` confirms one STYLE-HB order (`Notes` `ER-WIRE:<runId>`) so Check/List have a real grant on the wire. `wire-party-keep` saves Draft orders (`Notes` `KP-WIRE:<runId>`) and deletes each one.

`volume` is the slow one: it confirms several hundred orders and runs last for that reason. It is
also the only bundle that creates a SECOND `SQLServerDataProvider`, which is how a real
`ConfirmOrder` gets an independent session; its header explains what that does and does not make
provable.

`billcom-rail` covers the Bill.com invoice rail with Bill.com replaced by an in-memory stub behind
the rail's gateway seam (`UseBillComGatewaySeams`), so the operations, the rail class, the capture
path and the ledger run as they do in production. Each check creates the `Bill.com` integration's
field lengths when the database has none, since a send refuses names it cannot check. What Bill.com
itself returns is probed by hand against a sandbox with `test-harnesses/billcom-live.mjs`, which
never runs in CI; see [`docs/billcom-invoice-rail.md`](../../docs/billcom-invoice-rail.md).

## Drift guards

`pnpm test` in this package is not an integration run — it is the wiring check, and
`pnpm run test:unit` at the root includes it. It needs no database, but it does need the packages
built. Bundle names live in four places (check IDs,
`src/index.ts`, `ALL_BUNDLES`, and a `MJ: Tests` record) and a miss in any one produces a bundle
nothing dispatches: no error, just silently absent coverage. The parity test asserts exact
per-bundle check counts and cross-checks all four places.

It matters more than it looks. `mj test` exits 0 **when it runs zero checks**, so "the suite passed"
only means something if something else independently asserts the checks exist.

## Adding a bundle

1. `src/checks/<name>.checks.ts` — export `NamedCheck[]`, `Register` each, `RegisterLifecycle` for
   the fixture.
2. Export it from `src/index.ts`.
3. Add it to `ALL_BUNDLES` in `test-harnesses/integration.mjs`.
4. Add a `MJ: Tests` record under `metadata-tests/tests/` naming the bundle in
   `Configuration.checks[].type`, plus suite membership, then
   `pnpm run mj sync push --dir metadata-tests`.
5. Import it in `src/__tests__/registry-parity.test.ts` and add it to `EXPECTED_BUNDLES` with its
   check count.

Step 5 is what makes steps 1–4 hard to get wrong: the guard fails until all of them are done.
