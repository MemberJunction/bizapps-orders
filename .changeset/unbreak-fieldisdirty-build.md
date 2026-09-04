---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

Unbreak the build: `FieldIsDirty` was called but never defined.

`next` has not compiled since #155. Nine call sites across Entities and Angular call
`BaseEntity.FieldIsDirty(...)`, which **does not exist in MemberJunction** — a code search across
the whole MJ repo finds nothing, and 6.1.0-edge.5 is the newest edge. `orders-entities` failed to
compile, which cascaded into `orders-core-entities-server` as dozens of "has no exported member"
errors.

Adds `anyFieldIsDirty(entity, names)` over MJ's real API (`GetFieldByName(name)?.Dirty`) and a
`FieldIsDirty(...names)` method on `OrderLineEntity` and `OrderHeaderEntity`. Call sites holding a
*generated* entity type — `Lines.Items`, and the Angular services — go through the helper directly,
since the generated class has no such method.

Also fixes two unrelated breaks in the same run: `Products$`/`ProductPrices$` had no explicit
return type, so TypeScript could not name the inferred `Observable` (TS2742) — `rxjs` is now a
declared dependency rather than a transitive one — and `CreateEmptyFilter` was imported with the
wrong casing (`createEmptyFilter`).
