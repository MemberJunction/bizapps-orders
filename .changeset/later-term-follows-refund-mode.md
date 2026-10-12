---
'@mj-biz-apps/orders-core-entities-server': minor
---

Cancelling a subscription whose type does not refund (`CancellationRefundMode` = `NoRefund`) now keeps what was invoiced for a later term, such as a renewal booked and invoiced ahead (#560). The term is still canceled and grants no access, but nothing is reversed and the invoiced amount stays on AR. A later term not invoiced yet is still reversed in full, which withdraws its instalments and credits nothing. A partly invoiced one refuses the cancel, since withdrawing only its remaining instalments is not supported yet. Types that refund are unchanged: a later term is reversed in full. `LaterTermCancellationContext` gains a required `Billing` field, so a host that calls `DecideLaterTermCancellation` itself must pass it. This policy is provisional until it is confirmed on #560.
