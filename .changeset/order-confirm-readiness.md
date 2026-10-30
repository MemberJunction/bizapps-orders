---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

The order form now lists, under "Before this can be confirmed", each concession that still needs approval before confirm will go through: a concession awaiting a decision, or a line priced or discounted below catalog with no approved concession behind it. Confirm stays off until the list is empty. Before, Confirm looked available and the server then refused it. The list comes from a new read-only remote operation, `Orders.ConfirmReadiness`, which runs the same check confirm runs.
