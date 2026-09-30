---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Approved exceptions to payment-gated access (#268). An `EntitlementAccessOverride` on one order
keeps its grants `Active` past the rule that would suspend them:

- `WaivePaymentHold` lifts the hold on grants awaiting payment (`AwaitingPayment`).
- `DeferCutoff` lifts the renewal cutoff (`PastDue`).

Every override carries a reason and a last day (`EffectiveThrough`), and applies only to the order
it names; a later renewal or a revised order is a different order. `Orders.RequestAccessOverride`
needs the authorization for the override type (`MJ.BizApps.Orders.Access.Override.WaivePaymentHold`
or `.DeferCutoff`, or their parent). No role holds them yet. The request raises an
`ORDERS_ACCESS_OVERRIDE` approval task, unassigned: who approves is #360.

An override takes effect only once approved, through `Orders.RecordAccessOverrideDecision` or by
closing the task in the Tasks inbox. An approval re-decides the order's grants at once. The payment
path and the nightly pass honour an approved override through its last day. After that day, the
nightly pass re-decides the grants without the override and marks it `Expired`.

The order form gains an Access Overrides section listing the order's overrides, with a request form
and approve / reject on open requests.

`@mj-biz-apps/orders-core-entities-server` now peers on `@mj-biz-apps/tasks-core`.
