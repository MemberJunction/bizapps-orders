---
"@mj-biz-apps/orders-entities": minor
---

Migration `V202609282340` adds the CheckoutSessionStep table: one row per checkout session per post-payment step (Confirm, Capture), with status, attempts, last error, whether that error is retryable, what started the last attempt and when.
