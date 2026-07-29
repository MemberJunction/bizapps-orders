# `@mj-biz-apps/orders-entities`

**Generated entity subclasses and Zod schemas for every table in `__mj_BizAppsOrders`.** Browser-safe:
depends on `@memberjunction/core` and `zod`, nothing server-side.

## Do not edit anything in `src/generated/`

CodeGen rewrites it wholesale from the database. Edits are lost at the next run, silently, and
usually at the worst moment.

To change what appears here, change the **schema**:

```bash
# 1. edit the baseline migration (pre-1.0 practice: edit in place, never fix-up migrations)
# 2. rebuild from zero and regenerate
scripts/rebuild-db.sh          # trims the generated half, applies hand-authored DDL only
npm run mj:codegen             # regenerates everything, since the DB is now bare
scripts/append-codegen.sh      # puts the generated SQL back below the banner
npm run mj -- sync push --dir metadata
```

That cycle is self-consistent by construction: the rebuild deliberately drops the generated half
first, because otherwise it produces a database whose metadata is already current and CodeGen emits
only a delta.

## What CodeGen gives you, and what it does not

**Does:** a typed class per entity, a Zod schema per entity, string-union types derived from CHECK
constraints (`OrderType`, `Status`, `PricingModel`…), and field descriptions lifted from the
migration's `MS_Description` extended properties.

That last one is why the migration is so heavily commented — those comments become the developer
documentation and the AI-facing metadata. A column added without an extended property arrives here
undocumented.

**Does not:** business rules. Every invariant lives in
`@mj-biz-apps/orders-core-entities-server`, whose subclasses override `Save()` and are resolved by
`ClassFactory` at runtime. Instantiating an entity from this package on the client gets you the
shape; the rules run on the server.

## Two things that will bite

**Union types come from CHECK constraints.** Widening a CHECK widens the type — a breaking change to
consumers even though no TypeScript was touched. Narrowing one is worse: existing rows become
unrepresentable.

**A repeated column name inside a CHECK can break generation.** CodeGen derives validation method
names from the constraint expression, and repeating a column produced a call to
`ValidatePromotionOrReasonRequiredReasonRequiredReasonRequired` against a method defined as
`ValidatePromotionOrReasonRequired` — a build break in generated code. Name the column once
(`ISNULL(col, '')` rather than `col IS NOT NULL AND col <> ''`). Reported upstream.
