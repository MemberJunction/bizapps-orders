---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-entities': minor
---

Derive an order line's GL dimensions instead of waiting for someone to type them.

An order line could already state ONE dimension tag by hand. The chart-of-accounts design needs five
axes on a revenue line and needs them with no human in the loop, which is what
MemberJunction/bc-aidp-next-golive#236 actually asks for. This adds the derivation.

`DimensionDefault` is the product half of the mapping: polymorphic over Product, ProductCategory,
ProductType and Company and date-effective, so it is resolved by the same precedence
`GLAccountResolver` already walks for accounts — product, its category and that category's
ancestors, its product type, then the line's company. Most specific wins **per dimension** rather
than per walk, so a category can supply Venture while the product supplies Product and both land on
the line. That is what lets a venture be stated once instead of copied onto every product.

Two axes cannot come from a mapping table, because they are facts about the line rather than the
product. ARR-Type reads the subscription decision the save already carries — `CreateNew` is New,
`ExtendExisting` and `Reactivate` are Renewal — rather than `SubscriptionTerm.TermNumber`, which is
not written until later in the same save. Vintage reads the event's own year, in UTC, so an event
starting just after midnight is not filed under the previous year by a server west of the venue.
Both resolve by CODE, because the ids are minted per environment by whatever pulls the dimensions
out of Business Central; a missing dimension or value yields no tag rather than a guess.

The derived values are written as `OrderLineDimension` child rows, so a line can carry all five
axes. `OrderLine.DimensionID` / `DimensionValueID` become the **human override**: `MergeLineDimensions`
already gives the column precedence over a child row naming the same axis, so setting a tag by hand
overrules what was derived for that one axis and nothing else. Where the product mapping and a
line-level rule name the same axis, the rule wins — it was computed from this line.

Stamping is diffed rather than delete-and-reinsert, so saving an unchanged order writes nothing to
the change log, and booked lines are skipped because their tags are what the journal entry already
carries. The whole pass leaves early when no `Dimension` rows exist at all, which is every
environment until the ERP sync has run — so this ships inert and starts working when the dimensions
arrive.

Nothing here refuses a booking. An unmapped product yields no tags and books untagged, which is the
state every line was in before this existed; refusing would turn a half-configured mapping into an
outage across every order.
