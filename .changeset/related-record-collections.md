---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": patch
---

Move order lines onto an MJ 6.1 related-record collection, and split the order rules across the two
tiers.

`Lines` is now declared as `EntityRelationship.RelatedRecordCollection` metadata, so CodeGen emits a
typed accessor onto the GENERATED entity class and both tiers have it. That replaces a `_lines`
array with a getter/setter pair that existed only on the server, and it is what lets the browser
compose an order and ship the whole graph in one call.

Adds `OrderHeaderEntity`, a shared client+server subclass holding every rule decidable without the
database — the status-transition guard, the must-have-a-payer rule and the must-have-something-to-book
rule — so the browser refuses those before a round trip and every other caller still gets them.
`OrderStatusBehavior` moved down to the entities package with it (it was pure, with zero imports).

Also fixes a cross-repo break: `AccountingCompanyProfile.DefaultPaymentTermsTypeID` was removed by
bizapps-accounting (their issue #22, on the correct grounds that payment terms are an orders
concern), and orders kept reading it — so every order whose customer had no negotiated terms failed
the company-default step of the due-date walk. The column now lives on `OrderCompanyPolicy`.

`ExpectedGrossTotal` on `Orders.ConfirmOrder` is now enforced. It was accepted and read by nothing.
