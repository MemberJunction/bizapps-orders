---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

A new payment can be captured from the Payments screen again. Receiving Company is filled from the allocated orders when they all belong to one company; when they span companies, capture is refused until one is chosen, with a message saying so. The payment detail now takes its company and tender from the header at every save (`PaymentHeaderEntity.SyncPaymentDetailFromHeader`), so a reference typed before the company was set no longer fails the save. A refused capture puts the previous status back (`PaymentHeaderEntity.SaveStatus`) instead of reading Captured with nothing saved. Wire and Internal Transfer show a reference field instead of the check panel, ACH shows its bank fields instead of the card panel, and an over-applied order shows its negative balance and the credit it creates instead of $0.00.
