---
"@mj-biz-apps/orders-entities": minor
---

`Heal_EventProduct_IS_A_Fields` shipped parked Sequence values as literals.

The migration inserted its two IS-A parent fields with `Sequence` hardcoded to **100018** and
**100019** — values read off an authoring database whose fields had been parked in the 100000
band by an incomplete CodeGen run. `changes_and_migrations` catches exactly this
(`EntityField Sequence must not be a literal placeholder`).

Shipping them would pin `PricingDriverClass` and `MaxQuantityPerLine` into the parked band on
every host that applies the migration, and collide with `UQ_EntityField_EntityID_Sequence`
wherever those numbers are already taken — a unique violation aborts one statement while
execution continues, so the run dies later on an unrelated-looking FK error, which is precisely
how the 5.10.0 upgrade failed on AIDP.

Both are now `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [EntityField] WHERE [EntityID] = …)`,
evaluated per host. Each INSERT is its own batch, so the second sees the row the first wrote.

Note for hosts already carrying parked fields: the same two literals appear in the
already-applied `V202608251540__v0.1.x__CodeGen_Heal_PricingDriverClass_And_SPs.sql`, which is
immutable now. Those existing parked rows need a renumber pass; this change stops new ones.
