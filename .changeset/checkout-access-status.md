---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

The public checkout's success screen says whether the buyer's access is ready. `POST /checkout/access-status` reduces the order's outbound deliveries from consumers that declare `GatesAccess` to `Ready`, `Pending`, `Failed` or `NotTracked`; the success screen polls it for up to a minute, in a rate-limit window of its own so polling cannot use up the buyer's allowance for the password step, shows copy the widget can override in `accessMessages`, dispatches `checkout-access-state`, and follows `redirectUrl` once the state settles. With no gating consumer nothing changes.
