---
"@mj-biz-apps/orders-core-entities-server": minor
---

Accounting is told of every approved concession (golive #268). A Price, Scope, Seats or Terms concession reaching Approved, on the requester's authority or by decision, raises an acknowledgment task in the same transaction, assigned to the `AmendmentAcknowledgmentRole` holders other than the requester and linked to the concession and its order. With the setting empty no task is raised; with it set, a task that cannot be raised refuses the approval. Withdrawing a concession cancels its task. Term extensions keep their own task. New export: `RaiseConcessionAcknowledgment`.
