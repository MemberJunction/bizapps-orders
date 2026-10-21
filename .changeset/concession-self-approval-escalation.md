---
"@mj-biz-apps/orders-core-entities-server": minor
---

Add the `ConcessionSelfApprovalEscalation` Orders setting (bc-aidp-next-golive#320): when set, a concession requested by a holder of its ConcessionLimit rule's role is no longer approved by that requester. It is Pending for the next approver up the setting names — `CompanyCFO` (the order company's `ApprovalCFOUserID`) or an MJ role name, tried in order — the approval task is assigned to them, and only they can decide it. The requester is never assigned, and when no target names anyone else the concession is refused. Empty (the default) keeps the previous behavior.
