---
"@mj-biz-apps/orders-ng": patch
---

Add an Export button (Excel or CSV, through MJ's export dialog) to the order's Accounting tab, on both Rolled up and By line. By line exports one row per journal line: entry number, entry type, description, company, effective and posting dates, batch, batch status, account, debit, credit, and one column per dimension. Rolled up exports one row per company, account and dimension set. Both follow the As-of date and the Effective/Posting toggle, so the file holds what the screen shows.

The rollup now matches journal line dimensions to their lines regardless of ID letter case.
