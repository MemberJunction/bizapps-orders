---
"@mj-biz-apps/orders-core-entities-server": minor
---

Guard the `EntityField` inserts in `V202608251540` on the unique index, not just the ID.

`UQ_EntityField_EntityID_Name` enforces one row per `(EntityID, Name)` pair. Two guards in that
migration tested the row **ID** alone, which passes whenever the pair already exists under a
*different* ID — CodeGen mints a fresh GUID per host, so that is the normal case, not an edge one. The
insert then violated the unique index and stopped the migration chain.

That is `#126`: Explorer could not open any orders record on the dev host, because the migrations that
would have fixed it could not be applied.

**Two guards, not one.** Fixing `MaxQuantityPerLine` alone left the chain stopping one insert earlier
on `PricingDriverClass`, same entity. Rather than chase it failure by failure, every `EntityField`
guard in the file was enumerated: **20 total, 18 already correct, exactly 2 broken.** Both now match
the other eighteen, and none remain.

The chain had been stopped at `202608141800` since 15 August. It now runs to `202609020400` —
17 applied, 0 failed — and the generated orders app, which previously never finished loading, opens
records.

A `minor` bump because the repo requires one for any change under `migrations/**`.
