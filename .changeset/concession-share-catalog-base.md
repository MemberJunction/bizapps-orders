---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
---

The share-of-order concession limit (`MaxConcessionPctOfContract`) measures an order's concessions against the order at its catalog prices, before any discount, instead of against its total after discounts. A 10% discount on every line now reads as 10%, not 11.1%, so a rep with 10% authority can approve it. Recording a concession, deciding it and the confirm gate all use the new `OrderCatalogTotal`; `OrderConcession.OrderNetTotal` still stores the net total (golive #494).
