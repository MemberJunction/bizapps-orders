---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-integration-tests': patch
---

Confirm no longer moves a subscription line to the next term without anyone deciding it. A direct order is refused while a line for a product its subscriber already holds has not chosen "Add as next term" or "New subscription" (checkout and provider-payment orders keep the subscription type's rule). When a line's stated start does move to the next term, confirm refuses the order if its payment schedule still falls due before that term starts, naming the line, both periods and the instalments, instead of invoicing them early. The order line card warns about those instalments as soon as "Add as next term" is chosen. `orders-entities` exports `FindInstalmentsBeforeMovedTerms`, `DescribeInstalmentsBeforeMovedTerm`, `ExplainInstalmentsBeforeMovedTerms` and `ExplainUnansweredHeldLines`.
