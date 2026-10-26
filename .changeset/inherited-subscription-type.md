---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

A product that names no subscription type of its own but inherits one from its product type is now a subscription everywhere confirm treats it as one. `FindUnansweredHeldLines` asks the extend-or-new question for it, the order line screen shows its term start, `OrdersEngine.ServicePeriodSource` takes its service period from the term, a bundle component of it inherits the start and subscription answer, and a checkout selling it saves the instrument for renewals. `orders-entities` exports `ResolveSubscriptionTypeID` (the product's own type, else its product type's default) and `OrdersEngine.ResolveSubscriptionTypeID(productID)`; `orders-core-entities-server` re-exports the function from there.
