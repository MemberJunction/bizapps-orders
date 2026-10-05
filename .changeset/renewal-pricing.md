---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": patch
---

The renewal pass reprices each renewal instead of copying the prior line: a first-term discount lapses unless the subscription carries it, a price typed below list lapses to the prior list price, a product with an Active successor renews as the successor at its list price, and an annual increase (subscription, product, category chain, then company) applies when the new term crosses an anniversary of the subscription's start. Every candidate, preview included, reports its base price, increase and final price; the order notes and renewal event record them. A line the pass priced is exempt from the concession gate while its price is unchanged. New field categories place the renewal inputs with each entity's renewal and default settings.
