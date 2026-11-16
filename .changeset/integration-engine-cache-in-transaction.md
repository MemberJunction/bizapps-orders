---
"@mj-biz-apps/orders-integration-tests": patch
---

The integration fixture lets engine caches follow a save made inside a check's rolled-back transaction (#1053). Since the MJ 6.2 line, `BaseEngine` holds its cache change until the enclosing transaction commits, so a check that set a price, promotion, tax rule or intercompany pair and then confirmed an order was judged against the committed row. 147 of the 151 checks that failed on a fresh database pass again.
