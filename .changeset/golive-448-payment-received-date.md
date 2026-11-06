---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

A payment can be dated the day its money arrived (bc-aidp-next-golive#448). The order's initial payment has an optional "Received on" day (new column `OrderHeader.InitialPaymentReceivedDate`); the payment created at confirm takes it, and the order's date when it is blank. Finance can change a captured payment's date from the payment form or the order's Payment tab: the save moves the payment's journal entries to the same day through accounting's `Accounting.RedatePendingJournalEntries`, and refuses with accounting's message once any of them is batched. Trigger 51005 no longer freezes `PaymentDate`; the new check 51033 refuses a date change once any of the payment's entries is batched or posted. Needs a bizapps-accounting release that has the operation.
