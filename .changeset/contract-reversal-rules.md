---
'@mj-biz-apps/orders-core-entities-server': minor
---

The three rules for reversing a scheduled order (D92 §6), as pure functions on `ContractBalance`.

`InstalmentsToCancel` picks the instalments a reversal withdraws — live and never billed, tested on `DocumentNumber` rather than `Status` so a row the customer holds an invoice for is never quietly removed. `ProratedCreditMemo` gives a reversing line its share of the origin's billed-but-not-earned balance, prorated to the quantity still left, and counts staged releases dated before the reversal as earned; revenue already recognised stays recognised. `RefuseEarnedNotBilled` refuses a reversal that would strand an earned-but-unbilled balance in Unbilled Receivable, naming the lines, the amounts and the due-but-unissued instalment to issue first.

A reversal of an order billed by instalment books that memo or nothing, never the mirrored value entry; mirrors only the recognition releases dated after the reversal; reduces the origin line's `BilledToDate` by the memo; and withdraws unissued instalments only once the whole order is reversed. `Orders.CancelSubscription` refuses a term on an instalment-billed order for now.
