---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The Order form now says what is required in place of "Need a…": a bill-to party, at least one line, a service period and a check or ACH reference before an order can be confirmed, and a dimension value before it can be saved. The reasons `OrderHeaderEntity.ConfirmEligibility()` returns for a missing bill-to party, a missing line and a missing service period changed with them.
