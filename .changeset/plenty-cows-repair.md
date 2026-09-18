---
'@mj-biz-apps/orders-ng': patch
---

Let the Product form edit Name, SKU and Description again.

The Product hero header registers `replacesSectionKey: 'productIdentification'`, which tells MJ's
form chrome to hide the generated section outright — no rail item, no entry in Manage Sections, no
way back through the section search or the layout toggles. That section is the only place Name, SKU
and Description render, and the hero showed them read-only: Name as an `<h1>`, SKU as a chip,
Description nowhere at all. Name is required, so no product could be created and none could be
renamed; the rail's error badge counted errors in a panel nobody could open.

The hero now renders those three fields as real inputs when the form is in edit mode, and shows the
description when it is not — the same contract the Common People and Organizations identity headers
already honor. Claiming a generated section means owning its fields, so a test now asserts that the
header renders every field of the section it claims.
