---
'@mj-biz-apps/orders-core-entities-server': patch
---

A bundle's component lines now take the bundle line's ship-to, stated start, subscription action and renewal target (#548). A subscription sold inside a bundle goes to the person or organization the bundle line names, starts on the date it states, and renews the subscription it names instead of starting a second one. The renewal target goes only to the component selling the renewed subscription's product; when no component, or more than one, sells it, the save is refused. On later saves of a draft, a component follows a changed bundle line unless its own value was changed on the component.
