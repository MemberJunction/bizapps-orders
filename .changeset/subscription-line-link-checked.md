---
'@mj-biz-apps/orders-core-entities-server': patch
---

A confirmed subscription line keeps its link to the subscription and its settled service period. Booking saved an older in-memory copy of each line after the link was written, which put both back to their pre-confirm values. A line that cannot be saved with its link now fails the confirm with the refusing rule's message instead of confirming without it (#583 item 20).
