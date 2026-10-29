---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

The payment poll now reverses a Bill.com payment it already captured when Bill.com reports it void, cancelled or escheated (golive #386). Before, the poll flagged the row `ReversalNeeded` and changed nothing: the payment stayed captured, the order read paid, and the exception row had no action on it.

- `DecideExternalPayment` answers a new action, `Reverse`, for a captured, re-applied or already-flagged Bill.com payment whose status classes `Reversed`. Refunds and disputes still answer `ReversalNeeded`, and HubSpot's reversed statuses (which include `REFUNDED`) stay manual: the vocabulary's new `ReversesAutomatically` flag is set for Bill.com only.
- The poller writes the reversal through `PaymentReversalFactory` as a bank return (`ReversalSource = 'BankReturn'`), with its un-apply lines in one transaction, dated today. The `ExternalPayment` row is recorded `Ignored`, "Reversed as PAY-… on …".
- A bank-return reversal already pointing at the payment is the idempotency guard, so a second pass, or a pass after a crash before the row was updated, reverses nothing. An amount already refunded is not reversed again. A preview reverses nothing. A failed reversal rolls back and leaves the row `ReversalNeeded` with the error.
