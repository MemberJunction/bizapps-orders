---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Value a concession however it is delivered, and approve it before the customer sees it.

The sales guardrails valued a concession only as a percentage off price, so a term extended at no
charge, seats added at no charge or a product added at no charge computed to 0% and cleared every
check.

- New `OrderConcession` entity. A concession is valued on save at the arrangement's own rate: a term
  extension at the term's amount over its length, a typed price at its reduction from the engine
  price, added seats at the line's unit price. Within the requester's `SalesAuthority` it is Approved
  on save; outside it, it is Pending until a holder of the `ConcessionLimit` rule's role approves or
  rejects it. Each records the delivery form and a reason category (Retention, Referral, Other).
- `SalesAuthority` gains `MaxConcessionValue` and `MaxTermExtensionDays`. A manual discount now
  escalates on either its percentage or its absolute value. For Duration and Seats concessions an
  unset limit grants no authority.
- `SalesRule.RuleType` gains `ConcessionLimit`.
- An order cannot be confirmed, and its documents cannot be sent, while a concession on it is Pending,
  or while a line on an unconfirmed order carries a typed price below its engine price with no
  approved concession covering it. The order itself still saves.
- A saved `SubscriptionTerm`'s `StartDate`, `EndDate` and `Amount` can no longer be edited. Extend a
  term by recording a Duration concession.
