---
"@mj-biz-apps/orders-core-entities-server": patch
---

Fix four money and subscription defects found by stressing the UI

Twenty-six adversarial orders were designed with their expected results written BEFORE running them,
then driven through the real UI and checked against the database. Four defects survived that, and
none would have been found by reading the code.

**A flat price billed the wrong amount.** A `Flat` rule's total was reconstructed as
`quantity × derived_rate`, so three of a 100.00 flat pack billed **99.99** — a flat amount that
cannot be represented as a unit rate loses money on every sale. `LineGross` is now the single
definition of a line's gross, shared by all six consumers, and takes the exact extended amount the
pricing pass computed rather than re-deriving it. Booked lines short-circuit entirely, because their
money is frozen by trigger 51003 and any figure that cannot be reproduced from stored state alone
would fail the confirm.

**Two lines for one subscription created two subscriptions** instead of extending one — duplicate
billing and a customer holding two overlapping terms.

**Subscriptions booked to the order header's company**, not the line's, putting the wrong company on
the ledger for any multi-company order.

**`OrderLine.SubscriptionID` was never written back**, so the link existed in one direction only —
which is also what hid the duplicate-subscription bug from the first validator, which reported "no
subscriptions" and passed a broken order.

Also refuses products that are discontinued or outside their sale window at confirm, tested against
the ORDER's date rather than today's.
