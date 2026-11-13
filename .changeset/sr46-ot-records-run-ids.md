---
"@mj-biz-apps/orders-integration-tests": patch
---

`subscription-renewal.SR46-OT` now deletes what it committed when its setup fails part-way (#950
review). Setup used to hand the check its IDs only after every row was written, so a throw part-way
left `PurgeCheckoutRun` an empty run and the rows stayed on ORD-WORLD. `renewWithCard` and
`soldThroughCheckout` now record each ID in the check's run as soon as the row exists. A new unit
test fails SR46-OT's setup at the wallet and checks the purge is still given the order, subscription
and provider.
