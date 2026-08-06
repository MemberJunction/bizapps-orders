---
"@mj-biz-apps/orders-entities": patch
---

Follow accounting's JournalEntryBatch rename in the seeded journal-entry types

Accounting renamed `JournalEntryType.IsBatchSummary` to `IsJournalEntryBatchSummary` (Amith's
ruling, accounting PR #46). Orders seeds four types of its own into that table — OrderBooking,
RevenueRecognition, PaymentReceipt and Refund — and every one set the old field name, so
`mj sync push` would have failed against the new schema.

The failure mode is the awkward one: the migrations apply fine and the sync fails afterwards,
so an install gets most of the way through before stopping on a field name.

Worth recording WHY this was missed. The heads-up issue (#37) concluded "impact: NONE" after
sweeping migrations, packages and test-harnesses — all three clean, because orders' own schema
has never referenced accounting's batch columns. What it did not sweep was `metadata/`, and
that is where the coupling actually lives: orders writes rows INTO accounting's tables through
metadata sync, so accounting's column names are part of orders' contract even though orders'
schema never mentions them. A cross-app rename check has to include seeded metadata.
