---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Order review by trigger (bc-aidp-next-golive#320 §5). A Direct order that hits a switched-on trigger (`NoDeal`, `PriceVariance`, `ChangedAfterDealOrReview`, `OverThreshold`, `ServicePeriod`) cannot confirm until the reviewer role approves its `ORDERS_ORDER_REVIEW` task; an order a reviewer created goes to the escalation role. Routing is to the role holders' linked Persons, never the order's creator. Configured by the new `OrderReview*` settings, all off by default, so hosts that set nothing are unaffected. Adds the `RegisterOrderDealLink` seam for the sales app to say which deal created an order; the `ORDERS_ORDER_REVIEW` task type and the settings rows ship in metadata.
