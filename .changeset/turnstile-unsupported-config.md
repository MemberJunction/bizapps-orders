---
'@mj-biz-apps/orders-server': patch
---

The checkout edge refuses a widget whose Configuration sets `requireTurnstile` (#583). Neither built-in client sends a Turnstile token, so the setting made every initialize and complete answer 403. The host page and every checkout POST now answer 500 with a message naming the setting, and the server logs it. Turnstile verification stays in the edge for the client change that adds the token.
