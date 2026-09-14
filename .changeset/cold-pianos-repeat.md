---
'@mj-biz-apps/orders-ng': patch
---

Format Balance as currency on every Orders grid the app hosts.

The grid renders a money column as currency only when the column declares
`format: { type: 'currency' }` or its field name matches the core name heuristic
(`amount`/`price`/`cost`/`total`). `TotalGross` matches that heuristic and `Balance` does not, so
grids with no column state of their own — All Orders, and the dashboard's Active Orders, Orders
Explorer and Overdue Collections panes — showed Total with a dollar sign and Balance as a raw
number. Those grids now share `MJO_ORDER_HEADER_GRID_STATE`, which declares the currency format for
both columns, so the formatting no longer depends on the field's name.
