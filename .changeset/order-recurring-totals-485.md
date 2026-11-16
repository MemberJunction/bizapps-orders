---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

An order now carries its recurring revenue (golive #485). `OrderHeader.RecurringMonthlyTotal` is each subscription line's net amount divided by the months it covers (its service period, or its subscription type's term when it has none), summed over the order; `RecurringAnnualTotal` is twelve times that. One-time lines add nothing. Both are maintained by `spRecalcOrderHeaderTotals` beside `TotalGross`, filled for existing orders by the migration, and read back after every save like the other rollups. Sales copies them onto a deal's MRR and ARR.
