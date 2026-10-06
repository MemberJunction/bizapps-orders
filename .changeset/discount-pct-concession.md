---
"@mj-biz-apps/orders-core-entities-server": minor
---

A line's `DiscountPct` is now a concession. The confirm gate holds an order whose lines carry a `DiscountPct` until an Approved Price concession covers it, the same as a price below the engine's; one concession covers both on the same line. Recording a Price concession values the discount (gross × `DiscountPct`), so it is Approved inside the requester's Sales Authority and Pending otherwise. A renewal line's carried-forward discount, bundle components and reversals are not counted. The price-below-engine finance exception reports discounts on the same terms. New exports: `LineConcessionTerms`, `LineConcessionFacts`.
