---
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-ng": patch
---

Hosted checkout page no longer stretches checkboxes to full width: the page's field rule skips checkboxes and radios, and the checkout widget sizes its own checkboxes and keeps their labels at normal weight, so the auto-renew consent and choice lists lay out correctly on any host page.
