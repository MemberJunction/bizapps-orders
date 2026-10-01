---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291302` merges the confirmed-order guard triggers into one per table. `trg_OrderHeader_ImmutableAfterConfirm` now runs 51014, 51013, 51015 and 51017, and `trg_OrderLine_ImmutableAfterConfirm` runs 51002, 51003, 51016 and 51008. `trg_OrderHeader_AddressFrozenAfterConfirm`, `trg_OrderHeader_ConfirmedByFrozenAfterBooking` and `trg_OrderLine_AddressFrozenAfterConfirm` are dropped. Error numbers and messages are unchanged. When one write breaks two rules, the error returned now follows that order.
