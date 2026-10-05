---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-integration-tests": minor
---

A different band of the same subscription offering no longer books a second, overlapping subscription without anyone noticing (golive #276).

Confirm found an existing subscription by product, so a holder with coverage under one band who ordered another band got a new subscription for the same dates, billed and recognized alongside the first.

- A product joins a subscription family (the `SubscriptionFamily` table, one per selling company) through `Product.SubscriptionFamilyID`, picked on the product form's Subscription section. A product can only join a family of its own company, and not a family marked inactive; a family's company cannot change once saved.
- At confirm, a subscription line whose term overlaps the holder's coverage under another band of its family, within the product's company, follows the stricter `ConcurrencyMode` of the two bands' types (`RejectDuplicate`, then `ExtendExisting`, then `AllowMultiple`): `AllowMultiple` proceeds, `RejectDuplicate` refuses, and `ExtendExisting` refuses unless the line sets `OrderLine.AcknowledgesCoverageOverlap`. The refusal names the family, the subscription and the overlapping dates, and says to start the band after the existing coverage ends or to mark the line to run alongside it. Two bands on one order are checked against each other.
- A cancelled subscription still counts until its coverage ends: its terms that are not Canceled or Lapsed count in full, and a Canceled term counts through `Subscription.EndDate`.
- `Orders.CheckCoverageOverlap` (new, read-only): runs the same check over a saved draft. The order lines editor calls it after each save and shows the result on the line, with the acknowledgment checkbox ("Run alongside the existing coverage. Both will be billed.") where it applies.

Products with no family behave as before.

An organization-held subscription bought with a contact person is now found again at confirm (#317). The subscription stores that person, and the lookup required it to be empty, so a re-order of the same product booked a second subscription without `ConcurrencyMode` running. Under `Organization`, and under `Holder` when no person was resolved, the lookup now matches the organization whatever person is stored. Under `Holder` when a person was resolved, and for seats under `Individual`, it matches the exact organization and person, so a coworker's purchase at the same organization does not extend another person's subscription. Under `Holder`, when the organization was stated on the line or the order rather than inferred from the person's employer, the lookup also matches that organization's subscription stored with no person, so a re-order naming a contact extends a subscription first bought with none. The same rule applies to the family check above. Among several matches, an Active or Trialing subscription is chosen first, then a Paused one, then a Canceled one, and among equals the one stored for the ordered person, then the newest.

A product created on the server takes its product type's defaults again (golive #277). The server's product class extended the generated class instead of `ProductEntity`, and replaced it, so a product saved there with only a type failed for lack of a revenue recognition type and left the subscription type and taxability empty.
