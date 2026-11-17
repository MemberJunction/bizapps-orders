---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-integration-tests': minor
---

Confirm no longer moves a subscription line to the next term without anyone deciding it. A direct order is refused while a line for a product its subscriber already holds has not chosen between renewing that subscription and "Create new subscription" (checkout and provider-payment orders keep the subscription type's rule). When a line's stated start does move to the next term, confirm refuses the order if its payment schedule still falls due before that term starts, naming the line, both periods and the instalments, instead of invoicing them early. The order line card warns about those instalments as soon as the renew choice is made, testing every moved line against the gross of the lines on screen. `orders-entities` exports `FindInstalmentsBeforeMovedTerms`, `DescribeInstalmentsBeforeMovedTerm`, `ExplainInstalmentsBeforeMovedTerms` and `ExplainUnansweredHeldLines`.
