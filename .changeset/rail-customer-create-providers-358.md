---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": patch
---

Add the Orders setting `RailCustomerCreateProviders` (golive #358): comma-separated Payment Provider IDs for connections where every bill-to party with no External Customers mapping should get a customer created on the rail automatically. Any other provider now refuses such a send, and its preview, as `RAIL_REFUSED` with a message naming the rail and the party and telling Finance to find or create the customer in the rail and add its ID to the party's External Customers mapping; the rail is never written to. A party that also has no billing email is still reported as `NO_CUSTOMER_EMAIL`, with both reasons. The sweep treats the refusal as permanent and does not retry it. The order form's External invoicing panel now shows the `RAIL_REFUSED` preview as a "not ready to send" warning and disables Send, as it already did for a missing email. Empty (the default) refuses for every provider. A party with a mapping is sent as before.
