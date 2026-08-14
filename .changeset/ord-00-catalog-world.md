---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": patch
---

Commit ORD-WORLD as the shared integration catalog, and seed Product Types as app metadata.

The suite no longer fabricates `IT-ORD-*` companies, people, or products on every bundle. ORD-00
loads a CSV world through BaseEntity (Blue Cypress Press, Harbor House, Orphan Ledger; eight
customer orgs; ~33 people; priced catalog) and later bundles book against it inside rolled-back
transactions. Types (Product Type, Charge Type, Rev Rec, Subscription, Payment) are looked up from
`metadata/`, never created by the fixture. Fast Entry hides leftover `IT-ORD-*` rows so they cannot
show up as unpriced picks.
