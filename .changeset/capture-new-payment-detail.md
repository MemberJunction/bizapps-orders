---
'@mj-biz-apps/orders-core-entities-server': patch
---

A payment captured in the same save that creates its payment detail (the payment form's Capture & Book on an unsaved payment) no longer fails with "Could not read the payment's instrument to book a gift card redemption: no such record". The gift card lookup ran before the save wrote the new detail; it now reads a new or edited detail from memory and only reads the database for an unchanged saved one.
