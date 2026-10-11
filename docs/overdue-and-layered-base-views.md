# `IsOverdue` and the layered `vwOrderHeaders` view

The reference for how overdue is decided, how `vwOrderHeaders` is layered over CodeGen's view, and
the CodeGen steps that layering needs in this repo. MJ's description of layered base views is in its
[CodeGen README](https://github.com/MemberJunction/MJ/blob/next/packages/CodeGenLib/README.md#base-views-generated-custom-or-layered).

## Why it exists

Plan decision D32 says `IsOverdue` is "computed in the view/entity layer, never stored state". It was
once computed in neither, so `GetOverdueWorklist`, the invoice display and the browser each
re-derived it, and only the worklist excluded a **voided** order: a voided order with a stale balance
and a past due date read as overdue on two of the three surfaces, putting a customer on a
collections list for money they did not owe. The rule now lives in one module and one view column.

## The rule: `packages/Entities/src/overdue.ts`

An order is overdue when its `Balance` is above zero, its due day is before today, and its `Status`
is not Draft, Quoted or Voided (`NON_OWING_STATUSES`). The module states that once, for every
caller:

- `IsOverdue()` and `DaysOverdue()` for code;
- `OverdueSQL(alias, dueDateExpression?, todayExpression?)` for the SQL predicate;
- `OverdueViewSQL()` for the whole `vwOrderHeaders` statement a migration copies verbatim;
- `OverdueFilter(asOfDay)` for a `RunView` filter on the view's `NextDueDate`. `GetOverdueWorklist`
  builds its filter with it and ages each order from `NextDueDate`.

Three languages cannot literally share code; they can share a module, so a change lands in one file
and both halves appear in one diff. `overdue.test.ts` asserts every clause survives in each form, and
that the newest migration defining `vwOrderHeaders` carries, byte for byte, the statement
`OverdueViewSQL()` emits.

**The due day is `NextDueDate`:** the earliest due date among the order's live, unpaid instalments
(`OrderHeaderPaymentSchedule` rows that are Scheduled or Invoiced with a balance), or the header's
own `DueDate` when it has none. An order billed in instalments is overdue when any unpaid instalment
is past due, which is the same as its earliest one being past due. For an order with no schedule,
`NextDueDate` is `DueDate`, so it reads as it always did.

**Today is the business day:** `bt.Today` from bizapps-common's `fnBusinessToday()`, the calendar day
in the zone the business books in. `CAST(GETUTCDATE() AS date)` is already tomorrow for the whole
American evening, so an order due today would read as overdue from 7 PM Central.

The module does **not** parse dates — `DueDateISO` arrives as a calendar day. Reading a cell that may
be a `Date` or a string is a separate concern with its own module, and doing it here would make this
the second place in the repo that interprets a date.

## The view

- `metadata/entities/.entities.json` sets `BaseViewGenerated = 0` and
  `GeneratedBaseViewName = 'vwOrderHeadersGenerated'` on Order Headers.
- CodeGen writes the inner view, `vwOrderHeadersGenerated`. This repo owns `vwOrderHeaders`, which
  selects `g.*` from it and adds `NextDueDate` and `IsOverdue`.
- Both added columns are virtual `EntityField`s, so `RunView` can filter on them and Explorer shows
  them.

The layering shipped in `V202608131541__v0.1.x__OrderHeaders_layered_inner_view.sql` (the flags and
the inner view) and `V202608131542__v0.1.x__OrderHeaders_IsOverdue_outer_view.sql` (the outer view
and the `IsOverdue` field). Later migrations redefine `vwOrderHeaders` with the same layering:
`V202609211100` moved "today" to the business day, and `V202609211200` added `NextDueDate`. The
current statement is `OverdueViewSQL()`; copy it from there rather than from an older migration.

## CodeGen for a layered view

### Where the generated SQL goes in this repo

MJ's own guidance says to commit CodeGen's output and number your migration after it. That describes
a repo where `migrations/codegen/` is committed. **Here it is gitignored** — it is a staging area, and
`scripts/append-codegen.sh <migration>` folds the generated SQL into the named migration below its
`CODEGEN OUTPUT` banner, replacing whatever generated tail was there. It refuses a migration already
on `origin/next`, because a merged migration is locked ([database-migrations.md](database-migrations.md)).

So each step of the layering is its own new `V` migration that carries its own CodeGen output, and
the outer view's migration takes a later timestamp than the inner view's. Migrations apply in
timestamp order, so the inner view exists before the outer view selects from it — on a fresh
database as well as an existing one. No repeatable migration, no `IF OBJECT_ID` guard, no second
migrate pass.

### Layering an entity, in order

```bash
# 1. migration A: the layering flags on the entity, then a CODEGEN OUTPUT banner
pnpm run mj:migrate                            # 2. apply A
pnpm run mj:codegen                            # 3. writes the INNER view   ⚠️ needs forceRegeneration
scripts/append-codegen.sh migrations/<A>.sql   # 4. fold that output in below A's banner
# 5. migration B, later timestamp: the outer view (below), then a CODEGEN OUTPUT banner
pnpm run mj:migrate                            # 6. apply B
pnpm run mj:codegen                            # 7. discovers the new columns as virtual EntityFields
scripts/append-codegen.sh migrations/<B>.sql   # 8. fold that output in below B's banner
```

Each append replaces only the tail of the migration it names, so B's output never overwrites A's.

To change `vwOrderHeaders` now that it is layered, only steps 5–8 apply: a new migration carrying
`OverdueViewSQL()`'s statement, pasted verbatim, then migrate, CodeGen and append.

If CodeGen reports success with dependent entities half-generated — `OrderLine` joins
`OrderHeader`'s base view, so it is in the blast radius — do not re-run it and append again: a
second run emits only what is still missing, and the append replaces the first run's output with
that fragment. `append-codegen.sh` refuses both cases it can detect and prints the steps to
regenerate from a database that has not run the migration.

**Check after step 4:** migration A should now contain the inner view (`vwOrderHeadersGenerated` for
Order Headers). If it does not, step 3 did not do what it appeared to.

### Verifying it, because none of these fail loudly

1. `IsOverdue` exists as an **`EntityField`** after step 7, so `RunView` can filter on it and Explorer
   shows it. Skip step 7 and the column exists in SQL while nothing above the database knows.
2. It **agrees with `GetOverdueWorklist`** on the same data — that operation generates its filter from
   `OverdueFilter()`, so this is what proves the shared module reached both surfaces.
3. A **voided** order with a past due date and a balance is **not** overdue. The regression this work
   exists to prevent.
4. `RUN_MUTATION_TESTS=1 node test-harnesses/integration.mjs`.

### ⚠️ The trap in step 3

Setting `GeneratedBaseViewName` is a **metadata** change, not a schema change, so the entity never
lands in CodeGen's modified/new list — and `logSQLForNewOrModifiedEntity` only writes migration output
for entities in that list.

The failure is quiet: CodeGen **does** create the inner view in whatever database you ran it against,
and emits **nothing**. Your box looks correct while every other environment never receives the view
at all, and the outer view from migration B then selects from an object that does not exist there.

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

MJ's CodeGen layers on PostgreSQL as well: after it regenerates the inner view it rebinds the outer
one (see the MJ README linked at the top). The outer view is still this repo's own SQL, and
`migrations-pg/` has no PostgreSQL version of it yet.
