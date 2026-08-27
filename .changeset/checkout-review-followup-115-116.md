---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
