---
"@mj-biz-apps/orders-ng": patch
---

The order's Accounting tab now has an Export button on both the Rolled up and By line views, alongside the one the Charges and Payment grids already carry, so Finance can tie an order's entries out to Business Central in Excel instead of reading them off the screen one at a time.

By line exports one row per GL line, carrying the entry number, entry type, description, company, effective and posting dates, batch and batch status, account code and name, debit, credit, and a column for every dimension in play. That is a longer sheet than the By line table shows, which sums an entry's lines into a single row: the account and the dimensions only exist per line, so they cannot be reported at the entry's grain. Rolled up exports the cards as displayed.

Both sheets obey the As-of date and the date basis exactly as the screen does, and a dimension a line does not carry is written as an empty cell rather than omitted, so no row's values slide into another row's column.
