---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202610060655` adds `SubscriptionFamily`: the products that are bands of one subscription offering, owned by one selling company, with `Code` unique within that company (golive #276). `Product.SubscriptionFamilyID` (nullable) puts a product in a family, and `OrderLine.AcknowledgesCoverageOverlap` (default false) marks a line meant to run alongside coverage the holder already has in the same family. The entity classes, GraphQL types and generated forms carry the new entity and both columns.
