---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

Confirming a saved draft that carries a promotion code records the promotion once. The code rides the order, so the confirm re-decides it, and it used to write a second set of adjustment rows beside the draft's. A save that re-decides a saved order's promotions now removes the earlier promotion rows for those lines first and keeps each line's manual discount. A requested manual discount is consumed by the save that applies it, so saving the same order object again no longer grants it twice, and a single-use code a draft already took is no longer counted against the same order at confirm.
