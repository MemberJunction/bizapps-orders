---
'@mj-biz-apps/orders-ng': minor
---

The selling company on an order now comes from a configured default and asks before using any
other company.

The order's company is its owning company: it owns the receivable and receives the payment. Line
revenue still follows each product's own company. The picker behind it lists every company the
instance has, and the header form defaulted it to whichever company sorted first alphabetically —
a rule that was neither written down nor visible to the person entering the order. An order owned
by the wrong company looks entirely correct afterwards.

That default is gone. The header renders `bizapps-selling-company-field` from
`@mj-biz-apps/common-ng`, which defaults to the user's own company when they have one the instance
knows, else the Common `DefaultSellingCompanyID` setting, and holds any other choice for
confirmation before writing it. An instance that configures nothing gets a blank field rather than
a guess; the order cannot save until a company is chosen.

Raises the `@mj-biz-apps/common-ng` floor to `>=5.46.0`, matching the `common-entities` floors so
one copy of that package resolves.

The Bill To and Ship To pickers are not part of this: they need a platform lookup seam that is not
on the release line this app targets.
