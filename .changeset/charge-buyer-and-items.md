---
'@mj-biz-apps/orders-core-entities-server': patch
---

Payment drivers report a charge's buyer (e-mail and name) and, through `ListChargeItems`, the gateway prices its hosted checkout or payment link sold. Stripe reads them from the charge's billing details and the Checkout Session on its intent. Used to choose the product and buyer of an order created from a charge that matched nothing (#481).
