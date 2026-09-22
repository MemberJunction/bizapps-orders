---
'@mj-biz-apps/orders-core-entities-server': minor
---

The three rules for reversing a scheduled order (D92 §6), as pure functions on `ContractBalance`.

`InstalmentsToCancel` picks the instalments a reversal withdraws — live and never billed, tested on `DocumentNumber` rather than `Status` so a row the customer holds an invoice for is never quietly removed. `CreditMemoByLine` gives the billed-but-not-earned balance per line, which is what the credit memo reverses; revenue already recognised stays recognised. `RefuseEarnedNotBilled` refuses a reversal that would strand an earned-but-unbilled balance in Unbilled Receivable, naming the lines, the amounts and the due-but-unissued instalment to issue first.
