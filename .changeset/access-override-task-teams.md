---
'@mj-biz-apps/orders-core-entities-server': minor
---

The **Access Override Approval** task type (`ORDERS_ACCESS_OVERRIDE`) is flagged `IsApproval`, so the Tasks approvals inbox lists access override approvals, and its `OnAssignActionID` is the tasks app's **Post Task Assignment to Teams** action (bizapps-orders#360). Each assignment is posted to the Teams channel whose webhook is held in a `Teams Channel Webhook` credential named `ORDERS_ACCESS_OVERRIDE`; point it at the same channel as `ORDERS_CONCESSION_APPROVAL` to post both kinds together. Until that credential exists in an environment, the post fails and is logged; the assignment itself is unaffected. Requires the same bizapps-tasks release as the Concession Approval type.
