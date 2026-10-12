---
'@mj-biz-apps/orders-entities': patch
---

An order created by a writer other than the order form (an API call, a GraphQL create, a workflow) now gets the bill-to person copied into an empty ship-to and the person's employer stamped, as the server save's party defaults intend (#657). MemberJunction records the first value set on a new record's field as its old value, so the person field did not count as changed and the defaults were skipped.
