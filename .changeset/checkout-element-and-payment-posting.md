---
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
---

Host the Angular checkout widget as an Angular Element on `GET /checkout/:slug`, retrieve Stripe intent status on complete (localhost has no webhook), skip a second confirmCardPayment when the intent already succeeded, and book `Orders.CapturePayment` after confirm so AmountPaid / PaymentHeader land without waiting for Stripe to POST. Stripe Capture treats an already-captured automatic-capture intent as success.
