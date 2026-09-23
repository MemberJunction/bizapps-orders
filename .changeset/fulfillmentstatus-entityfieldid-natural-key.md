---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

`V202609221500__DimensionDefault` could not apply on any host but the one it was generated from.

It seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against the hardcoded
`EntityFieldID` `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField IDs per host, so that
GUID exists only on the authoring database. Everywhere else:

    The INSERT statement conflicted with the FOREIGN KEY constraint
    "FK_EntityFieldValue_EntityField"

which aborts the entire migration. On AIDP Next stage it killed the 5.15.0 upgrade at batch 19 of 30
and left the app registered `Error`.

**This is a regression of the 5.11.0 fix** — same GUID, same five values — which corrected the identical
defect in `V202609061900`. Regenerating a migration from the authoring database re-emitted the hardcoded
ID, and nothing in CI catches it.

The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` + `EntityField.Name =
'FulfillmentStatus'`), with a `THROW` if genuinely absent rather than a silent no-op. Each value is
guarded independently on `(EntityFieldID, Value)` and on its own row ID, so a host carrying some of them
already — which includes every host that ran the 5.11.0 fix — keeps its rows and gains only what is
missing.

Edited in place rather than superseded, because a later migration cannot rescue this one: it aborts the
run before anything after it executes. No host carries a checksum for it, since it cannot have applied
successfully anywhere but the authoring database.
