---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-integration-tests': patch
'@mj-biz-apps/orders-ng': patch
---

Honor a term start stated on a subscription order line instead of always deriving it from the order date (#121). `OrderDate` remains the booking date and still dates the booking journal entry; a `ServicePeriodStart` set on the line now starts the term on that date, with the subscription type's rules computing the end (and any anchored-period proration) from it. An extension continues existing coverage as before, and reports a stated start only when the term genuinely begins on a different date. The order line editor gains a "Term start" field on subscription lines that shows the order date as its default and offers a reset back to it; on a line renewing live coverage the field is read-only and shows the date the term will actually begin, since a renewal continues where existing coverage ends.
