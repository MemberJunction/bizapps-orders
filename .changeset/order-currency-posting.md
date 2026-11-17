---
'@mj-biz-apps/orders-core-entities-server': patch
---

Journal entries for an order in another currency post at the order's booking rate: each line in functional currency, with the order-currency amount, code and rate kept on it. Covers booking and recognition, credit memos, progress catch-ups, instalment invoices, term moves and extensions and amount changes. Reversals take the currency and rate of the order they reverse.
