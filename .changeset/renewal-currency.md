---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

Renewals of a subscription sold in another currency stay in that currency: the renewal order takes the source order's currency, the increase applies to the price in that currency, and the renewal's confirm reads its own booking rate. A foreign-currency renewal is not moved to a successor product's list price or charged to a saved card. The Renewals page shows the currency next to amounts, and `Orders.GetRenewalWorklist` rows carry `CurrencyCode`.
