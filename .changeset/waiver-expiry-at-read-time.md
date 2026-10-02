---
'@mj-biz-apps/orders-core-entities-server': patch
---

`Orders.CheckEntitlement` and `Orders.ListEntitlements` deny an `OnPaidInFull` grant, or an `OnFirstPayment` new purchase, from the day after its order's approved `WaivePaymentHold` ends unpaid, instead of granting until the nightly `EnforcePaymentGatedAccess` job suspends the grant (#404). The read path uses the job's `DecideGrantStatus` and `ApplyAccessOverrides` on the business-time-zone day, only ever tightens access, applies whether or not the renewal cutoff is on, and fails closed when the order's payment facts cannot be read. New pure helper `ReadTimeWaiverExpirySuspension`; the internal loader `LoadReadTimeCutoffSuspensions` is now `LoadReadTimePaymentSuspensions`.
