---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

After a confirmed checkout, the redirect to `redirectUrl` carries the order number as `?order=<number>` (both the Angular element and the fallback host page), so the landing page knows which order completed. A widget can set `sendReceipt: true` to have the payment gateway e-mail its own receipt to the buyer: the intent carries a new `ReceiptEmail` (Stripe `receipt_email`). The e-mail is hashed into the intent's idempotency key, so a buyer who changes their e-mail can still reopen payment.
