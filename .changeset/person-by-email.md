---
'@mj-biz-apps/orders-core-entities-server': patch
---

One rule for which Person an e-mail address means, shared by the checkout and the entitlement reads. When several Persons carry the same address, the checkout used to take whichever row came back first, and `Orders.CheckEntitlement` / `ListPersonEntitlements` answered no grant. Both now use `ResolvePersonByEmail`: the Person that already has Orders activity (an order billed to them, a subscription or grant for them), then the oldest, then the lowest ID. A returning buyer stays on one Person, and an entitlement check by e-mail answers for the Person the purchase went to.
