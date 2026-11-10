---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The product pricing screen hides prices kept for orders created before a past cutover (Applicability `Order.__mj_CreatedAt lt <cutover>`) with the inactive and expired ones, behind "Show inactive". They show as "Orders before <date>" and are not offered for activation. New `OlderOrdersCutoff` reads the cutover from a row's Applicability.
