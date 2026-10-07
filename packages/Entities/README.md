# `@mj-biz-apps/orders-entities`

**Generated entity subclasses and Zod schemas for every table in `__mj_BizAppsOrders`.** Browser-safe:
depends on `@memberjunction/core` and `zod`, nothing server-side.

## Do not edit anything in `src/generated/`

CodeGen rewrites it wholesale from the database. Edits are lost at the next run, silently, and
usually at the worst moment.

To change what appears here, change the **schema**:

```bash
# 1. add a new V migration (docs/database-migrations.md)
pnpm run mj:migrate            # 2. apply it
pnpm run mj:codegen            # 3. regenerate
```

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
