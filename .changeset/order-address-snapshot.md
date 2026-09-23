---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Keep each order's customer address as it was at the time of sale.

Confirming an order now copies its bill-to and ship-to addresses, and each line's own ship-to, onto
the order as JSON (`OrderHeader.BillToAddressSnapshot`, `ShipToAddressSnapshot`,
`OrderLine.ShipToAddressSnapshot`). The invoice, the order form and the order document read the
snapshot on a confirmed order, so editing a customer's address no longer moves their earlier sales.

Once an order is confirmed its address references and snapshots cannot change: the entity refuses
the edit, and triggers 51015 (header) and 51016 (line) refuse it at the database. Draft and Quoted
orders keep following the live address.
