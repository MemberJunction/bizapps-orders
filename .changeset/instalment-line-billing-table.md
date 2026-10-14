---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

New entity `Instalment Line Billings` (#681): what each instalment invoice billed each order line, part by part (the net, the tax and charges no charge allocation covers, and each allocated charge type). Written by the server when an instalment is invoiced, so later invoices can take earlier ones as billed instead of slicing them again against lines an amount change or a return has lowered.
