---
"@mj-biz-apps/orders-core-entities-server": patch
---

Bill.com payment poll: the refresh after a capture now fetches each invoice row by its own BILL invoice ref, so a payment that covers several invoices no longer writes one invoice's status and due amount onto another's row.
