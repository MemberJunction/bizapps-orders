---
'@mj-biz-apps/orders-integration-tests': patch
---

Ship the `Party Customer Roster` query so orders can say who its customers are.

Foreign-key pickers across the product search the whole party directory with no notion of which
parties anyone actually does business with, because no app has had a way to say. `@mj-biz-apps/common-ng`
now defines a `Party Signals` query category for exactly that: an app ships one query returning
`PartyKind`, `PartyID`, `Count` and `LastActivityAt`, and the shared pickers rank customers first
without Common ever importing an app (MemberJunction/bc-aidp-next-golive#248).

This is orders' contribution. One row per bill-to organization and one per bill-to person over
orders that are not voided, with the count and the latest order date — bill-to is the customer by
definition (D65). SQL Server and PostgreSQL twins, as with the existing party rollups. The
`[signal: order|orders]` marker in the query description is what lets a picker label a row
"4 orders" without knowing what an order is.

Adds a `party-roster` integration bundle asserting the query is registered in the category, carries
the marker, and returns rows that satisfy the contract. Raises the `mj-bizapps-common` floor to
`>=5.45.0`, the release that introduces the category — without it the category lookup does not
resolve on install.

The header-form wiring that consumes this is a separate change.
