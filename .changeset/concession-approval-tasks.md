---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
---

Route Pending concession approvals through the tasks app.

A Pending concession held the order's confirm and document send, and nothing told an approver it was
waiting.

- Recording a Pending concession raises its own `APPROVAL_REQUEST` task in the tasks app, titled
  with the order, the concession and its amount (for example `SO-1042: 25% discount, 3,000.00`).
  The task links the order and that concession. `OrderHeader.ApprovalTaskID` points at the order's
  most recent open approval task.
- The task is assigned to the active holders of the `ConcessionLimit` rule's role, other than the
  requester, through the active `MJ_BizApps_Common: People` record linked to each holder's user:
  the tasks app notifies and lists assignees by person. A holder with no such record is skipped and
  logged.
- Recording a Pending concession is refused when the tasks app is not installed, or when no holder
  of the rule's role other than the requester has a linked person record.
- A terminal decision recorded on the task approves or rejects only that task's concession, as the
  user who recorded it, with the decision's note. The concession's own role check still applies.
  When the concession refuses the decision, it stays Pending, a fresh task is raised for it under
  the same title, the order points at that task, and the reason is recorded on the refused task.
- Withdrawing a Pending concession cancels its task and removes its link. Deciding it on its own
  record completes its task when approved and cancels it when rejected.
- `@mj-biz-apps/tasks-entities` is a required peer dependency of
  `@mj-biz-apps/orders-core-entities-server`, `>=1.4.1 <2.0.0`.
