---
'@mj-biz-apps/orders-ng': patch
---

Add an Order chip to the Subscription form header.

A subscription booked from an order stored only `OrderLineID`, and the only way back was the Order
Line ID field in the Subscription Overview panel — which opens the LINE. Reaching the order meant
opening the line and navigating up from there, which a UAT tester hit while ordering a subscription
product (MemberJunction/bc-aidp-next-golive#228).

The header now carries a related-records chip that opens the order directly, showing its order
number rather than an id. The Order Line ID field is unchanged: it answers a different question —
which line of the order bought this — and remains the way to the line.

Built on `bizapps-related-chips` from `@mj-biz-apps/common-ng` rather than a chip of this app's own,
so the resolve-and-hide rules are the shared ones: no chip for an order this user cannot read or
that is not there, never an id in place of a name, and ctrl/cmd-click opens a new tab. That raises
the `@mj-biz-apps/common-ng` floor to `>=5.44.0`, the release that introduces the component.

A subscription stores no `OrderID`, so the chip names the order by a filter through `vwOrderLines`
rather than by id — the reverse-link case the shared component exists to cover. The one consequence
worth knowing: a read that throws drops the chip instead of rendering it unresolved, because the
failed read also cost us the id to open.
