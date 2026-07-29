# Metadata staged for a dependency that has not merged yet

Seed data that is **correct and ready** but cannot be pushed, because the entity it targets does not
exist in the currently-installed dependency version.

It is kept OUT of `metadata/` deliberately. `mj sync push --dir metadata` validates every folder it
sweeps and fails the whole push on an unknown entity, so leaving it in place would break the
documented rebuild cycle for everyone on this branch — turning a "not yet" into a "broken now".

## `journal-entry-types/` — blocked on accounting's schema realignment

Accounting issue #24 turns `JournalEntry.EntryType` from a CHECK constraint into a
`JournalEntryType` lookup table, and makes domain types the **owning app's** metadata. Accounting
then seeds only its 8 ledger-mechanics rows (`Manual`, `Reversal`, `Adjustment`, `OpeningBalance`,
`BatchSummary`, `FXRevaluation`, `PeriodEndAccrual`, `Writeoff`).

This app books four types accounting will no longer seed:

| Code | Written when |
|---|---|
| `OrderBooking` | an order line is confirmed (D10) |
| `RevenueRecognition` | a forward-dated deferred-revenue release (D14) |
| `PaymentReceipt` | a payment allocation books the cash leg (D13) |
| `Refund` | the mirror of a capture (D53) |

`Reversal` and `Adjustment` are also booked from here but are NOT seeded here — accounting owns them
as system types, and seeding them twice would be two rows claiming one `Code`.

## When to move it

**The moment accounting's `schema-realignment` merges**, and before or with that upgrade:

```bash
git mv metadata-pending/journal-entry-types metadata/journal-entry-types
npm run mj -- sync push --dir metadata
```

**Why the timing is not optional:** the draft pipeline rejects an unknown code with
`ENTRY_TYPE_UNKNOWN` at validation, so **every order confirm fails outright** in the window between
that merge and this push. Found by Marcelo reviewing PR #15 — orders was booking codes it never
seeded, which was invisible only because the CHECK constraint still enumerated them.
