---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Public checkout can apply a verified-member discount. A host sets `member-token` on `<mj-orders-checkout>`; `/draft` passes it to the `BaseCheckoutMemberDiscountResolver` the widget names in `Configuration.memberDiscountResolver`, which returns a promotion code priced through the promotion engine. The session keeps the code, never the token, and `/complete` re-prices and books with it. A rejected token prices at the standard rate with a message; a token sent to a widget that cannot verify one is refused. The checkout total now includes line discounts, which it previously omitted. It also now includes tax and charges, so a taxable product sold through the public checkout charges tax at checkout; before, the charge left tax out while the order still booked it. If a settled payment no longer covers the re-priced total at `/complete` (for example, the member promotion ended after the draft), no order is booked, the buyer gets a plain message, and a checkout alert is raised so staff can refund.
