---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

A hand-entered order with a line at a unit price of 0 can no longer be confirmed. The order form's "Before this can be confirmed" list names the line once and asks for the negotiated price, or the price with a 100% discount to give it away; the confirm save refuses with the same message before anything books. Checkout and payment-created orders, bundle components and return lines are exempt. So is a renewal line the renewal job priced at zero (a product now listed at zero) while its price is unchanged, so a $0 renewal books instead of failing the job on every run; the same line edited to zero by hand is refused. When accounting refuses an order's booking, the message now gives each distinct error once, naming the order lines it applies to, instead of once per draft.
