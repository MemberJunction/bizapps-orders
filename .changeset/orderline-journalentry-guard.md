---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291000` restores trigger check 51008: once an order line's `JournalEntryID` is set it cannot be cleared or replaced. Two earlier redefinitions of `trg_OrderLine_ImmutableAfterConfirm` had dropped it.
