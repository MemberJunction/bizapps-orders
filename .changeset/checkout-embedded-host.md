---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

`<mj-orders-checkout>` can be embedded inside another widget. New attributes: `email` prefills the e-mail field while it is empty; `source` and `source-ref` say where the checkout came from and are kept on the checkout session as `MetadataJSON.Attribution` (`NormalizeCheckoutAttribution`; an unreadable one is dropped, never refused). A host dispatches `checkout-reset` on the element to return it to a blank form; it is refused with `checkout-reset-refused` while a payment is in flight, and after a completed sale it starts over with a new session.
