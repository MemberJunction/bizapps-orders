---
'@mj-biz-apps/orders-core-entities-server': patch
---

Checkout: when a later draft changes the session's e-mail, the payer Person is resolved again for the new address (or left for completion to resolve or create), so pricing and the order's bill-to and ship-to follow the new e-mail. Booking the settled payment now restamps the payment intent's bill-to person with the order's when an earlier intent still names the previous payer (#393).
