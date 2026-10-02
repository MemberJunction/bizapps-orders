---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

A confirmed order's payment terms change only through an approved Terms concession.

`OrderConcession` gains a `Terms` delivery form carrying the prior and new payment terms; its value is the
change in days to payment. It always goes to approval and the requester cannot decide it. Approving it moves
the order's terms and its due date to the order date plus the new terms' days. The order entity and trigger
51018 refuse a direct edit. `Orders.AmendArrangement` takes `OrderHeaderID` and `NewPaymentTermsTypeID` to
preview or record the change. The due date stays correctable without approval.
