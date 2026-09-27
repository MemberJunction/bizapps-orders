---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

A cleared Bill To Person stays cleared. The server save no longer copies the ship-to person back into a bill-to the user emptied, and clearing or replacing a person takes the ship-to person and employer organizations that were filled in from them along with it. Values the user set are kept.
