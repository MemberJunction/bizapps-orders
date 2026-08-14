---
"@mj-biz-apps/orders-entities": patch
---

Stop treating save-populated fields as user errors on a new order.

`Validate()` was refusing every unsaved draft with "Order Number cannot be null"
(and the same for a new line's UnitPrice / CompanyID). Those values are minted
or stamped by `OrderEntityServer.Save()`, so Fast Entry and the editor — both
of which gate Confirm on `Validate()` — disabled the button on a complete order.
A new header also defaults `OrderDate` to today so Fast Entry, which has no date
control, can confirm.
