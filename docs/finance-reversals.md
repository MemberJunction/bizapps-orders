# Cancelling and reissuing orders: the finance runbook

For finance. How to handle an early termination, a negotiated settlement, a refund and a move of
credit between orders with what Orders has today (bc-aidp-next-golive#454).

## Who does it

Finance. Cancelling a subscription, refunding a payment, moving an account credit and lowering an
agreed amount each need the `MJ.BizApps.Orders.Order.Reverse` authorization, which the Finance role
holds (Developer holds it too, so developers keep every permission). Everyone else sees the Cancel subscription control hidden and the Issue refund and Apply
credit buttons disabled, and the operations refuse them. Records of something the payment gateway
already did (a refund made at Stripe, a subscription Stripe ended) are booked without it.

Returns are not gated. Whoever books orders can still return lines from the Returns page, including
lines of a subscription sale billed by invoice; that books a credit memo and ends access the same way
a cancellation does. This is deliberate: returns stay with order entry, and only the four actions
above are finance's.

Account directors keep creating and winning deals. A reissued order is not a new sale, so finance
creates it directly in Orders, not through a deal: a deal would count it as a win in pipeline and
commission.

## What each step records

Nothing booked is edited. Each step adds a record that undoes or moves money:

| Step | Where | What it records |
|---|---|---|
| Cancel a subscription | The subscription's form, Cancel subscription | A credit memo: a new order that reverses the unearned part of the term (it names the original in `ReversesOrderHeaderID`). Its negative balance is the customer's credit. Access ends as the timing says. |
| Refund a payment | Payments, Refunds | A new payment reversing the original, spread over the orders it paid in the same proportions. It does not end access. |
| Move a credit | Payments, Account Credit | A zero-amount payment: minus on the credit, plus on the target order. Both orders must be Confirmed and belong to the same customer. |
| Reissue | Orders, new order | An ordinary order for what the customer now owes. |

## Early termination

1. Open the subscription and choose Cancel subscription. Pick **Immediate** to end now, or keep the
   type's rule. Give the reason (for example "Early termination agreed 2026-11-05"). Preview, check
   the coverage end and the credit, then confirm.
2. If the customer owes a termination fee, reissue: create an order for the fee and confirm it. Put
   the original order number in its Description.
3. Apply the cancellation's credit to the fee order (Account Credit: the credit memo is the source,
   the fee order the target).
4. What credit is left either stays on account for a later order or is refunded from the payment
   that paid the original (Refunds).

## Negotiated settlement

The customer keeps the service and pays a different amount.

1. Cancel the subscription as above, reason "Settlement", so its unearned part is credited.
2. Reissue: create and confirm an order for the agreed amount and period, with the original order
   number in its Description.
3. Apply the credit memo's credit to the reissued order. The rest is refunded or left on account.

A change of agreed amount on the existing term (`Orders.AmendArrangement` with a new amount) also
exists. It goes through concession approval and has no screen in Orders yet, so use cancel and
reissue unless engineering runs it for you.

## Refund

Refund from the payment (Refunds). Up to what remains refundable; the processing fee stays with the
processor. When the `RefundApprovalThreshold` setting is set, refunds above it also need the
receiving company's Approval CFO. A refund does not end access: cancel the subscription or return
the lines for that.

## Moving a credit between orders

Use Account Credit: pick the order holding the credit, then the order to pay down, and the amount.
Both orders must be Confirmed and the same customer's. Between two companies, Orders also books the
intercompany entries.

## Not covered yet

- Shortening a booked term without cancelling it (Bizapps-Orders#507).
- Whether a settlement's credit reverses or pays commission. That is a CFO decision.
