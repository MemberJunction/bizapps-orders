# `@mj-biz-apps/orders-entities`

**Generated entity subclasses and Zod schemas for every table in `__mj_BizAppsOrders`, the typed
remote-operation bases, and the hand-written rules both tiers share.** Browser-safe: none of its
dependencies is server-side.

## Do not edit anything in `src/generated/`

CodeGen rewrites it wholesale from the database. Edits are lost at the next run, silently, and
usually at the worst moment.

To change what appears here, change the **schema**:

```bash
# 1. add a new V migration (docs/database-migrations.md)
pnpm run mj:migrate                               # 2. apply it
pnpm run mj:codegen                               # 3. regenerate
scripts/append-codegen.sh migrations/V<new>.sql   # 4. fold CodeGen's SQL into the new migration
```

## What CodeGen gives you, and what it does not

**Does:** a typed class per entity, a Zod schema per entity, string-union types derived from CHECK
constraints (`OrderType`, `Status`, `PricingModel`…), and field descriptions lifted from the
migration's `MS_Description` extended properties. It also emits a typed `BaseRemotableOperation`
base per row in `metadata/remote-operations/` (`src/generated/remote_operations.ts`), so a browser can
call an operation without the server engine.

The field descriptions are why the migration is so heavily commented — those comments become the
developer documentation and the AI-facing metadata. A column added without an extended property
arrives here undocumented.

**Does not:** business rules. Those are hand-written, and they split by what they need:

- **Here, beside the generated code:** every rule decidable from the record and its lines, on shared
  subclasses such as `OrderHeaderEntity` and `OrderLineEntity`; the order lifecycle
  (`OrderStatusBehavior`); and the pricing engine under `src/pricing/` — price resolution, promotions,
  charges and tax, run by `OrderPricingService`. The engine reads through `RunView`, which works on
  both tiers, so the browser can price an order with the code that books it, and the shared rules
  run in the browser's `Validate()` before a round trip and again on the server, which adds checks
  that need the database.
- **In `@mj-biz-apps/orders-core-entities-server`:** persistence and everything only the server does —
  booking, journal entries, subscriptions, payments, sequence numbers. Its subclasses extend the
  shared class (the generated class where there is none, and for Product Prices) and override
  `Save()` or validation; `ClassFactory` picks them on the server because they register later.

## Two things that will bite

**Union types come from CHECK constraints.** Widening a CHECK widens the type — a breaking change to
consumers even though no TypeScript was touched. Narrowing one is worse: existing rows become
unrepresentable.

**A repeated column name inside a CHECK can break generation.** CodeGen derives validation method
names from the constraint expression, and repeating a column produced a call to
`ValidatePromotionOrReasonRequiredReasonRequiredReasonRequired` against a method defined as
`ValidatePromotionOrReasonRequired` — a build break in generated code. Name the column once
(`ISNULL(col, '')` rather than `col IS NOT NULL AND col <> ''`). Reported upstream.
