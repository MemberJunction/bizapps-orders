---
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Bug sweep across checkout, payments, order entry, accounting, the Bill.com rail, access overrides and tooling. Adds four migrations (one open checkout session per widget and client key, a foreign key from OrderHeader.ApprovalTaskID to Tasks, an immutability guard on InstalmentLineBilling, and DiscountAmount/ChargeAmount in the confirmed-line freeze) and metadata changes (webhook delivery view filter, entity-permission pull filter, progress observation field descriptions, a revenue recognition type description).
