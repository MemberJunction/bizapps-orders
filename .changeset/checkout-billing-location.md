---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-ng": patch
---

Self-serve checkout collects the buyer's billing location and refuses payment without it, and payment
intents refuse any currency but USD.

- The checkout widget asks for billing country, state or province (US, CA and AU) and postal code, from
  ISO 3166 lists. `CheckBillingLocation` and the lists are exported from `orders-entities`.
- `CheckoutSessionService.UpdateDraft` takes the location as a new argument before `contextUser`,
  prices tax from it, and returns the tax in `Tax`. A draft, payment intent or completion without a
  valid location is refused.
- `CompleteCheckout` records the location as a Common `Address`, links it to the buyer as their Billing
  address, and sets it as the order's bill-to and ship-to address.
- `OpenPaymentIntent` refuses a currency other than USD (`SUPPORTED_PAYMENT_CURRENCY`), since orders do
  not record a currency. A widget with no configured currency opens in USD.
- `OrderPricingContext.ShipToAddress` lets a caller price tax for a location that has no Address row yet.
