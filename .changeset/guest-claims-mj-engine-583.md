---
'@mj-biz-apps/orders-core-entities-server': patch
---

Checkout mints GuestOrder claims through MJ's `IdentityClaimEngineServer` (`@memberjunction/core-entities-server`), with claim e-mails off until a template and the portal base URL are configured. The claim drivers register against MJ's `BaseIdentityClaimDriver` (`@memberjunction/core-entities`); the local stand-in is removed. Redeeming a GuestOrder claim now finds the order's entitlement grants through `OrderHeaderID` (it filtered on a column the view does not have), and reports a failure when they cannot be read instead of skipping them (#583 items 7, 8).
