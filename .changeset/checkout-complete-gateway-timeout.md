---
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-server": patch
---

A paid checkout no longer shows a parser error when `/complete` outlasts the CDN or proxy in front of the server. The checkout element and the fallback host page read only JSON replies; a gateway error page or no reply becomes "Checkout could not reach the server". After payment, a reply like that, or a session still `Processing`, means the server may still be booking the order, so the checkout shows "Payment received. Finishing your order…" and sends `/complete` again every 3 s for up to 2 minutes. `/complete` is replay-safe, so the retry returns the confirmed order. If the wait runs out, the buyer is told the payment went through and not to pay again.
