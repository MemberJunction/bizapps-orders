---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": patch
---

Checkout: the Stripe publishable key the browser gets can come from the server environment. When a widget names a `paymentProviderId` and that provider's `CredentialsRef` resolves to a publishable key (the default secret resolver reads `<CredentialsRef>_PUBLISHABLE_KEY`, beside `<CredentialsRef>_API_KEY`), `/checkout/initialize` hands that key to the browser in place of the widget's `stripePublishableKey`, on both the ordinary and the renewal-payment session, so the host page and the Angular widget load Stripe.js with the same account's key as the server. Without the variable the widget's value is used as before. A key whose test/live mode disagrees with the account's (its API key's mode, else `IsLiveMode`) is logged as a warning by prefix only, and a provider that cannot be read is logged and falls back to the widget's key rather than failing the checkout. New exports: `ResolveCheckoutPublishableKey`, `ChooseCheckoutPublishableKey`, `StripeKeyModeOf`, `ResolvePaymentCredentials`; `PaymentCredentials` gains `PublishableKey`.
