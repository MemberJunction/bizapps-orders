---
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-entities": patch
---

Customer A/R and the Orders dashboard now age an order billed in instalments by each instalment's own due date. Before, the whole balance aged on the order's single due date, so one late instalment made the entire balance past due and the date never moved as instalments were paid. The dashboard's Overdue amount is now the money that is late, matching the aging bar, and the overdue count above the orders list uses the next unpaid instalment's date like the list it labels. On Customer A/R the open items show the next due date. Orders with no instalments read as before.
