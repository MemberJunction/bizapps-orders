---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202610032200` adds `OrderLine.SubscriptionAction` (`ExtendExisting` | `CreateNew` | NULL), the line's answer to what confirm should do when the subscriber already holds an active subscription to the product, with its CodeGen output: entity field and value list, the Event Order Lines IS-A field, the Order Line and Event Order Line views and CRUD procs, and the generated entity, GraphQL and form fields.
