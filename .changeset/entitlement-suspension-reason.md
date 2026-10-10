---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

`Orders.CheckEntitlement` and `Orders.ListEntitlements` say why access is held and when a past-due renewal loses it (#269). A `Suspended` answer now carries `SuspensionReason`: `AwaitingPayment` (a new purchase waiting for its first payment), `PastDue` (a renewal past the cutoff) or `AwaitingActivation`, or null for a suspension with no recorded reason. While a renewal is past due but still has access, `AccessCutoffDate` is the last day it keeps it, the overdue worklist's `GraceThroughDate`, or an approved cutoff deferral's last day when later. `Decision` is unchanged, so callers matching `Suspended` keep working.
