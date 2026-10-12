---
'@mj-biz-apps/orders-entities': patch
---

Promotion redemption limits count orders instead of adjustment rows, and a code a limit stops is reported (#561).

- An order-level promotion writes one adjustment row per line its amount is allocated to, and a line-level one a row per line it discounts. Both counts (the promotion's limit and the per-customer limit) now count each order once, so a two-line order no longer spends two uses.
- A code stopped by its promotion's limit, or by the customer's share of it, is listed in `UnusablePromotionCodes` with the reason, once per code, instead of giving no discount and no reason.
- A promotion code's own `MaxRedemptions` is enforced, counted in orders, and reported the same way. It was read but never checked.
- A promotion that is not running is now reported against the code that named it; with several codes it could be reported against the first one typed.
