# @mj-biz-apps/orders-integration-tests

## 5.34.1

### Patch Changes

- Updated dependencies [5dcc41e]
  - @mj-biz-apps/orders-server@5.34.1
  - @mj-biz-apps/orders-core-entities-server@5.34.1
  - @mj-biz-apps/orders-entities@5.34.1

## 5.34.0

### Patch Changes

- Updated dependencies [59236a8]
  - @mj-biz-apps/orders-entities@5.34.0
  - @mj-biz-apps/orders-core-entities-server@5.34.0
  - @mj-biz-apps/orders-server@5.34.0

## 5.33.0

### Minor Changes

- e384e15: An amount change that needs a credit memo is no longer refused (#662). The approved change is the credit memo: it carries the memo's amount and number (`<order number>-CM<n>`), posts its entry dated the effective day (deferred revenue and tax debited, the receivable credited), credits the invoice named in `AppliesToInvoiceID` up to its open amount, and lowers the line's `BilledToDate` by the memo's net. What no invoice takes stays on the order's balance as the customer's credit. `RefundRequested` against a paid invoice records the credit on that invoice; the acknowledgment task asks finance to pay it with `Orders.RefundPayment`. Payments landing on a credited invoice settle only what it still owes. Integration bundle `amount-change` gains AC8 and AC9, and AC7 now applies a credit on an invoice already sent.
- 9a78b8e: `Orders.AmendArrangement` previews a lower amount on a booked term (#506). With `NewAmount` and `Preview`, it returns the reduction and its tax, the catch-up on revenue already earned, the staged recognition entries it would offset and the new schedule, the uninvoiced instalments it would reduce or cancel, and the credit memo with where it is applied (`AppliesToInvoiceID`, `RefundRequested`). It writes nothing. Recording a change of amount is still refused until its application exists. New integration bundle `amount-change` (AC1 to AC4).
- 67e1dbd: `Orders.AmendArrangement` records a lower amount on a booked term (#506). Without `Preview`, it records a Price concession carrying `NewAmount`, routed through the ConcessionLimit rule like any other. When approved, in the same transaction: the catch-up and the re-cut recognition entries are posted, the term's amount and the instalments not yet invoiced are lowered, an `AmountChanged` subscription event is logged, and accounting's acknowledgment task is raised. Later instalment invoices bill the lowered line, and the schedule check subtracts approved reductions. A change that needs a credit memo (a credit on an invoice already sent, an order billed as a whole, or a refund) is still refused. `ReasonCategory` accepts `Dispute`. Integration bundle `amount-change` gains AC5 to AC7.
- a184085: A return against an order billed by instalment records the credit memo it booked on each returning line (`CreditMemoAmount`, zero when it credited nothing), so the return order's `Balance` is what the customer was credited rather than the full value of its lines (#661). RV5 and RV11 check both balances.
- b0deb81: A partial return against an order billed by instalment lowers the origin's instalments not yet invoiced by the returned units' share of what they still bill, pro rata, and records it on the returning line (`ScheduleReduction`) (#661). A whole-order return records it too and cancels the instalments as before. The schedule check and each instalment invoice read the origin's lines less these reductions, alongside approved amount changes, so the lowered instalments still invoice. A reduction that needs a credit memo (more than the uninvoiced instalments bill, or below what is already paid on one) refuses the return. `contract-reversal` gains RV11; RV7's figures follow the lowered instalments.

### Patch Changes

- 9e4c8df: An amount change's credit memo has a customer document (#684). `Orders.GenerateInvoice` and `Orders.SendDocument` take `OrderConcessionID` and render the credit memo that approved change issued: its number, the line's net and tax credited, the invoice or order it was applied to, and the credit left to the customer (refunded when they asked for it). It is built from what the approval logged on the `AmountChanged` subscription event, not recomputed. `Orders.SendDocument` sends it by email also when the order's company invoices through Bill.com, which carries no credit memos, and another concession still pending on the order does not hold it. Re-rendered invoices show the credit: an instalment invoice lists the memos that credited it and asks for its balance, and a whole-order document subtracts each approved amount change's memo and schedule reduction, as the order's balance does. The acknowledgment task for an amount change with a memo tells accounting to send it. Integration checks AC7–AC9 render the memo and the credited invoices.
- f7109a3: New `billcom-rail` integration bundle (BR1–BR20) covers the Bill.com invoice rail against a real database, with Bill.com replaced by an in-memory stub behind the rail's gateway seam. It runs the send sweep, re-send, cancel, payment poll (preview, capture, watermark, part, multi-order, scheduled and unmatched payments) and the webhook handler. It checks that the send and poll jobs ship Disabled and in Preview, that a poll asked to record cash records nothing while its job is Disabled and only previews while it is in Preview, and that each invoice a payment touched is refreshed with its own due amount.
- 7cc1751: Review fixes. An order created automatically from an unmatched charge books the units the checkout bought, at the charge divided by them; a charge that does not divide into a unit price at the line's four decimals, or a checkout line with a quantity that is not a whole number, is left to finance. Applying an amount change on an order billed as a whole plans against the balance before its own credit memo, so the refund or credit it reports matches the preview (integration check AC11). A return against an instalment-billed order renders a document that asks for the credit memo only, with the part taken off the origin's uninvoiced instalments shown on its own row. A reconciliation run that creates an order for a charge clears the exception an earlier run raised for it. HubSpot payments, which are recorded Unmatched until their deal can be read, no longer fail the poll run on their own. The generated spawn-renewals output type carries the renewal promotion codes.
- Updated dependencies [2cc0d55]
- Updated dependencies [e384e15]
- Updated dependencies [9a78b8e]
- Updated dependencies [67e1dbd]
- Updated dependencies [3388b7e]
- Updated dependencies [9e4c8df]
- Updated dependencies [008f08f]
- Updated dependencies [adad687]
- Updated dependencies [a58c964]
- Updated dependencies [2972434]
- Updated dependencies [3ec829a]
- Updated dependencies [3bbd5d6]
- Updated dependencies
- Updated dependencies [7d0ccf6]
- Updated dependencies [3f6fd86]
- Updated dependencies [3c16360]
- Updated dependencies [1a69590]
- Updated dependencies [d3ba6b5]
- Updated dependencies [5606499]
- Updated dependencies [cd5b92e]
- Updated dependencies [df7ff8d]
- Updated dependencies [49a6d65]
- Updated dependencies [f3ff9c4]
- Updated dependencies [77050bc]
- Updated dependencies [968549b]
- Updated dependencies [bc1778f]
- Updated dependencies [fde8cc8]
- Updated dependencies [17e183d]
- Updated dependencies [0cdc7b6]
- Updated dependencies [3f2f22a]
- Updated dependencies [c0d0b84]
- Updated dependencies [60f4ef3]
- Updated dependencies [8525cc2]
- Updated dependencies [4f1f89a]
- Updated dependencies [4ba919b]
- Updated dependencies [465980d]
- Updated dependencies [49c52df]
- Updated dependencies [dfcc809]
- Updated dependencies [313f19f]
- Updated dependencies [32aa1b2]
- Updated dependencies [55dd0ca]
- Updated dependencies [e51a86a]
- Updated dependencies [7cc1751]
- Updated dependencies [21f2d6e]
- Updated dependencies [a33ca5a]
- Updated dependencies [6f50258]
- Updated dependencies [37f31ea]
- Updated dependencies [3388b7e]
- Updated dependencies [3388b7e]
- Updated dependencies [4c88fcd]
- Updated dependencies [e43db9f]
- Updated dependencies [9c40399]
- Updated dependencies [c418914]
- Updated dependencies [a20dbf0]
- Updated dependencies [500e533]
- Updated dependencies [a184085]
- Updated dependencies [78ff171]
- Updated dependencies [bc4607f]
- Updated dependencies [b0deb81]
- Updated dependencies [59a2c13]
- Updated dependencies [4c28b84]
- Updated dependencies [d77b2bd]
- Updated dependencies [11afb0b]
- Updated dependencies [f48b68f]
- Updated dependencies [44a267d]
- Updated dependencies [72f235c]
- Updated dependencies [c03ff3d]
- Updated dependencies [0ab95c6]
- Updated dependencies [3869621]
- Updated dependencies [b1b4844]
- Updated dependencies [01f209b]
- Updated dependencies [3f8c3a0]
- Updated dependencies [55343b7]
- Updated dependencies [920b008]
- Updated dependencies [ca98a5d]
  - @mj-biz-apps/orders-core-entities-server@5.33.0
  - @mj-biz-apps/orders-entities@5.33.0
  - @mj-biz-apps/orders-server@5.33.0

## 5.32.1

### Patch Changes

- Updated dependencies [d120083]
  - @mj-biz-apps/orders-core-entities-server@5.32.1
  - @mj-biz-apps/orders-server@5.32.1
  - @mj-biz-apps/orders-entities@5.32.1

## 5.32.0

### Patch Changes

- @mj-biz-apps/orders-core-entities-server@5.32.0
- @mj-biz-apps/orders-entities@5.32.0
- @mj-biz-apps/orders-server@5.32.0

## 5.31.0

### Patch Changes

- Updated dependencies [8f105ee]
- Updated dependencies [1f5d3f6]
- Updated dependencies [0ef01d0]
- Updated dependencies [98ba1d8]
- Updated dependencies [1ea0ecf]
- Updated dependencies [52e3762]
- Updated dependencies [f8b53d9]
- Updated dependencies [aa84d29]
- Updated dependencies [bcdb1dc]
- Updated dependencies [e98b880]
- Updated dependencies [50de8dc]
- Updated dependencies [0feb8d2]
- Updated dependencies [6f8bcf7]
- Updated dependencies [d462e77]
- Updated dependencies [8073f27]
- Updated dependencies [cb861ae]
- Updated dependencies [06ee0ac]
  - @mj-biz-apps/orders-entities@5.31.0
  - @mj-biz-apps/orders-core-entities-server@5.31.0
  - @mj-biz-apps/orders-server@5.31.0

## 5.30.0

### Patch Changes

- 063bb40: A bundle line is expanded once. Saving a draft again after its lines changed used to add a second set of component lines, doubling the order, and the new set carried none of the edits made to the first, so an overlap acknowledged on a band inside a bundle came back unacknowledged and confirm refused it. A bundle line that already has children now updates them to its current quantity and price instead (a child whose quantity or price was set by hand keeps it). An overlap acknowledgment on the bundle line is copied to its component lines, so a bundle confirmed in one step can acknowledge a band inside it.
- de64c27: EN22 places its renewal in time, so confirm grants it Active, then moves the renewal's due date past the cutoff and checks that `Orders.CheckEntitlement` and `Orders.ListEntitlements` read it Suspended before the nightly job runs. It previously placed the renewal already past its cutoff, which confirm grants Suspended, so its "rows still read Active" precondition never held. EN25 covers that case: a renewal past its cutoff when confirmed starts Suspended for `PastDue`.
- 9d2cbc0: The payment-hold waiver check is now `entitlements.EN27`. It shared `entitlements.EN24` with the OnPaidInFull check, and the registry keeps one check per Id, so the OnPaidInFull check never ran. The registry-parity test now reads the check files and fails when two checks declare the same Id.
- Updated dependencies [ac78d0d]
- Updated dependencies [557b6b3]
- Updated dependencies [573ff96]
- Updated dependencies [5cd3382]
- Updated dependencies [c89ac1b]
- Updated dependencies [063bb40]
- Updated dependencies [9647922]
- Updated dependencies [0db962e]
- Updated dependencies [23d9f7f]
- Updated dependencies [0c4815c]
- Updated dependencies [036923f]
- Updated dependencies [5d531bf]
- Updated dependencies [7fe01d1]
- Updated dependencies [de9be4d]
- Updated dependencies [d8efa9f]
- Updated dependencies [ba20d3e]
- Updated dependencies [330c0e5]
- Updated dependencies [a1810fd]
- Updated dependencies [f22d329]
- Updated dependencies [6c5e3e2]
- Updated dependencies [d0c3fa6]
- Updated dependencies [ff4e795]
- Updated dependencies [307859d]
  - @mj-biz-apps/orders-core-entities-server@5.30.0
  - @mj-biz-apps/orders-entities@5.30.0
  - @mj-biz-apps/orders-server@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [edea1b5]
- Updated dependencies [9d0e76d]
- Updated dependencies [41efacb]
- Updated dependencies [2cec5c3]
  - @mj-biz-apps/orders-core-entities-server@5.29.0
  - @mj-biz-apps/orders-entities@5.29.0
  - @mj-biz-apps/orders-server@5.29.0

## 5.28.0

### Minor Changes

- 93213ea: A different band of the same subscription offering no longer books a second, overlapping subscription without anyone noticing (golive #276).

  Confirm found an existing subscription by product, so a holder with coverage under one band who ordered another band got a new subscription for the same dates, billed and recognized alongside the first.

  - A product joins a subscription family (the `SubscriptionFamily` table, one per selling company) through `Product.SubscriptionFamilyID`, picked on the product form's Subscription section. A product can only join a family of its own company, and not a family marked inactive; a family's company cannot change once saved.
  - At confirm, a subscription line whose term overlaps the holder's coverage under another band of its family, within the product's company, follows the stricter `ConcurrencyMode` of the two bands' types (`RejectDuplicate`, then `ExtendExisting`, then `AllowMultiple`): `AllowMultiple` proceeds, `RejectDuplicate` refuses, and `ExtendExisting` refuses unless the line sets `OrderLine.AcknowledgesCoverageOverlap`. The refusal names the family, the subscription and the overlapping dates, and says to start the band after the existing coverage ends or to mark the line to run alongside it. Two bands on one order are checked against each other.
  - A cancelled subscription still counts until its coverage ends: its terms that are not Canceled or Lapsed count in full, and a Canceled term counts through `Subscription.EndDate`.
  - `Orders.CheckCoverageOverlap` (new, read-only): runs the same check over a saved draft. The order lines editor calls it after each save and shows the result on the line, with the acknowledgment checkbox ("Run alongside the existing coverage. Both will be billed.") where it applies.

  Products with no family behave as before.

  An organization-held subscription bought with a contact person is now found again at confirm (#317). The subscription stores that person, and the lookup required it to be empty, so a re-order of the same product booked a second subscription without `ConcurrencyMode` running. Under `Organization`, and under `Holder` when no person was resolved, the lookup now matches the organization whatever person is stored. Under `Holder` when a person was resolved, and for seats under `Individual`, it matches the exact organization and person, so a coworker's purchase at the same organization does not extend another person's subscription. Under `Holder`, when the organization was stated on the line or the order rather than inferred from the person's employer, the lookup also matches that organization's subscription stored with no person, so a re-order naming a contact extends a subscription first bought with none. The same rule applies to the family check above. Among several matches, an Active or Trialing subscription is chosen first, then a Paused one, then a Canceled one, and among equals the one stored for the ordered person, then the newest.

  A product created on the server takes its product type's defaults again (golive #277). The server's product class extended the generated class instead of `ProductEntity`, and replaced it, so a product saved there with only a type failed for lack of a revenue recognition type and left the subscription type and taxability empty.

### Patch Changes

- Updated dependencies [01810a7]
- Updated dependencies [a2dc752]
- Updated dependencies [c5ea664]
- Updated dependencies [07793bc]
- Updated dependencies [d9d9413]
- Updated dependencies [d3b9c7d]
- Updated dependencies [93213ea]
- Updated dependencies [6777eb5]
  - @mj-biz-apps/orders-core-entities-server@5.28.0
  - @mj-biz-apps/orders-entities@5.28.0
  - @mj-biz-apps/orders-server@5.28.0

## 5.27.0

### Patch Changes

- Updated dependencies [d1cfdcf]
- Updated dependencies [a023cbc]
- Updated dependencies [b9900b7]
- Updated dependencies [d1cfdcf]
- Updated dependencies [148b74c]
- Updated dependencies [d1cfdcf]
- Updated dependencies [d1cfdcf]
  - @mj-biz-apps/orders-core-entities-server@5.27.0
  - @mj-biz-apps/orders-entities@5.27.0
  - @mj-biz-apps/orders-server@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [bf3ed93]
- Updated dependencies [8ab937f]
- Updated dependencies [8df4d53]
- Updated dependencies [5ca8b93]
- Updated dependencies [3ebb622]
- Updated dependencies [8dd30b8]
- Updated dependencies [25b0dd1]
- Updated dependencies [d0b9bbd]
- Updated dependencies [d1fd2e0]
- Updated dependencies [aab09c1]
- Updated dependencies [2b8d2a5]
- Updated dependencies [f697eee]
  - @mj-biz-apps/orders-core-entities-server@5.26.0
  - @mj-biz-apps/orders-entities@5.26.0
  - @mj-biz-apps/orders-server@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [00f6713]
  - @mj-biz-apps/orders-entities@5.25.0
  - @mj-biz-apps/orders-core-entities-server@5.25.0
  - @mj-biz-apps/orders-server@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [21ade73]
- Updated dependencies [5939a65]
- Updated dependencies [fee2c37]
- Updated dependencies [54d4e4a]
- Updated dependencies [36b3869]
- Updated dependencies [4f68e25]
- Updated dependencies [7126955]
- Updated dependencies [3b94fb5]
- Updated dependencies [5c49cb5]
- Updated dependencies [266995a]
- Updated dependencies [59efbe7]
- Updated dependencies [297fe94]
- Updated dependencies [71ad081]
- Updated dependencies [09e42d1]
  - @mj-biz-apps/orders-core-entities-server@5.24.0
  - @mj-biz-apps/orders-entities@5.24.0
  - @mj-biz-apps/orders-server@5.24.0

## 5.23.1

### Patch Changes

- Updated dependencies [b49eff4]
- Updated dependencies [529fe84]
  - @mj-biz-apps/orders-entities@5.23.1
  - @mj-biz-apps/orders-core-entities-server@5.23.1
  - @mj-biz-apps/orders-server@5.23.1

## 5.23.0

### Minor Changes

- b5e97d0: An approved Duration concession now extends its term (bc-aidp-next-golive#221, case B).

  Approving the concession applies the extension in the same transaction:

  - The term's `EndDate` and its line's `ServicePeriodEnd` move to the new end.
  - Every staged `RevenueRecognition` entry dated on or after the effective date is mirrored on its own date, and what those entries were going to recognise is spread again from the first of them to the new end, using the term's own driver and cadence. There is no catch-up and no receivable entry.
  - Access grants that follow the term run to the new end.
  - An `Extended` subscription event names the concession and pairs each offset with the entry it offsets.
  - A task is assigned to every active holder of the acknowledgment role except the requester, carrying the old and new schedules.

  The renewal follows the new end because `SpawnRenewals` reads the latest term.

  An extension is refused, both when it is recorded and when it is approved, if:

  - the term's renewal is already placed;
  - an entry it would offset is already in a journal-entry batch;
  - no acknowledgment role is configured (the new `AmendmentAcknowledgmentRole` setting, empty by default); or
  - nobody but the requester holds that role.

  `Orders.AmendArrangement` previews an extension without writing anything, or records it. A change of amount is refused for now.

  A booked term's dates can still be changed only through this path. The server subclass `SubscriptionTermEntityServer` admits the amendment's own write and no other.

### Patch Changes

- 44ba79b: Move to MemberJunction 6.1.4 (the 6.1 LTS line) from 6.1.0-edge.5, and require BizApps Accounting 0.17.0 or later, the first release with the finance exception operations that progress posting, the overlap check and the below-engine check call. `mjVersionRange` is now `>=6.1.4 <7.0.0`.
- a05a122: Outbound events: Orders tells registered `OrdersOutboundConsumer` subclasses when a sale confirms (renewals included; not returns, cancellations, amendments or credits) and when an entitlement grant is created or its status changes. Events are recorded in the same transaction as the change (a transactional outbox) and sent after it by the new `Orders — Dispatch Outbound Events` scheduled job and, for a completed checkout, right after `/complete`. Delivery is at least once with a stable event id, retried with backoff (a `Deliver` call is bounded at 30 seconds) and dead-lettered after 24 hours. A new `EntitlementGrantEntityServer` records grant changes whoever makes them. With no consumer registered, nothing is recorded. See `docs/outbound-events.md`.
- 7d375f5: An order line refuses a `ParentOrderLineID` unless bundle expansion wrote it. The concession confirm gate does not re-price a bundle component, so a parent set through the API would have let an ordinary line skip it. Clearing a parent is still allowed. Integration check BN13 covers the refusal.
- Updated dependencies [319018d]
- Updated dependencies [cd97084]
- Updated dependencies [afbfd22]
- Updated dependencies [8fe29eb]
- Updated dependencies [348b2ab]
- Updated dependencies [bf20bfa]
- Updated dependencies [43cb51e]
- Updated dependencies [69060ae]
- Updated dependencies [44ba79b]
- Updated dependencies [a05a122]
- Updated dependencies [78878b3]
- Updated dependencies [76053c0]
- Updated dependencies [7d375f5]
- Updated dependencies [498ce77]
- Updated dependencies [dfa3dc8]
- Updated dependencies [69aff1b]
- Updated dependencies [399a517]
- Updated dependencies [b5e97d0]
  - @mj-biz-apps/orders-entities@5.23.0
  - @mj-biz-apps/orders-core-entities-server@5.23.0
  - @mj-biz-apps/orders-server@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [2aca048]
  - @mj-biz-apps/orders-entities@5.22.0
  - @mj-biz-apps/orders-core-entities-server@5.22.0
  - @mj-biz-apps/orders-server@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [4d6f410]
- Updated dependencies [854a137]
- Updated dependencies [6e5077d]
- Updated dependencies [1901f73]
- Updated dependencies [53d6fd8]
- Updated dependencies [68402d5]
- Updated dependencies [18b10d7]
- Updated dependencies [497fc57]
- Updated dependencies [2831b2f]
- Updated dependencies [f263124]
- Updated dependencies [704eec2]
- Updated dependencies [fd0cfac]
- Updated dependencies [528b483]
- Updated dependencies [fa90781]
- Updated dependencies [61fb0e6]
  - @mj-biz-apps/orders-entities@5.21.0
  - @mj-biz-apps/orders-core-entities-server@5.21.0
  - @mj-biz-apps/orders-server@5.21.0

## 5.20.0

### Patch Changes

- 460c601: The `payment-terms` bundle proves that a confirmed order's `DueDate` can be corrected without approval and that every correction, and every change to `PaymentTermsTypeID`, leaves a `MJ: Record Changes` row with the old value, the new value and who made it.
- Updated dependencies [a1114ed]
- Updated dependencies [7af7a46]
- Updated dependencies [41d32be]
- Updated dependencies [53efeb9]
- Updated dependencies [2ddd206]
- Updated dependencies [0bcafbd]
- Updated dependencies [22ee8ec]
- Updated dependencies [d0c5fcd]
- Updated dependencies [d71575a]
- Updated dependencies [3a8b6b2]
- Updated dependencies [e131f07]
- Updated dependencies [a67d0ef]
- Updated dependencies [102ea17]
- Updated dependencies [8d3df77]
- Updated dependencies [ada18e6]
  - @mj-biz-apps/orders-entities@5.20.0
  - @mj-biz-apps/orders-core-entities-server@5.20.0
  - @mj-biz-apps/orders-server@5.20.0

## 5.19.0

### Patch Changes

- Updated dependencies [8ee3f8d]
- Updated dependencies [e7680ea]
  - @mj-biz-apps/orders-entities@5.19.0
  - @mj-biz-apps/orders-core-entities-server@5.19.0
  - @mj-biz-apps/orders-server@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [b3ef9d2]
- Updated dependencies [c8ad04a]
- Updated dependencies [5b5ebef]
  - @mj-biz-apps/orders-entities@5.18.0
  - @mj-biz-apps/orders-core-entities-server@5.18.0
  - @mj-biz-apps/orders-server@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [d0489c4]
- Updated dependencies [acb0405]
- Updated dependencies [5630121]
- Updated dependencies [b550e40]
- Updated dependencies [19983f5]
  - @mj-biz-apps/orders-core-entities-server@5.17.0
  - @mj-biz-apps/orders-entities@5.17.0
  - @mj-biz-apps/orders-server@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2e9e3dd]
  - @mj-biz-apps/orders-entities@5.16.0
  - @mj-biz-apps/orders-core-entities-server@5.16.0
  - @mj-biz-apps/orders-server@5.16.0

## 5.15.0

### Patch Changes

- 1b10c08: Ship the `Party Customer Roster` query so orders can say who its customers are.

  Foreign-key pickers across the product search the whole party directory with no notion of which
  parties anyone actually does business with, because no app has had a way to say. `@mj-biz-apps/common-ng`
  now defines a `Party Signals` query category for exactly that: an app ships one query returning
  `PartyKind`, `PartyID`, `Count` and `LastActivityAt`, and the shared pickers rank customers first
  without Common ever importing an app (MemberJunction/bc-aidp-next-golive#248).

  This is orders' contribution. One row per bill-to organization and one per bill-to person over
  orders that are not voided, with the count and the latest order date — bill-to is the customer by
  definition (D65). SQL Server and PostgreSQL twins, as with the existing party rollups. The
  `[signal: order|orders]` marker in the query description is what lets a picker label a row
  "4 orders" without knowing what an order is.

  Adds a `party-roster` integration bundle asserting the query is registered in the category, carries
  the marker, and returns rows that satisfy the contract. Raises the `mj-bizapps-common` floor to
  `>=5.45.0`, the release that introduces the category — without it the category lookup does not
  resolve on install.

  The header-form wiring that consumes this is a separate change.

- Updated dependencies [09624cb]
- Updated dependencies [426e730]
- Updated dependencies [21167e2]
- Updated dependencies [7ec08da]
- Updated dependencies [5293c47]
- Updated dependencies [c869137]
  - @mj-biz-apps/orders-core-entities-server@5.15.0
  - @mj-biz-apps/orders-entities@5.15.0
  - @mj-biz-apps/orders-server@5.15.0

## 5.14.0

### Patch Changes

- f652c6f: Carry dimensions onto payment journal entry lines.

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

- Updated dependencies [bc6588e]
- Updated dependencies [2ce84d1]
- Updated dependencies [56eb169]
- Updated dependencies [e1f4e15]
- Updated dependencies [f652c6f]
- Updated dependencies [49217aa]
  - @mj-biz-apps/orders-entities@5.14.0
  - @mj-biz-apps/orders-core-entities-server@5.14.0
  - @mj-biz-apps/orders-server@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [92f7e68]
  - @mj-biz-apps/orders-entities@5.13.0
  - @mj-biz-apps/orders-core-entities-server@5.13.0
  - @mj-biz-apps/orders-server@5.13.0

## 5.12.2

### Patch Changes

- Updated dependencies [24c8436]
  - @mj-biz-apps/orders-core-entities-server@5.12.2
  - @mj-biz-apps/orders-server@5.12.2
  - @mj-biz-apps/orders-entities@5.12.2

## 5.12.1

### Patch Changes

- @mj-biz-apps/orders-core-entities-server@5.12.1
- @mj-biz-apps/orders-entities@5.12.1
- @mj-biz-apps/orders-server@5.12.1

## 5.12.0

### Patch Changes

- 9b63bf1: Honor a term start stated on a subscription order line instead of always deriving it from the order date (#121). `OrderDate` remains the booking date and still dates the booking journal entry; a `ServicePeriodStart` set on the line now starts the term on that date, with the subscription type's rules computing the end (and any anchored-period proration) from it. An extension continues existing coverage as before, and reports a stated start only when the term genuinely begins on a different date. The order line editor gains a "Term start" field on subscription lines that shows the order date as its default and offers a reset back to it; on a line renewing live coverage the field is read-only and shows the date the term will actually begin, since a renewal continues where existing coverage ends.
- Updated dependencies [b8b2131]
- Updated dependencies [e9bf1f9]
- Updated dependencies [888983a]
- Updated dependencies [ecbfe69]
- Updated dependencies [9b63bf1]
  - @mj-biz-apps/orders-entities@5.12.0
  - @mj-biz-apps/orders-core-entities-server@5.12.0
  - @mj-biz-apps/orders-server@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a6ad8c5]
  - @mj-biz-apps/orders-entities@5.11.0
  - @mj-biz-apps/orders-core-entities-server@5.11.0
  - @mj-biz-apps/orders-server@5.11.0

## 5.10.0

### Patch Changes

- Updated dependencies [76b3d3e]
  - @mj-biz-apps/orders-entities@5.10.0
  - @mj-biz-apps/orders-core-entities-server@5.10.0
  - @mj-biz-apps/orders-server@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [e121d98]
  - @mj-biz-apps/orders-entities@5.9.0
  - @mj-biz-apps/orders-core-entities-server@5.9.0
  - @mj-biz-apps/orders-server@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [2981938]
  - @mj-biz-apps/orders-entities@5.8.0
  - @mj-biz-apps/orders-core-entities-server@5.8.0
  - @mj-biz-apps/orders-server@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [a436049]
- Updated dependencies [bbb5171]
- Updated dependencies [bb9a5f2]
- Updated dependencies [4dfa35c]
  - @mj-biz-apps/orders-core-entities-server@5.7.0
  - @mj-biz-apps/orders-entities@5.7.0
  - @mj-biz-apps/orders-server@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [e48bc43]
  - @mj-biz-apps/orders-core-entities-server@5.6.0
  - @mj-biz-apps/orders-server@5.6.0
  - @mj-biz-apps/orders-entities@5.6.0

## 5.5.0

### Patch Changes

- Updated dependencies [24f8625]
  - @mj-biz-apps/orders-entities@5.5.0
  - @mj-biz-apps/orders-core-entities-server@5.5.0
  - @mj-biz-apps/orders-server@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d29cc6c]
  - @mj-biz-apps/orders-entities@5.4.0
  - @mj-biz-apps/orders-core-entities-server@5.4.0
  - @mj-biz-apps/orders-server@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [4fcc102]
- Updated dependencies [406bcaa]
  - @mj-biz-apps/orders-entities@5.3.0
  - @mj-biz-apps/orders-core-entities-server@5.3.0
  - @mj-biz-apps/orders-server@5.3.0

## 5.2.1

### Patch Changes

- @mj-biz-apps/orders-core-entities-server@5.2.1
- @mj-biz-apps/orders-entities@5.2.1
- @mj-biz-apps/orders-server@5.2.1

## 5.2.0

### Patch Changes

- b2139aa: Take ownership of the form chrome for the three EntityRelationships that orders creates onto
  accounting entities: Journal Entries → Order Lines and → Payment Headers (both `None`, posted
  sources are not a JE working surface) and Dimensions → Order Line Dimensions (`More`).

  These lived in `bizapps-accounting` and could not stay there. The relationship rows exist only
  because THIS app's tables carry the FKs (`Order Lines.JournalEntryID`, `Payment
Headers.JournalEntryID`, `Order Line Dimensions.DimensionID`), so CodeGen creates them when orders
  installs — verified against a database with accounting but not orders, where zero EntityRelationship
  rows point at an orders entity. Accounting's `@lookup:` therefore resolved nothing and its
  `mj sync push` failed outright with a full transaction rollback, meaning accounting's metadata could
  not be pushed on any host that installs it without orders. Configuration for a row belongs to
  whichever app can guarantee both sides exist.

  No code and no schema change: `EntityRelationship.Configuration.UI.inclusion` is layer 1 of the
  runtime chrome stack resolved by `@memberjunction/ng-base-forms`, not a CodeGen input, so this takes
  effect on accounting's already-published forms with no regeneration.

- 73b9fd2: Build the app packages in CI before running the tests

  CI ran `npm ci` then `npx vitest run` with no build in between. `registry-parity.test.ts`
  imports a workspace package by name, whose `main` points at a `dist/` that `npm ci` does not
  produce — so the file failed to RESOLVE and never executed.

  The reported shape was the dangerous part: ~989 passing plus a red X, which reads as a known
  failure rather than as 76 tests that are not running. The same command locally reports 1065,
  and the difference is exactly this one file.

  That matters because of WHAT does not run. `registry-parity` is the anti-vacuity floor — it
  asserts exact per-bundle check counts and cross-checks the four places a bundle name has to
  agree, because adding a bundle without a Test record, or a Test record that never joins the
  suite, both leave the integration suite passing with strictly less in it. Both have happened.
  The floor was being enforced nowhere.

  Second reason, independent of the test: CI could not catch a BUILD break at all. package.json
  and package-lock.json disagreed about `@types/express` for 24 commits and every `npm ci`
  failed — nobody noticed, because the check was already red for the other reason. A
  permanently-red check stops being read, and then it stops working.

  Uses `build:packages`, not `build`: it compiles the six `@mj-biz-apps/orders-*` packages the
  tests import and skips `mj_api` / `mj_explorer`, which are MJ's apps and would add Angular
  build time for no coverage here.

- ebd657a: Add integration coverage for the entitlement read contract: in-process `Orders.CheckEntitlement` / `ListEntitlements` (ER1–ER7) and the same operations over GraphQL `ExecuteRemoteOperation` (WE1–WE5).
- ff7fc51: Add the first Entity Action binding — Send Document on order confirmation — as metadata, with
  referential guards over `metadata/entity-actions/`. Ships `Pending`: scope and enabling are an
  operator's decision, and `ScopeRecordID` is environment-specific.
- Updated dependencies [8e42a02]
- Updated dependencies [e21ad46]
- Updated dependencies [07e0b10]
- Updated dependencies [844f85d]
- Updated dependencies [c490929]
- Updated dependencies [d8d94c7]
- Updated dependencies [ce76550]
- Updated dependencies [cf88598]
- Updated dependencies [f426462]
- Updated dependencies [c724132]
- Updated dependencies [2daf9b9]
- Updated dependencies [94af4e5]
- Updated dependencies [44944fd]
- Updated dependencies [d0e5450]
- Updated dependencies [8ad33a8]
- Updated dependencies [6367347]
  - @mj-biz-apps/orders-server@5.2.0
  - @mj-biz-apps/orders-core-entities-server@5.2.0
  - @mj-biz-apps/orders-entities@5.2.0
