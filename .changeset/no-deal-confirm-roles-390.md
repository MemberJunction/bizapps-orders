---
"@mj-biz-apps/orders-core-entities-server": patch
---

Add the Orders setting `NoDealConfirmRoles` (golive #390): comma-separated role names whose holders may confirm an order that no deal created. Anyone else's confirm of such an order is refused with a message naming the roles. Checkout, provider-payment, reversal and renewal-only orders are exempt. Empty (the default) switches the check off, and so does a host with no order-to-deal link registered, which logs one warning.
