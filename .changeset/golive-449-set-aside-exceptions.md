---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The payment exceptions tab can set one or many Held, Unmatched or Refused payments aside with a required reason, and filter by payment date. A set-aside of several rows leaves out Unmatched payments not dated before the chosen day, and the External Payment entity refuses setting aside a row with cash recorded or without a reason. The tab now shows each row's reason, which it left blank before.
