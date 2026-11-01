---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

Spawn Renewals prices the renewal of a line that bought several terms at a typed price (`PriceOverridden`) at one term's share of that price, so a 24-month line typed at 20,000 on a 12-month type renews at 10,000 rather than 20,000. An engine-priced line already carries one term's price whatever period it states, and renews at it unchanged. A line no longer than the type's term renews at its own price as before. Each renewal candidate, preview included, now reports the renewal term's start and end (`RenewalTermStart`, `RenewalTermEnd`).
