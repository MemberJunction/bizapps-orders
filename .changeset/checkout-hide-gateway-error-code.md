---
'@mj-biz-apps/orders-ng': patch
---

A declined card or failed bank authentication in the checkout widget now shows the buyer only the gateway's message (e.g. "Your card has been declined."), without the bracketed error code. The code still appears in the widget's console warning for support.
