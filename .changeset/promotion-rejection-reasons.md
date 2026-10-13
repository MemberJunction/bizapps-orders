---
'@mj-biz-apps/orders-entities': patch
---

A typed promotion code that applied nowhere is reported in `UnusablePromotionCodes` with the reason, whatever stopped it (#686). Only redemption limits were reported before.

- Below the promotion's minimum order amount or minimum quantity.
- Beaten by a better promotion, or blocked by the company's no-stacking policy. The reason names the promotion that applied instead.
- Aimed at nothing on the order (its targets match no line).
- A code that missed on one line and applied on another is not reported. Promotions nobody typed are never reported.
