---
'@mj-biz-apps/orders-ng': patch
---

The public checkout now sends the `PASSWORD` state in `checkout-state-change` while the account step's password form shows after a sale, including on a reload that returns to the form, and `SUCCESS` once the password is set or skipped. A `checkout-reset-refused` sent while the form shows reports `PASSWORD`. The docs' events table lists the state (#396).
