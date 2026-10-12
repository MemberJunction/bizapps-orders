---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.CapturePayment` now returns each order effect's `PaymentStatus` (`Unpaid`, `PartiallyPaid` or `Paid`), derived from the order's totals. It was read from a column the order no longer has, so it was always missing. The invoice builder no longer carries the same dead field.
