---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

The anonymous checkout takes a promotion code when the widget sets `allowCoupons: true`. The widget shows a promo-code field with Apply; `/draft` accepts `promotionCodes` (at most one, trimmed, up to 60 characters; refused when the widget doesn't take codes), prices it through the promotion engine and returns `AppliedPromotionCodes`, `UnusablePromotionCodes` (with the engine's reason) and `Discount`. An unusable code is priced without and not kept. The applied code rides the session snapshot, so `/complete` prices and books the order with the same code — the engine writes the adjustment and counts the redemption, and the total still equals the amount paid. If the server's total differs from what the buyer was shown, the first Pay press stops and shows the new total. Promotions on renewal orders are not in this release.
