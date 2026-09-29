---
'@mj-biz-apps/orders-integration-tests': patch
---

The `payment-terms` bundle proves that a confirmed order's `DueDate` can be corrected without approval and that every correction, and every change to `PaymentTermsTypeID`, leaves a `MJ: Record Changes` row with the old value, the new value and who made it.
