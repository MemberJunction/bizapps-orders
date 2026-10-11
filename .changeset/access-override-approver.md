---
"@mj-biz-apps/orders-core-entities-server": minor
---

Access override approvals are assigned and guarded (bizapps-orders#360). A `WaivePaymentHold` or `DeferCutoff` request's approval task goes to the order company's `ApprovalCFOUserID`, or, when that user is the requester, to the role named by the new `AccessOverrideFallbackApproverRole` setting; a request nobody could approve is refused. Only an assignee may decide, never the requester, and an approval after the override's last day is refused. Account Director and Finance may request either override.
