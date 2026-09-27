---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
---

Route Pending concession approvals through the tasks app.

A Pending concession held the order's confirm and document send, and nothing told an approver it was
waiting.

- Recording a Pending concession raises an `APPROVAL_REQUEST` task in the tasks app, one per order.
  The task links the order and each Pending concession on it, and it is assigned to every active
  user who holds the `ConcessionLimit` rule's role. `OrderHeader.ApprovalTaskID` points at it. A new
  Pending concession joins the order's open task; once that task has closed, the next one opens a
  new task.
- Recording a Pending concession is refused when the tasks app is not installed, or when no active
  user holds the rule's role.
- A terminal decision recorded on the task approves or rejects every Pending concession it links,
  as the user who recorded it, with the decision's note. The concession's own role check still
  applies. A concession that refuses stays Pending, and the refusal is logged.
- Withdrawing a Pending concession removes its link. Withdrawing or deciding the last Pending
  concession on the order closes the task: Completed if any linked concession was approved,
  Cancelled otherwise.
- `@mj-biz-apps/tasks-entities` is now a runtime dependency of
  `@mj-biz-apps/orders-core-entities-server`.
