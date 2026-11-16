---
"@mj-biz-apps/orders-core-entities-server": patch
---

Applying an account credit no longer posts through the Cash account. A credit spent on another order moves a receivable and no money, so its entries now sit on Accounts Receivable: within one company's books nothing is posted, and across companies only the receivable and intercompany lines are. Entries that remain are described as "Credit applied" and "Credit spent" instead of "Payment" and "Refund". Cash, gift card and every other tender post as before.
