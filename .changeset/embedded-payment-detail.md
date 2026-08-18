---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

PaymentDetail is an owner-held 1:1 embed on the wallet, payment header, and order intent FK. Booking and capture skip related collections so the detail persists with the header.
