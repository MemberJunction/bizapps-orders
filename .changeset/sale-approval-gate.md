---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Products that always need approval (golive #281). The confirm gate holds a draft order while a line whose product requires sale approval (`RequiresSaleApproval`, inherited Product -> category chain -> type) has no Approved Price or Scope concession decided under the ConcessionLimit rule. Such a concession is valued at zero when nothing is given away against an engine price, always goes to the ConcessionLimit role whatever the requester's authority, and cannot be decided by its requester. Renewal lines, bundle components and reversals are not held. New exports: `ResolveRequiresSaleApproval`, `SaleApprovalFacts`, `ProductsRequiringSaleApproval`.
