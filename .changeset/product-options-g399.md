---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-integration-tests": minor
---

Product options (golive #399): options such as Tier and Size are offered on one product instead of one product per combination. A product type, a category or the product assigns them, the most specific assignment winning whole; the picks are recorded on the order line and price rules test them through the new `Option` source. A line missing a required pick is refused, renewals carry their picks, and a subscription moved to a successor product takes the picks the retired product names. Entitlement templates can grant one code per pick. Adds the schema for variant SKUs, refused on save until it is wired.
