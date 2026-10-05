---
"@mj-biz-apps/orders-core-entities-server": patch
---

The Subscription and Project / Implementation product types now default to the `OnFirstPayment` grant timing. A new order for a product of either type, with no timing set on the product or its category, holds its entitlement grants until the first payment arrives; a renewal keeps access until it is `RenewalAccessCutoffDaysPastDue` days past due. Grants already written keep the timing they were confirmed with.
