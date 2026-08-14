---
"@mj-biz-apps/orders-core-entities-server": patch
---

GL account resolution now walks product → category → product type → company, and
ORD-WORLD seeds the accounts, dimensions, and company-level AR links a confirm needs.

Booking also force-refreshes the accounting engine so MJAPI sees links written by
ORD-00 in another process, instead of reporting "No GL account is linked for role
Accounts Receivable" against a company that already has the link.
