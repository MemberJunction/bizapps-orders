---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
---

Migration `V202609291305` adds `Product.SubscriptionFamily`, a nullable code shared by the products that are bands of one subscription offering, and `OrderLine.AcknowledgesCoverageOverlap`, default false, which marks a line meant to run alongside existing coverage in the same family. The entity classes and GraphQL types carry both columns.
