---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

A renewal card's first failed charge (a decline, or a bank's request that the absent buyer authenticate) now e-mails the subscription's bill-to person a link to pay the renewal with a new card. The e-mail is two new MJ Templates, `Orders: Renewal Payment Link` and `Orders: Renewal Payment Link Subject`, sent through the `Email` delivery channel.

The link, `<RenewalPaymentLinkBaseUrl>/renew/<token>`, opens the checkout widget that sold the subscription in a pay-renewal mode: it shows the renewal order and the amount due, and pays the open renewal order on-session with no new order and no re-pricing. Paying keeps the new card (same gateway customer, `setup_future_usage`), makes it the subscription's renewal card, and books the payment through the ordinary checkout capture, which restores any access the cutoff suspended.

The token is the renewal order id, the subscription id and an expiry, signed with HMAC-SHA256; it carries no personal data, expires seven days after the access cutoff, and is refused once the renewal is paid. Configure the secret in the `ORDERS_RENEWAL_LINK_SECRET` environment variable (32 characters or more) and the link address in the new `RenewalPaymentLinkBaseUrl` setting; without either, no link is sent.

New: `GET /checkout/renew/:token` on the checkout edge, `renewalToken` on `POST /checkout/initialize`, `CheckoutSessionService.InitializeRenewalPaymentSession`, the `renewal-token` attribute on `<mj-orders-checkout>`, and `ReplaceCardOnSubscriptionIDs` / `OwnerOrganizationID` on `SaveCheckoutInstrumentForRenewals`.
