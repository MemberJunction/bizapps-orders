---
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

The order form's access overrides panel offers Approve and Reject only to an assignee of the approval task who is not the requester, and Approve only on or before the override's last day (bizapps-orders#517). Everyone else sees whom the request is waiting on. The decision rule (`AccessOverrideDecisionRefusal`) and the assignee read (`LoadAccessOverrideAssignees`) move to `@mj-biz-apps/orders-entities` so the browser and the server share them.
