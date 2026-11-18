---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

A rep's share limit can rise with the order's product mix (golive #281). The new `SalesAuthorityMixTier` table holds tiers on a Sales Authority: on an order whose lines span at least `MinProductTypes` distinct product types, the authority's `MaxConcessionPctOfContract` is raised to the tier's value, for example 10% with two product types and 15% with three. A product type is the product family. Bundle components and reversals are not counted. The limit is applied when a concession is recorded and again at confirm, so removing a product type after an approval on the rep's own authority holds the confirm until that concession is withdrawn and recorded again. Authorities with no tiers behave as before. New migration `V202611170400__v5.51.x__SalesAuthority_MixTiers.sql`.
