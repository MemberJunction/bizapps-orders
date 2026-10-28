---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

`Orders.CapturePayment` no longer reports a read it could not complete as a record that does not
exist (#967). It read the orders it allocates to without checking whether the read succeeded, so a
read that timed out waiting on another transaction's lock, or lost its connection, refused the
capture with `OrderNotFound` ("Order … does not exist."). The checkout classes `OrderNotFound` as
terminal, so the webhook stopped asking Stripe to retry and a charged buyer was left with no payment
booked.

- A failed read of the orders is now `OrderReadFailed`, carrying the read's error. Before refusing
  with `OrderNotFound`, the capture re-reads the ids its first read did not return, once and past the
  cache, so an order another transaction committed in between is found.
- A tender the orders engine does not hold is checked against the `Payment Types` table before
  `UnknownTender`; a failed read there is `TenderReadFailed`.
- A failed read-back of the payment just written is `PaymentReadFailed`, and a capture that cannot
  read its payment back now rolls it back rather than committing a payment it reports as failed.

None of the three new codes is in `TERMINAL_CAPTURE_BLOCKER_CODES`, so the checkout page, the
webhook (which returns 500 so Stripe retries) and operator replay treat them as transient. A read that
succeeds and finds nothing keeps its terminal code. A new check, `capture-payment.CP13-OT`, holds the
order under another connection's open transaction while a capture runs, and asserts the capture is
retryable and that the retry books once the transaction ends.
