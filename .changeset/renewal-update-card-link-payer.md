---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
---

The update-card link follows the person who owns the declined renewal card. On a gift, where the renewal order bills the beneficiary, the e-mail, the checkout session, the payment and the new card are now the buyer's; the old card's gateway customer is reused only when it belongs to the payer, so a card never joins another person's customer. The renewal order's bill-to is unchanged. The link is also refused, on opening and before the payment opens, unless the subscription is Active with automatic renewal on, so a cancelled subscription's open renewal can no longer be paid through it.
