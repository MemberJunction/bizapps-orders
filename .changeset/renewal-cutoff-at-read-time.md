---
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.CheckEntitlement` and `Orders.ListEntitlements` deny an `OnFirstPayment` renewal from the day its order reaches `RenewalAccessCutoffDaysPastDue`, instead of granting until the nightly `EnforcePaymentGatedAccess` job suspends the grant (#287). The read path uses the job's `DecideGrantStatus` and `ApplyAccessOverrides` on the business-time-zone day, only ever tightens access, and fails closed when the order's payment facts cannot be read. New pure helper `ReadTimeCutoffSuspension`.
