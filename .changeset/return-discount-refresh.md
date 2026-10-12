---
'@mj-biz-apps/orders-core-entities-server': patch
---

A draft return line's allocated `DiscountAmount` is recomputed from the origin on each save until the order's money is locked, so a draft whose quantity changes carries the new quantity's share (#668). A return of 4 units of a line sold 4 × 100 less a 50 order-level discount, cut to 2 units before confirming, now carries 25 and refunds −175.00 instead of keeping 50 and refunding −150.00. A discount the caller set is kept: in the same save it is left as stated, and from an earlier save it is recognized by not matching, within a cent, the share the line's previous quantity inherited.
