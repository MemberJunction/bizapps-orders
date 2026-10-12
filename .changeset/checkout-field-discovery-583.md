---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

Checkout field discovery sends a value-list field its values as `options`, so the widget's select has choices; a NOT NULL field with a database default is no longer required; NVARCHAR(MAX) (stored as Length -1) maps to a textarea, and the 255 threshold is read in characters. The `checkout-complete` event carries the applied promotion code as `coupon` (#583 items 9, 10, 11).
