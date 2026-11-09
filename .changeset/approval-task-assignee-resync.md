---
'@mj-biz-apps/orders-core-entities-server': patch
---

Open concession approval tasks now follow the approving role's membership (#844). The scheduled outbound pass, every 15 minutes, re-computes each open task's approvers while its concession is Pending: a user given the role since the task was raised is assigned and notified, and a person no longer among the approvers is unassigned. Each change is noted on the task.
