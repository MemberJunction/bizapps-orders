# `IsOverdue` as a layered base view

**Upstream:** [MemberJunction/MJ#3419](https://github.com/MemberJunction/MJ/pull/3419) — *CodeGen: layered base views* — **merged 2026-08-05**
**Available here:** `Entity.GeneratedBaseViewName` is present in the installed `@memberjunction/core@6.1.0-edge.1`.

## What was missing

D32 says `IsOverdue` is "computed in the view/entity layer, never stored state". It was computed in
**neither**, so every consumer re-derived it — and they did not agree:

```text
GetOverdueWorklist   Status NOT IN ('Draft','Quoted','Voided') AND DueDate < asOf AND Balance > 0
InvoiceDisplay       Kind === 'Invoice' && AmountDue > 0 && DaysUntilDue < 0
the browser          Balance > 0 && DueDate < today
```

Only the first excludes a **voided** order. A voided order carrying a stale balance and a past due
date therefore reads as overdue on two of the three surfaces — putting a customer on a collections
list for money they do not owe, with nothing anywhere reporting a problem. Same
multiple-surfaces-disagreeing shape D83 solved for `DueDate`, one layer up.

## What is built here

**`packages/Entities/src/overdue.ts` — the rule, stated once.** `IsOverdue()` for code,
`OverdueSQL(alias)` for the view, `OverdueFilter(asOfDay)` for a `RunView`, and one
`NON_OWING_STATUSES` list all three read. Three languages cannot literally share code; they can share
a module, so a change lands in one file and both halves appear in one diff. `overdue.test.ts` asserts
every clause survives in each half, so dropping one fails a test rather than a customer.

**`GetOverdueWorklist` now calls `OverdueFilter`** instead of retyping the four clauses.

The module deliberately does **not** parse dates — `DueDateISO` arrives as a calendar day. Reading a
cell that may be a `Date` or a string is a separate concern with its own module, and doing it here
would make this the second place in the repo that interprets a date.

**`metadata/entities/.entities.json`** sets `BaseViewGenerated = 0` and
`GeneratedBaseViewName = 'vwOrderHeadersGenerated'` on Order Headers.

## What is NOT built here, and why

**The view itself, and the `IsOverdue` `EntityField` it produces.** Both need a live CodeGen loop
against a database — see the loop below. The predicate work
above stands on its own and removes the disagreement today; the column is what lets `RunView` filter
on it and Explorer show it.

```sql
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders] AS
SELECT g.*,
       CASE WHEN g.Balance > 0
             AND g.DueDate IS NOT NULL
             AND g.DueDate < CAST(GETUTCDATE() AS date)
             AND g.Status NOT IN ('Draft','Quoted','Voided')
            THEN 1 ELSE 0 END AS IsOverdue
FROM   [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g;
```

`${flyway:defaultSchema}` rather than a literal schema, per `migrations/_README.md`. The `Status`
clause is the one every hand-rolled copy of this rule forgot: without it a voided order with a stale
balance reports as overdue, and a customer lands on a collections list for money they do not owe.

### Where the generated SQL actually goes in THIS repo

MJ's own guidance says to commit CodeGen's output and number your migration after it. That describes
a repo where `migrations/codegen/` is committed. **Here it is gitignored** — it is a staging area, and
`scripts/append-codegen.sh` folds the generated SQL into the baseline migration below its
`CODEGEN OUTPUT` banner, replacing whatever generated tail was there.

That makes the ordering simpler than the generic path, not harder. The generated inner view lands in
`V202607061432__v0.1.x__Tables_and_Objects.sql`, so **any `V` migration with a later timestamp applies
after it** — on a fresh database as well as an existing one. No repeatable migration, no
`IF OBJECT_ID` guard, no second migrate pass.

### The loop, in order

```bash
npm run mj -- sync push --dir metadata     # 1. the entity metadata
npm run mj:codegen                         # 2. writes the INNER view   ⚠️ needs forceRegeneration
scripts/append-codegen.sh                  # 3. fold generated SQL into the baseline
#                                          # 4. add the V migration (below)
npm run mj:codegen                         # 5. discovers IsOverdue as a virtual EntityField
scripts/append-codegen.sh                  # 6. fold that in too
```

Run CodeGen **twice** at steps 2 and 5 if it reports success with dependent entities half-generated —
a known behaviour here, and `OrderLine` joins `OrderHeader`'s base view, so it is in the blast radius.

**Check after step 3:** the baseline should now contain `vwOrderHeadersGenerated`. If it does not,
step 2 did not do what it appeared to.

Step 4's migration must take its predicate from `OverdueSQL('g')` in `packages/Entities/src/overdue.ts`
rather than retyping it — that sharing is the entire point of the extraction.

### Verifying it, because none of these fail loudly

1. `IsOverdue` exists as an **`EntityField`** after step 5, so `RunView` can filter on it and Explorer
   shows it. Skip step 5 and the column exists in SQL while nothing above the database knows.
2. It **agrees with `GetOverdueWorklist`** on the same data — that operation generates its filter from
   `OverdueFilter()`, so this is what proves the shared module reached both surfaces.
3. A **voided** order with a past due date and a balance is **not** overdue. The regression this work
   exists to prevent.
4. `RUN_MUTATION_TESTS=1 node test-harnesses/integration.mjs`.

### ⚠️ The trap in step 2

Setting `GeneratedBaseViewName` is a **metadata** change, not a schema change, so the entity never
lands in CodeGen's modified/new list — and `logSQLForNewOrModifiedEntity` only writes migration output
for entities in that list.

The failure is quiet: CodeGen **does** create the inner view in whatever database you ran it against,
and emits **nothing**. Your box looks correct while every other environment never receives the view
at all, and the outer view from step 4 then selects from an object that does not exist there.

```javascript
// mj.config.cjs — TEMPORARY, delete after capturing the output
forceRegeneration: {
  enabled: true,
  baseViews: true,
  entityWhereClause: "Name IN ('MJ_BizApps_Orders: Order Headers')",
}
```

This does not apply to an entity layered from the start, nor to later schema changes on an
already-layered one — both put the entity in the modified list on their own.

### PostgreSQL

Layering is SQL Server only; MJ refuses `GeneratedBaseViewName` on PG rather than shipping a
documented footgun. The PG side keeps deriving `IsOverdue` in code — from `overdue.ts`, which is the
point of extracting it.
