---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
---

`Orders.SpawnRenewals` carries promotions flagged `AppliesToRenewals` into automatic renewals. It reads the codes recorded on the line that bought the expiring term, presents the flagged ones on the renewal order, and lets the pricing engine decide whether each still applies. Each candidate reports `RenewalPromotionCodes` (carried) and `UnusableRenewalPromotionCodes` (with the reason); the order notes and the `RenewalOrderSpawned` event record the same. A code that no longer applies leaves the renewal at the undiscounted price. Preview runs the same engine without saving.
