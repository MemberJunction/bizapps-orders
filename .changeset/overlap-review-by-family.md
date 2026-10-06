---
"@mj-biz-apps/orders-core-entities-server": minor
---

The overlapping-subscriptions review and the nightly exception check pair bands by subscription family (golive #276).

- The "Overlapping Subscriptions" query has a new `MatchBasis`, `SameFamily`: two products with the same `Product.SubscriptionFamilyID`. `SameCategory` (same category and subscription type) now applies only when at least one of the two products has no family; products in different families are never paired.
- The query returns `LaterOverlapAcknowledged`, the later subscription's `OrderLine.AcknowledgesCoverageOverlap`. Acknowledged pairs stay on the review list.
- `Orders.DetectOverlappingSubscriptions` raises `SameFamily` pairs whatever `IncludeSameCategory` says, and leaves out a `SameFamily` pair whose later line acknowledged the overlap.
