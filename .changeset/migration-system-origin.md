---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Orders loaded from a previous system can be created with Origin `Migration` again. Since the Origin guard, only checkout and provider-payment orders could carry a non-Direct Origin, so the Business Central history import was refused on every order. `Migration` is now one of the system origins: an import running in the server process sets it through the newly exported `SetSystemOrderOrigin`, and a migrated order is exempt from order review, like checkout and provider-payment orders, because it records an invoice the previous system already raised. Origin still cannot be set to `Migration` through the API.
