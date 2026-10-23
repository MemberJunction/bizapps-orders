---
"@mj-biz-apps/orders-core-entities-server": patch
---

The webhook's own records are much less likely to be lost when the page finishes the same purchase
(#939). When the `payment_intent.succeeded` webhook and the page's completion ran in the same second,
the page could put the webhook's `ProviderEventID` stamp on the intent back to null, and the
`PaymentWebhookDelivery` row could be rolled back with another request's work, so a redelivery of the
event would not have been recognised as a duplicate. The page now re-reads the intent after each
gateway call before it writes (and leaves it alone when the webhook already recorded the same status),
which narrows the window to milliseconds without closing it (#943). The delivery row is written on its
own provider (`WithIsolatedProvider`, #927), and a row that cannot be written now logs why, including
the retry's reason.
