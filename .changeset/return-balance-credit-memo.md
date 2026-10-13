---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

A return against an order billed by instalment records the credit memo it booked on each returning line (`CreditMemoAmount`, zero when it credited nothing), so the return order's `Balance` is what the customer was credited rather than the full value of its lines (#661). RV5 and RV11 check both balances.
