---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

Review fixes. An order created automatically from an unmatched charge books the units the checkout bought, at the charge divided by them; a charge that does not divide into a unit price at the line's four decimals, or a checkout line with a quantity that is not a whole number, is left to finance. Applying an amount change on an order billed as a whole plans against the balance before its own credit memo, so the refund or credit it reports matches the preview (integration check AC11). A return against an instalment-billed order renders a document that asks for the credit memo only, with the part taken off the origin's uninvoiced instalments shown on its own row. A reconciliation run that creates an order for a charge clears the exception an earlier run raised for it. HubSpot payments, which are recorded Unmatched until their deal can be read, no longer fail the poll run on their own. The generated spawn-renewals output type carries the renewal promotion codes.
