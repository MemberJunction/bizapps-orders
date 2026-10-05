---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A subscription line can now say what confirm should do when the customer already holds the product. The line editor finds the live subscription and asks: add the line as that subscription's next term, or start a new subscription that keeps the line's dates. The answer is stored in `OrderLine.SubscriptionAction` and applied by `SubscriptionBehavior`; a `RejectDuplicate` type still refuses a second subscription. A new subscription now starts at term 1 even when the subscriber holds another one; it used to continue the other subscription's term count.
