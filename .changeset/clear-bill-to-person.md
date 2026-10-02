---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A cleared Bill To Person stays cleared. The server save fills party defaults only from what changed in that save, and never copies the ship-to person into an empty bill-to, so a cleared party field is not refilled by that save or a later one. Clearing or replacing a person takes the ship-to person and employer organizations that were filled in from them along with it, and a replacement person brings their own ship-to copy. Values the user set are kept. The order form no longer shows the name of a party that was cleared.
