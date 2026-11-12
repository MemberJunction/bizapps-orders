---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-integration-tests": minor
---

A concession is withdrawn by setting its Status to `Withdrawn`, and stays on the order as a record (golive #403). `OrderConcession` gains `WithdrawnByUserID` and `WithdrawnAt`, set exactly when it is Withdrawn; a concession withdrawn after approval keeps its approver and decision date. A Pending concession can be withdrawn, and so can an Approved one while its order is not confirmed and it names no booked term. Its requester may withdraw it without Update permission on Order Concessions, so a role with Create and Read only can replace one; anyone else needs Update. Withdrawing closes the concession's open tasks. A Withdrawn concession counts toward nothing: not the order's concession share, not the confirm gate, not the order's totals. Withdrawn is final. Deleting a concession works as before.
