---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-integration-tests": minor
---

A different band of the same subscription offering no longer books a second, overlapping subscription without anyone noticing (golive #276).

Confirm found an existing subscription by product, so a holder with coverage under one band who ordered another band got a new subscription for the same dates, billed and recognized alongside the first.

- `Product.SubscriptionFamily` (new, nullable): a code the bands of one offering share. Set it on the product form's Subscription section.
- `OrderLine.AcknowledgesCoverageOverlap` (new, default false): marks a line that is meant to run alongside existing coverage.
- At confirm, a subscription line whose term overlaps the holder's live coverage under another band of its family follows the type's `ConcurrencyMode`: `AllowMultiple` proceeds, `RejectDuplicate` refuses, and `ExtendExisting` refuses unless the line acknowledges the overlap. The refusal names the subscription and the overlapping dates. Two bands on one order are checked against each other. A subscription cancelled through `Orders.CancelSubscription` no longer counts.
- `Orders.CheckCoverageOverlap` (new, read-only): runs the same check over a saved draft. The order lines editor calls it after each save and shows the result on the line, with the acknowledgment checkbox where it applies.

Products with no family behave as before.
