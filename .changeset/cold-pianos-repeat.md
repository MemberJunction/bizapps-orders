---
'@mj-biz-apps/orders-ng': patch
---

Format Balance as currency on every Orders grid the app hosts.

The grid renders a money column as currency only when the column declares
`format: { type: 'currency' }` or its field name matches the core name heuristic
(`amount`/`price`/`cost`/`total`). `TotalGross` matches that heuristic and `Balance` does not, so
grids with no column state of their own — All Orders, and the dashboard's Active Orders, Orders
Explorer and Overdue Collections panes — showed Total with a dollar sign and Balance as a raw
number, as did Overdue one-time orders, the customer A/R open-items list and the account-credit
picker. All seven now share `MJO_ORDER_HEADER_GRID_STATE`, which declares the currency format for
both columns, so the formatting no longer depends on the field's name.

Binding that state also changes the column set on those grids, deliberately. They previously rendered the entity's
`DefaultInView` fields; they now render the eight columns of the "Orders: Working" saved view, so
Payment Status and Bill To Person no longer appear and a positive balance is highlighted amber.
