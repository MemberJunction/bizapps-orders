---
'@mj-biz-apps/orders-ng': minor
---

The selling company on an order now comes from a configured default and asks before booking
anywhere else.

This field decides which legal entity books the revenue, and the picker behind it lists every
company the instance has. Orders defaulted it twice, differently, and neither rule was written
down or visible to the person entering the order: the header form took whichever company sorted
first alphabetically, and fast entry took the first product's company on the reasoning that a
company with no products cannot be sold from. Both are guesses about a finance decision, and an
order booked to the wrong entity looks entirely correct afterwards.

Both are gone. The header renders `bizapps-selling-company-field` from `@mj-biz-apps/common-ng`,
which defaults to the user's own company when they have one the instance knows, else the Common
`DefaultSellingCompanyID` setting, and holds any other choice for confirmation before writing it.
Fast entry reads the same setting, so the two paths cannot disagree. An instance that configures
nothing gets a blank field — the pre-existing behaviour for an unconfigured picker, rather than a
guess.

Raises the `@mj-biz-apps/common-ng` floor to `>=5.45.0`, the release that ships the field and the
setting.

The Bill To and Ship To pickers are not part of this: they need a platform lookup seam that is not
on the release line this app targets.
