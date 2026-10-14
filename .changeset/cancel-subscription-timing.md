---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
---

`Orders.CancelSubscription` takes an optional `Timing` (#702). `Immediate` ends coverage and access on the request day; `EndOfTerm` ends them on the term's last day. A chosen timing drops the type's grace period, so access ends on the day chosen. Without it the type's `CancellationMode` decides, as before. The refund mode always comes from the type. The policy is `SubscriptionBehavior.RulesForTiming` and can be overridden; an unknown timing is refused before anything is written, and the lifecycle event records the timing chosen.
