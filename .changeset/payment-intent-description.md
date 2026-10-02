---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
---

Payment intents carry a description, so a gateway dashboard shows what a charge was for: the first line's product, "+N more" for further lines, and the order number (#327). `CreateIntentRequest` and `OpenIntentRequest` take an optional `Description`; `OpenPaymentIntent` builds one from the order when a caller passes an `OrderHeaderID` and no description, which covers renewal and back-office charges. Drivers gain `UpdateIntent`, implemented for Stripe. A checkout opens its intent before the order exists, so it describes the products first and sends the order number and `OrderHeaderID` to the gateway once the order is committed. The `Orders.OpenPaymentIntent` action takes a `Description` input.
