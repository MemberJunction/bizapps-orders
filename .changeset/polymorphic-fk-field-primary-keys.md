---
"@mj-biz-apps/orders-entities": minor
---

`metadata/entities/.polymorphic-fk-entity-fields.json` gives every `MJ: Entity Fields` entry a `primaryKey` lookup (`@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=<entity>&Name=<field>`). The entries had none, and `mj sync push` creates a new row for any record without a `primaryKey`, so on a fresh database it tried to insert a second field row with a NULL `EntityID` and the app's whole metadata push rolled back. With the lookup, push updates the field row CodeGen created and sets its `EntityIDFieldName`.
