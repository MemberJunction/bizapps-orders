---
'@mj-biz-apps/orders-core-entities-server': patch
---

A gift card spent as a tender now debits the issuing company's Gift Card Liability (Deferred Revenue when none is linked, with a warning) instead of Cash. Credit AR is unchanged and a refund mirrors it. Account credit and every other tender book exactly as before. Closes #300.
