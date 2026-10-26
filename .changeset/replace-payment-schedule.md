---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-server': minor
---

New remote operation `Orders.ReplacePaymentSchedule` sets an order's payment schedule from a supplied list of rows (due date, amount, description). Instalments already invoiced, paid or written off must appear in the list with the same due date and amount and are kept unchanged; a list that changes or drops one is refused, naming the instalment. The other rows replace the order's Scheduled rows in place, numbered by due date, and must tie to the order's lines by the same check confirm and invoicing use. An order confirmed without a schedule (billed in full) cannot be given one, and a confirmed order billed by its schedule cannot have it removed. An instalment not yet invoiced that a payment names cannot be removed, re-dated or lowered below what is paid on it (`PAID_ROW_CHANGED`). The order's status is re-read under a lock inside the transaction, so a confirm that lands between the read and the write is honoured. All or none, and the same list sent twice writes nothing. Sales calls it to put a deal's schedule on its order at Close Won and when a won deal's schedule changes.
