---
'@mj-biz-apps/orders-entities': minor
---

`OrderLine.ExtendedAmount` (nullable): the amount the price rule set for the line before discount, so a Flat price that does not divide by the quantity can be read back exactly (#579). Collected migration with its CodeGen output; the code that writes and reads it ships separately.
