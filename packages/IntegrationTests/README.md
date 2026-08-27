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
GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs operating-history
```

`wire-volume` **commits**. Each header `Notes` is `WIRE-VOL:<runId>` so you can inspect and later purge. Default count is 200 (`WIRE_VOL_COUNT`). ORD-WORLD must already be loaded (catalog-world / ORD-00). See `docs/reviewing-the-data.md`. Purge with `node test-harnesses/purge-wire-volume.mjs`.

`operating-history` **commits** a dated, idempotent spine (`Notes` = `ORD-HIST:v1`, ~June 2025–November 2026, BCP + HH). It is the cash-forecast source world: paid volume, planted open/partial/overdue AR, annuals that renew inside the Friday 2026-11-20 horizon, and one cancelled annual. Re-running skips descriptions that already exist. FP&A's GraphQL suite materializes this world.

## Running

```bash
# fast inner loop: one bundle, or one check. Stack traces with IT_VERBOSE=1.
node test-harnesses/integration.mjs                    # all 20 bundles, 230 checks
node test-harnesses/integration.mjs subscriptions
node test-harnesses/integration.mjs subscriptions.SB5

# the recorded path — same registry, results written against the metadata Test records
RUN_MUTATION_TESTS=1 MJ_INTEGRATION_TEST=1 \
  npm run mj -- test suite --name "BizApps Orders Integration"
```

Both need a working database — `scripts/rebuild-db.sh` from zero.

`RUN_MUTATION_TESTS=1` is **required**. Every check here is mutation-class, so without the gate the
driver reports zero checks and the suite passes having done nothing.

Run the **workspace** CLI (`npm run mj`), never a global `mj`: a global install ships its own
published testing packages and cannot resolve this private one, so the bundles never register.

## Isolation

The fixture (companies, GL accounts + links, product catalog, tax geography) is created once per
bundle and committed — inert reference data. Every check then runs inside a provider transaction that
**always rolls back**, so orders, journal entries, payments and subscription terms never reach disk.

This works because the booking path's own transaction and accounting's `CreateJournalEntries`
savepoints nest correctly three deep — verified by a spike before any check was written
(`plans/archive/integration-testing-plan.md` §0).

Teardown is an FK-ordered sweep, and it **does** disable the immutability triggers while it runs. It
has to: a booked `OrderLine.JournalEntryID` cannot be cleared and a captured `PaymentLine` cannot be
deleted, because in the application a correction is a reversal and never an edit. Housekeeping is the
one caller genuinely removing history rather than rewriting it. The triggers go back on in the same
statement list.

That was not always true, and the reason it went unnoticed is worth keeping in mind when reading
anything here: because every check rolls back, teardown had only ever been asked to delete rows that
were not there. It "worked" by having nothing to do, and was missing five child tables as well. Both
only surfaced once `seed-review-data.mjs` started committing orders on purpose — see
`docs/reviewing-the-data.md`.

**One thing the fixture is not scoped by company:** the charge-type `GLAccountLink` rows, which are
keyed by charge type (application metadata shared by every run). Setup deletes any pre-existing set
before writing its own, because two active links per type let one run's shipping and tax post to
another run's accounts.

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

| Bundle | Checks |
|---|---|
| `order-booking` | OB1–OB9 |
| `revenue-recognition` | RR1–RR7 |
| `subscriptions` | SB1–SB12 |
| `subscription-cancellation` | SC1–SC10 |
| `subscription-renewal` | SR1–SR11 |
| `payments-rollups` | PR1–PR9 |
| `volume` | VL1–VL13 |
| `entitlement-read` | ER1–ER7 (CheckEntitlement / ListEntitlements, in-process Execute) |
| `wire-crud` | W1–W3 (client only) |
| `wire-volume` | WV1–WV7 (client only, committed) |
| `wire-entitlements` | WE1–WE5 (client only, Check/List over GraphQL; WE1 confirms) |

`wire-crud`, `wire-volume`, and `wire-entitlements` are **not** in `src/index.ts` or `EXPECTED_BUNDLES`. They register from `src/client-index.ts` and `test-harnesses/integration-client.mjs` so a GraphQL process never loads `*EntityServer`. `wire-entitlements` confirms one STYLE-HB order (`Notes` `ER-WIRE:<runId>`) so Check/List have a real grant on the wire.

The complete server-bundle list, with what each bundle is for, is the header comment of `src/index.ts` — it is next
to the exports that register them, so it cannot drift as far as a table over here can.

`volume` is the slow one: it confirms several hundred orders across its thirteen checks and runs last
for that reason. It is also the only bundle that creates a SECOND `SQLServerDataProvider`, which is
how a real `ConfirmOrder` gets an independent session; its header explains what that does and does
not make provable.

## Drift guards

`npm test` in this package is not an integration run — it is the wiring check. Bundle names live in
four places (check IDs, `src/index.ts`, `ALL_BUNDLES`, and a `MJ: Tests` record) and a miss in any
one produces a bundle nothing dispatches: no error, just silently absent coverage. The parity test
asserts exact per-bundle check counts and cross-checks all four places.

It matters more than it looks. `mj test` reports a **green suite when it runs zero checks**, so
"the suite passed" only means something if something else independently asserts the checks exist.

## Adding a bundle

1. `src/checks/<name>.checks.ts` — export `NamedCheck[]`, `Register` each, `RegisterLifecycle` for
   the fixture.
2. Export it from `src/index.ts`.
3. Add it to `ALL_BUNDLES` in `test-harnesses/integration.mjs`.
4. Add a `MJ: Tests` record under `metadata-tests/tests/` naming the bundle in
   `Configuration.checks[].type`, plus suite membership, then `mj sync push --dir metadata-tests`.
5. Add it to `EXPECTED_BUNDLES` in `src/__tests__/registry-parity.test.ts` with its check count.

Step 5 is what makes steps 1–4 hard to get wrong: the guard fails until all of them are done.
