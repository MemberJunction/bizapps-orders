---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A promotion code that brings a checkout to zero now completes: the widget asks for no card when nothing is due, a fully discounted deferred line books no revenue releases instead of refusing the order, and a subscription bought that way does not renew on its own. A failed checkout now shows the buyer a plain message, with the cause kept in the server log.
