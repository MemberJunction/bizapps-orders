---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

Share the order-line price picker. The rules behind it (`IsLinePriceOverridden`, `NamedPricesBesideDefault`, `RestoreLineDefault`, `PinLineToNamedPrice`, `PinLineToAmount` and the override-reason helpers) move to `@mj-biz-apps/orders-entities`, and the control becomes `<mjo-line-price-picker>` in `@mj-biz-apps/orders-ng`, with an `AllowCustomAmount` input for screens that offer named prices only. The order lines editor uses it with no change in behaviour, except that a line already on a typed amount now shows a disabled "Custom amount" row to a user who may not type one, instead of reading "Default".
