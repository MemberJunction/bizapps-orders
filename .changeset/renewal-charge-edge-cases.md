---
'@mj-biz-apps/orders-core-entities-server': patch
---

The renewal charge pass books money the gateway took but no payment recorded on any day, including after the last retry day and when automatic renewal was turned off or the card deactivated; such an order is only captured, never charged again. The update-card link is sent only once the failed charge's `PaymentFailed` event is saved, so a rerun on the same day cannot send it twice; when the event cannot be saved the order is reported as a failure and the link waits for the pass that records it.
