---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Limit concessions as a share of the order's net total, in every delivery form (#306).

- `SalesAuthority` gains `MaxConcessionPctOfContract`. Every concession on an order that is not
  Rejected, together, is measured as a share of the order's net total (its lines after discounts,
  before tax and charges, reversal lines left out). At or above the limit, a concession needs
  approval, whatever its delivery form. With the limit set, an order with no net total needs
  approval too.
- Each `OrderConcession` records the `OrderNetTotal` and `CumulativeShare` it was measured against.
- An unconfirmed order whose share has since reached the limit of a concession approved on the
  requester's own authority cannot be confirmed until that concession is withdrawn and recorded
  again. Such a concession can now be withdrawn while its order is not confirmed. An approver who
  decided a concession at that share or higher already covers it.
