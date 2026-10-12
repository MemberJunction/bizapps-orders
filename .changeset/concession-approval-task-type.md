---
'@mj-biz-apps/orders-core-entities-server': minor
---

Concession approval tasks now use their own task type, **Concession Approval** (`ORDERS_CONCESSION_APPROVAL`), shipped in `metadata/task-types/`, instead of the tasks app's generic Approval Request.

- The type is flagged `IsApproval`, so the Tasks approvals inbox lists its tasks.
- Its `OnAssignActionID` is the tasks app's **Post Task Assignment to Teams** action. Each concession approval assignment is posted to the Teams channel whose webhook is held in a `Teams Channel Webhook` credential named `ORDERS_CONCESSION_APPROVAL`. Until that credential exists in an environment, the post fails and is logged; the assignment itself is unaffected.
- Requires a bizapps-tasks release with `TaskType.IsApproval` and the Teams action. Existing approval tasks raised under Approval Request keep that type.
