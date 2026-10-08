---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

Confirming a saved draft with taxed lines books balanced entries. Each pricing save re-resolves tax, and the confirm used to add its tax charge rows beside the draft's, so booking credited the tax twice and refused the entry as unbalanced. A save of an unbooked order now removes the earlier tax rows for the lines it re-priced before writing the new ones, and a line re-priced to no tax has its `LineTax` cleared.
