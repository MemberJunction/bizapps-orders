# Journal entry types owned by this app

Accounting's `JournalEntryType` is a **shared lookup**, and the two apps seed different halves of it.

**Accounting seeds only ledger MECHANICS** — the entry kinds it originates itself: `Manual`,
`Reversal`, `Adjustment`, `OpeningBalance`, `BatchSummary`, `FXRevaluation`, `PeriodEndAccrual`,
`Writeoff`. Those are `IsSystem`.

**This app seeds the DOMAIN types it books**, because the events are orders concepts and accounting
has no reason to know they exist:

| Code | Written when |
|---|---|
| `OrderBooking` | an order line is confirmed (D10) |
| `RevenueRecognition` | a forward-dated deferred-revenue release (D14) |
| `PaymentReceipt` | a payment allocation books the cash leg (D13) |
| `Refund` | the mirror of a capture (D53) |

`Reversal` and `Adjustment` are also booked from here but are **not** seeded here — accounting owns
them as system types, and seeding them twice would be two rows claiming one `Code`.

## Why this file exists at all

`EntryType` used to be a CHECK constraint in accounting enumerating every downstream app's concepts,
so every new source event in any app meant a migration in *theirs*. The realignment (accounting
issue #24) turns it into a lookup and makes domain types the owning app's metadata.

**The failure mode this prevents is silent-looking but total:** the draft pipeline rejects an unknown
code with `ENTRY_TYPE_UNKNOWN` at validation, so an order confirm fails outright the moment
accounting's realignment merges and these rows are absent. Push this metadata before, or with, that
merge.
