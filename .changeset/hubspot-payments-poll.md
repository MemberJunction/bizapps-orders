---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
---

The payment poll reads HubSpot Payments (#482). A `HubSpotPayments` provider row per company, pointing at that company's HubSpot portal, makes `Orders.PollExternalPayments` record every payment the portal collects in `ExternalPayment` when it is made, ahead of the payout.

- Payments collected through the company's own Stripe account, or only recorded in HubSpot, are set aside (`Ignored`) so they are not booked twice.
- A succeeded HubSpot-collected payment is `Unmatched`, with its gross, fee, net and buyer, until order matching by deal is possible; processing ones are held.
- Payment statuses are classified per rail (`PaymentStatusVocabularyFor`). A refund or dispute against a captured payment is reported for a person instead of read as already captured. Bill.com's behaviour is unchanged.
- New provider type `HubSpotPayments` in `metadata/payment-provider-types` (driver `HubSpotPaymentsProvider`, which refuses every checkout verb). It reaches hosts with the release's metadata sync.
