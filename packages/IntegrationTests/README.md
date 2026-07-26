# @mj-biz-apps/orders-integration-tests

Integration check bundles for BizApps Orders. **Private — never published.** Importing this package
registers its bundles on `IntegrationCheckRegistry`; that is its entire runtime job.

```
mj.config.cjs → testing.checkModules → this package → IntegrationCheckRegistry → IntegrationTestDriver
```

## Running

```bash
# fast inner loop: one bundle, or one check. Stack traces with IT_VERBOSE=1.
node test-harnesses/integration.mjs                    # all 4 bundles
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

The fixture (companies, GL accounts + links, product catalog) is created once per bundle and
committed — inert reference data. Every check then runs inside a provider transaction that **always
rolls back**, so orders, journal entries, payments and subscription terms never reach disk. Teardown
is a plain FK-ordered sweep of the catalog: no `DISABLE TRIGGER`, no fight with the immutability
triggers, and a mid-run crash leaves nothing but catalog rows.

This works because the booking path's own transaction and accounting's `CreateJournalEntries`
savepoints nest correctly three deep — verified by a spike before any check was written
(`plans/integration-testing-plan.md` §0).

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

## Adding a bundle

1. `src/checks/<name>.checks.ts` — export `NamedCheck[]`, `Register` each, `RegisterLifecycle` for
   the fixture.
2. Export it from `src/index.ts`.
3. Add it to `ALL_BUNDLES` in `test-harnesses/integration.mjs`.
4. Add a `MJ: Tests` record under `metadata-tests/tests/` naming the bundle in
   `Configuration.checks[].type`, plus suite membership, then `mj sync push --dir metadata-tests`.

The bundle name lives in four places; miss one and you get a bundle nothing dispatches, silently.
MJ's suite guards this with a sibling-parity test — worth porting once we have more bundles.
