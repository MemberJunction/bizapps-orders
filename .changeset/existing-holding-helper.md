---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": patch
---

`orders-entities` exports the "customer already holds this product" lookup behind a subscription line's extend-or-new question: `FindExistingHolding`, `HoldingSubscriberFor` and `FindUnansweredHeldLines`. It uses `RunView` only, so another app's server can refuse a confirm or a close while a line for a held product has no `SubscriptionAction`, using the same rule the order screen asks with. A failed read throws instead of reporting no holding. `orders-ng`'s `GetExistingHolding` and the order line editor now call it.
