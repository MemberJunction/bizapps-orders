---
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
---

Make the order line price picker mean what it says, and require a reason for an override.

The picker behind the pencil had three faults in one control (MemberJunction/bc-aidp-next-golive#253).
Its Default row did nothing: the option's value was the empty string, and the `<select>`'s bound
value was applied before its conditional options existed, so the browser fell back to the first row
— Default — while the component still believed the line was on a custom amount. Choosing Default was
then choosing what the DOM already had, and no change event fired. Selection is now bound per option
and Default carries a real sentinel value.

The "overridden" badge stuck after a return to list price, because every named-rule pick set
`PriceOverridden` whether or not the pick differed from the default. The flag is now derived: a pick
or a typed amount that lands on the engine default restores the default and clears the flag, the
reason and any custom amount; only a price that actually deviates is flagged. A saved line put back
on Default is stamped with the rules' answer rather than its stored baseline, which may itself have
been the override.

To make that comparison exact, `Orders.PriceOrder` now reports, per line, the rule that produced the
price (`ProductPriceID`) and the engine's default (`Default`: unit price, rule id, rule name) — for
a pinned line too. `OrderPricingService` gains `IncludeDefaultsForStatedLines`, an opt-in that
resolves the rules for a stated line without stamping it and reports the answer in `EngineDefaults`;
the save path does not set it. With the default known by id, the picker no longer lists the rule the
engine already chose: Default is that rule, named and priced, and a product with one applicable rule
offers Default and Custom amount alone.

`PriceOverrideReason` is now required when `PriceOverridden` is set. The order line's `ValidateAsync`
refuses the save with "Enter a reason for the price override", and the panel marks the explanation
required and keeps Done disabled until it has text. The rule fires only when the override itself is
being written — a new line, or a saved one whose price or override fields changed — so lines
converted from the previous system, which carry overridden prices with no reason, stay loadable and
editable for everything else. No database constraint; the field's metadata description now says it
is required when the price is overridden.
