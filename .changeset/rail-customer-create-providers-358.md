---
"@mj-biz-apps/orders-core-entities-server": minor
---

Add the Orders setting `RailCustomerCreateProviders` (golive #358): comma-separated Payment Provider IDs whose invoice sends may create a customer on the rail when the bill-to party has no External Customers mapping for that provider. Any other provider now refuses such a send, and its preview, as `RAIL_REFUSED` with a message naming the party, the company and what finance does next, and Bill.com is never written to. Empty (the default) refuses for every provider. A party with a mapping is sent as before.
