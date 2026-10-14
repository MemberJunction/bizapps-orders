---
'@mj-biz-apps/orders-core-entities-server': patch
---

An order line that names no ship-to is now for the same party everywhere (#622). The subscription holder, the entitlement-grant beneficiary and the gift-card recipient all fall back from the line's ship-to to the order's ship-to, then the order's bill-to (`ResolveLineParty`); grants and gift cards used to skip the order's ship-to. A grant that belongs to a subscription now takes the subscription's holder, so a renewal's access goes to the renewed subscription's holder and an organization filled in from the person's affiliation carries over to the grant. Existing grants and gift cards are not changed.
