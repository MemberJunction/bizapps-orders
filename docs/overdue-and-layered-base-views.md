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
against a database, and the ordering is not something to guess at — see below. The predicate work
above stands on its own and removes the disagreement today; the column is what lets `RunView` filter
on it and Explorer show it.

```sql
CREATE VIEW [__mj_BizAppsOrders].[vwOrderHeaders] AS
SELECT g.*,
       CASE WHEN <OverdueSQL('g')> THEN 1 ELSE 0 END AS IsOverdue
FROM   [__mj_BizAppsOrders].[vwOrderHeadersGenerated] g;
```

### The loop, in order

1. `mj sync push` — the entity metadata above.
2. **CodeGen with a scoped `forceRegeneration`** (see the trap below). It writes the inner view.
3. Commit CodeGen's output from `migrations/codegen/`.
4. Add the outer view as a `V` migration **numbered after that CodeGen output file** — it selects
   from the inner view, so on a fresh database it must be applied later. This ordering is the reason
   the migration is not in this PR: its timestamp has to be later than a generated file that does not
   exist yet, and picking one blind is how a fresh install ends up creating a view over nothing.
5. CodeGen again, so `IsOverdue` is discovered as a virtual `EntityField`.
6. Integration checks: `IsOverdue` agrees with `GetOverdueWorklist` on the same data, and a voided
   order with a past due date and a balance is **not** overdue.

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
