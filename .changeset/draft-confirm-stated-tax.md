---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

A tax rate, amount or override stated on a draft is kept when the draft is confirmed. The request lived only in memory, so a confirm from a reloaded draft resolved tax from the ship-to address and replaced the stated rows. The walk now reads a saved order's stated tax charges back as requests, and a restated override keeps its reason and the user who made it. A re-price also removes the order's zero-amount tax rows, which have no allocation to reach them by. Requested charges are consumed once the save commits, so confirming the same order object no longer writes them a second time.
