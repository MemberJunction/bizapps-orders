---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

No one approves their own refund (bc-aidp-next-golive#355). While the RefundApprovalThreshold setting is set, a refund is requested on its payment with an amount and a reason, approved through a Tasks approval by someone other than the requester, then issued by the requester for exactly the approved amount. New RefundRequest table, the Orders.RequestRefund, Orders.RecordRefundRequestDecision and Orders.WithdrawRefundRequest operations, the ORDERS_REFUND_APPROVAL task type with its hook action, and a Refund Requests panel on the payment form. Orders.RefundPayment now refuses without an approved request instead of letting the person issuing a refund approve it.
