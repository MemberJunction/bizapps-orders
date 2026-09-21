---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-integration-tests': patch
---

Carry dimensions onto payment journal entry lines.

No journal entry line produced by a payment carried a dimension — not the intercompany legs, not
cash, not AR. Accounting had accepted them since its contract was written: `JournalEntryLineDraft`
declares `Dimensions?`, the pipeline validates them and the engine writes
`JournalEntryLineDimension` rows. The orders side simply had nowhere to put them —
`PaymentJELine` had no field — so the values were resolved and then dropped
(MemberJunction/bc-aidp-next-golive#238).

Two sources now reach the ledger.

The **counterparty** pinned per leg on the `IntercompanyAccountMatch`: the collector's Due To names
the owning company, the owner's Due From names the collector. `ResolveIntercompanyAccounts` had
always returned these; both callers kept the two GL account IDs and discarded the rest. Today the
per-entity Due To / Due From accounts are what tell the two legs apart, so the omission reads as a
reporting gap. Under a chart of accounts with one shared receivable and one shared payable it stops
being one: accounting merges same-side lines on (account, dimension set), so two owners' credits
would collapse into a single netted line that cannot be split, matched or eliminated.

The **settled order line's own tags**, onto the cash, AR and intercompany lines alike. Booking
debits AR under those tags; clearing the receivable untagged leaves every dimension permanently out
of balance on an account that nets to zero in total. A company's share is split by distinct tag set
and pro-rated by line amount, with the largest slice absorbing the residue — the rule
`AllocateByCompany` already used, rather than a second one that could drift from it.

A pin with no value is skipped rather than defaulted or refused. `IntercompanyAccountMatchDimension`
makes `DimensionValueID` nullable to mean "take it from context", and its own definition says an
intercompany leg has no context to take one from. Refusing to book would turn a legal configuration
into an outage.

An order whose lines carry no dimensions produces exactly the entries it produced before, line for
line.

Also shared what the two booking paths had been duplicating — the intercompany lookup and the
order-line loader — since keeping one copy each is how this came to need the same fix in two files.

The pipeline is only half of it: the counterparty values and the per-pair pins are configuration. A
match with nothing pinned books exactly as it does today.
