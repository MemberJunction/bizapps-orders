---
'@mj-biz-apps/orders-entities': minor
---

Migration: payment schedule rows move to the order's company. On an order with no issued instalment and no payment line or external invoice naming one of its rows, the Scheduled rows that share a due date become one row for the order's company, for their combined amount, numbered after any cancelled row that company already holds. Orders with an issued instalment keep their rows and finish on them. The ledger is untouched; the schedule rollup recalculates AmountPaid and Balance.
