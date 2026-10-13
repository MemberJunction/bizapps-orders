---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
---

`Orders.CancelSubscription` takes an optional `Timing` (#702). `Immediate` ends coverage and access on the request day with no grace period; `EndOfTerm` rides the term out with the subscription type's grace. Without it the type's `CancellationMode` decides, as before. The refund mode always comes from the type. The policy is `SubscriptionBehavior.RulesForTiming` and can be overridden; an unknown timing is refused before anything is written, and the lifecycle event records the timing chosen.
