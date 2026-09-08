---
"@mj-biz-apps/orders-entities": patch
---

`V202609061900` could not apply on any host but the one it was generated from.

The migration seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against a
hardcoded `EntityFieldID` — `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField
IDs per host, so that GUID exists only on the authoring database. Everywhere else the insert
hits `FK_EntityFieldValue_EntityField` and aborts the whole migration at batch 8 of 233,
taking the rest of the 5.10.0 upgrade with it — and, because `mj app upgrade` resolves
dependencies to latest, blocking every app that depends on orders too.

The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` +
`EntityField.Name = 'FulfillmentStatus'`), with a `THROW` if it is genuinely absent rather
than a silent no-op. Each of the five values is guarded independently on
`(EntityFieldID, Value)`, so a host that already carries some of them keeps its own rows and
IDs and only gains the missing ones — an install that had Fulfilled/Pending/Returned gains
NotApplicable and PartiallyFulfilled and nothing else moves.

The file is edited in place rather than superseded: it has never applied successfully
anywhere except the authoring database, so no host carries a checksum for it.
