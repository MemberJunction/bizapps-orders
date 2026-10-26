---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The order form's Payment tab lists the order's payment schedule: each instalment's due date, amount, status, invoice number and when its AR was raised, linked to the journal entry. An order with no schedule says its full value is raised to AR at confirm. `OrderHeaderEntity.LoadPaymentSchedule()` reads the rows, and the form's Refresh reads them again, so rows added elsewhere appear without reopening the order.
