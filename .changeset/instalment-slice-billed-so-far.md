---
"@mj-biz-apps/orders-core-entities-server": patch
---

An instalment invoice on a multi-line order bills each line what it has left after an amount change or a return lowered one of them (#681). Each invoice records what it billed per line and part, and later invoices take that as billed instead of slicing the invoiced instalments again against the lowered lines. Instalments invoiced before the record existed are rebuilt against the lines as booked. A return's reduction is measured against the same figures.
