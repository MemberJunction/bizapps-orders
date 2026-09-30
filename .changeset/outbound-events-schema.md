---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291308` adds the OutboundEvent and OutboundDelivery tables: a transactional outbox of `OrderConfirmed` and `GrantStatusChanged` events, and one delivery row per event per registered consumer with its status (`Pending`, `Delivered`, `DeadLettered`), attempts, next attempt, deadline and lease. Includes its CodeGen output: the generated entity classes, GraphQL types, forms, and the Outbound Events sections on the Order Header and Entitlement Grant forms.
