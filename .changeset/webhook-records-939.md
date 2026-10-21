---
"@mj-biz-apps/orders-core-entities-server": patch
---

The webhook's own records survive the page finishing the same purchase (#939). When the
`payment_intent.succeeded` webhook and the page's completion ran in the same second, the webhook's
`ProviderEventID` stamp on the intent was put back to null by the page, and its
`PaymentWebhookDelivery` row was never committed, so a redelivery of the event would not have been
recognised as a duplicate. The page now re-reads the intent after each gateway call before it writes
(and leaves it alone when the webhook already recorded the same status), and the delivery row is
written on its own provider (`WithIsolatedProvider`, #927); a row that cannot be written now logs why.
