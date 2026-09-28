---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Two attestation controls from Jeremy's review of golive #241. `Orders.RecordProgress` returns a `ClosedPeriodWarning` when the measurement date falls in a month accounting has already posted a journal-entry batch for — advisory on both the preview and the live path, never blocking, since the batch build stays the control and attestation must not be gated on a state the attester cannot change. The screen shows it above the table, in the confirm dialog, and on the notice after a post made anyway. And the immutability trigger now looks forward as well as back: promoting an observation from Draft to Posted is refused outright by the trigger (51031), and inserting a row already Posted is refused by a new `OrderLineProgressMeasurement` server subclass unless `Orders.RecordProgress` is the one saving it. A posted observation carries a recognition amount and a journal entry id, and the only thing making those true is that the entry was written in the same transaction.
