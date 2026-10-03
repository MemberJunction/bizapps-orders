---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
---

`Orders.CancelSubscription` now cancels the subscription's later terms too (#406). A term that starts after coverage ends, such as a renewal booked ahead, is stamped Canceled and reversed in full on the same reversal order, whatever the type's refund mode; the policy is `SubscriptionBehavior.DecideLaterTermCancellation` and can be overridden. The output, preview included, gains `LaterTerms` and `TotalRefundAmount`, and the lifecycle event records the later terms. A request that falls before every term now acts on the next term to start rather than the latest. A later term sold on an instalment-billed order refuses the cancel, as the current term already does.
