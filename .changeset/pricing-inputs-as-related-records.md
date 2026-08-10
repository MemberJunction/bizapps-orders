---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Promotion codes, charges and manual discounts can reach the engine from a browser again. They were transient arrays only the server could fill, so when `OrderDraft` was deleted the wire went with it: a code or a charge entered on screen was priced into the preview and then silently dropped at confirm, and the customer was billed a number the screen never showed. Charges and adjustments are now related-record collections — a client stages the row it is asking for and the engine completes it — and promotion codes are an `EntityCompanion`, because a code has no child row of its own and only the engine can turn one into an `OrderAdjustment`. Also fixes `ORDER_ENTITY = 'MJ_BizApps_Orders: Orders'`, an entity name that does not exist, used by every new-order and open-order path in the workspace. `MJOOrderEntryService` is now `MJOPricingScheduler` and holds only the debounce and the out-of-order guard; `SaveOrThrow`, `Confirm` and `LoadWithLines` moved onto `OrderHeaderEntity` where a non-Angular host can reach them.
