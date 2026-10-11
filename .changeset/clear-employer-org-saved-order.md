---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

On a saved order, clearing or replacing the bill-to or ship-to person also clears an organization that is that person's employer (#356). Which organization a default filled in is remembered only while the order is open, so on a reopened order the previous person's employer stayed as the payer. The order form says what it removed and offers Undo, for an order that should keep billing that organization. `ClearPersonParty` is now async and returns the organizations it cleared this way; `RestorePartyOrganizations` puts them back.
