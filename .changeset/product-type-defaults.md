---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

A product now takes its product type's defaults when the type is chosen: revenue recognition type, subscription type and taxability (taxability resolves through the category chain first, then the type). Values the user sets are kept; a type switch replaces only values the previous type supplied. New products that reach save without them get the same defaults. The product header's type and rev-rec now follow edits instead of showing the values from when the form opened.
