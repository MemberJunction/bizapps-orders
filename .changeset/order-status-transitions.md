---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
---

Enforce the order lifecycle: guard illegal status transitions in `OrderEntityServer.Save`

`CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
`Fulfilled → Draft` saved. `Voided → Confirmed` saved — a voided order could come back to life,
keep the journal entries its reversal had already unwound, and be shipped, with every row valid and
the constraint satisfied.

New `OrderStatusBehavior` owns the transition table and the predicates six modules previously spelled
out as ad-hoc string sets that had drifted apart (one of them guarded against `Cancelled`/`Canceled`,
which are not legal order statuses at all). The guard runs in `Save`, the one path every write goes
through, and refuses with a reason rather than a bare `false`.
