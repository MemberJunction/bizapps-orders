---
"@mj-biz-apps/orders-entities": patch
---

Migration `V202609291303` adds `FK_OrderLine_ShipToAddress`, so an Address that an order line names as its ship-to can no longer be deleted, and adds the Addresses → Order Lines entity relationship so a dependency check on an Address finds those lines. `OrderLine.ShipToAddressID` is now documented as relating to Addresses.
