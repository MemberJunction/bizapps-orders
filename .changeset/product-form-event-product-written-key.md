---
"@mj-biz-apps/orders-ng": patch
---

A new event product stays on the key it was written under. On MJ 6.1.x, saving a new Product with an Event Products extension writes both rows under a server-minted key while the open form kept the browser's unwritten key, so prices and GL links added before closing the form named a Product that does not exist. After a new product's first save the form now reloads it under the extension's written key, and after any reload the Event & Venue section rebinds to the Event Products record the product will save.
