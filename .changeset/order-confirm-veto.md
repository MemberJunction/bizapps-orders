---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Another app can now refuse an order's confirm, through a seam beside the one that refuses a line edit.

Confirming is where an order stops being a proposal: journal entries are written, a subscription may be created, recognition follows. Orders enforces its own rules — a legal status, a bill-to party, at least one line, a service period where one is needed — but it cannot know that an app upstream has a reason to say "not yet".

The case this exists for (bc-aidp-next-golive#323): Sales closes a deal Won, which mints the order; the deal is then reopened to Open; the order is confirmed from the order screen and books anyway, leaving an Open deal sitting on a booked order. Sales already refuses the reverse.

Nothing registers into this on the day it ships, and it cannot: Sales resolves this package from the registry and cannot call a function that has not been published. `HostOrderConfirmVeto()` returns null until something registers, the check returns early, and no host behaves differently.
