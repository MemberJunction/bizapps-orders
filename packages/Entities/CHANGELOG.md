# @mj-biz-apps/orders-entities

## 5.19.0

### Minor Changes

- 8ee3f8d: Register the metadata `V202609221500` left behind for `DimensionDefault`'s name fields (golive #236 follow-up).

  `V202609221500` created `vwDimensionDefaults` with three denormalized name columns — `Entity`, `Dimension` and `DimensionValue` — but registered `EntityField` rows for the table's eleven columns only. On any database built from migrations alone the view has 14 columns against 11 registered fields, and every `DimensionDefault` INSERT fails with `Column name or number of supplied values does not match table definition`, so no product can carry a default dimension. `V202609252100` inserts the three rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.

- e7680ea: Keep each order's customer address as it was at the time of sale.

  Confirming an order now copies its bill-to and ship-to addresses, and each line's own ship-to, onto
  the order as JSON (`OrderHeader.BillToAddressSnapshot`, `ShipToAddressSnapshot`,
  `OrderLine.ShipToAddressSnapshot`). The invoice, the order form and the order document read the
  snapshot on a confirmed order, so editing a customer's address no longer moves their earlier sales.

  Once an order is confirmed, an address it names cannot be replaced or cleared; an empty one can be
  filled once, and the server snapshots it on that save. The entity refuses the edit, and triggers
  51015 (header) and 51016 (line) refuse it at the database. Draft and Quoted orders keep following
  the live address. The migration backfills snapshots for orders that are already Confirmed, from
  their current Address rows.

## 5.18.0

### Minor Changes

- b3ef9d2: Payment-gated access (bc-aidp-next-golive#223). Adds a grant timing, `OnFirstPayment`, set on a
  product, category or product type like the other timings:

  - A new purchase's grants are written `Suspended` (`AwaitingPayment`) and become `Active` when the
    first amount due is paid: the first instalment of each company's schedule, or the whole order when
    there is no schedule.
  - A renewal's grants are `Active` at confirm and are suspended (`PastDue`) once the renewal order is
    `RenewalAccessCutoffDaysPastDue` days past due. The setting defaults to 14, and `off` disables it.

  Grants are re-decided inside every payment capture and reversal, so card, settled ACH, check,
  refunds and returned debits all resolve through the order's `AmountPaid`. A refund the seller issues
  is added back before deciding, so it never takes access away; only a returned debit does. A renewal
  counts days past due from its next unpaid due date, so a part-payment that leaves that date unpaid
  does not delay the cutoff. A new nightly job,
  `Orders — Enforce Payment-Gated Access (daily)`, applies the renewal cutoff. It ships `Disabled` and
  set to Preview. `OnPaidInFull` grants now also become `Active` when the balance clears after confirm.

  Schema: `EntitlementGrant` gains `GrantTimingApplied`, `SuspendedAt` and `SuspensionReason`, and the
  three grant-timing columns accept `OnFirstPayment`. `PaymentHeader` gains `ReversalSource`
  (`Refund` or `BankReturn`), required on every reversal and backfilled on existing ones. The overdue worklist fills `GraceThroughDate`
  for renewals that still have access. Identity claims no longer lift a payment hold.

### Patch Changes

- 5b5ebef: Share the order-line price picker. The rules behind it (`IsLinePriceOverridden`, `NamedPricesBesideDefault`, `RestoreLineDefault`, `PinLineToNamedPrice`, `PinLineToAmount` and the override-reason helpers) move to `@mj-biz-apps/orders-entities`, and the control becomes `<mjo-line-price-picker>` in `@mj-biz-apps/orders-ng`, with an `AllowCustomAmount` input for screens that offer named prices only. The order lines editor uses it with no change in behaviour, except that a line already on a typed amount now shows a disabled "Custom amount" row to a user who may not type one, instead of reading "Default".

## 5.17.0

### Minor Changes

- d0489c4: Freeze the selling company, order date and parties on a confirmed order.

  - A line on a Confirmed order keeps the company it was sold under. `OrderLineEntityServer` no
    longer re-stamps `CompanyID` from the product once the order is booked, and trigger 51003 now
    refuses a change to it. Draft and Quoted orders still re-stamp from the product.
  - A booked header refuses changes to `OrderDate`, `OrderType` and `ReversesOrderHeaderID` (added to
    `ORDER_HEADER_MONEY_FIELDS` alongside `CompanyID`) and to a bill-to party that is already set
    (new `ORDER_HEADER_SET_ONCE_FIELDS`), from `Validate()`, with a message naming the field.
  - New trigger `trg_OrderHeader_ImmutableAfterConfirm` backs that at the database: the same columns
    (51013), and `Status` cannot leave Confirmed (51014).
  - The order form shows Order Date and the bill-to party read-only on a booked order, as it already
    did Company and Order Type, with a note saying why.
  - The guest-order claim no longer re-points a booked order's bill-to. It fills an empty one, and
    moves the ship-to on its own, so the claim succeeds.

  Direct SQL that rewrote these columns on booked orders is now refused; stand the trigger down the
  way the existing immutability triggers are for a data reset.

- acb0405: Register the metadata `V202609191200` left behind for `OrderLine`'s dimension columns (golive #256).

  `V202609191200` regenerated `vwOrderLines` with the two denormalized dimension name columns but registered `EntityField` rows for `DimensionID` and `DimensionValueID` only. On any database built from migrations alone the view has 51 columns against 49 registered fields, MJ's save-capture falls back to view column order, and every OrderLine INSERT fails with `Column name or number of supplied values does not match table definition`. `V202609230300` inserts the two rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.

  The same run also left two `EntityRelationship` rows unregistered, `Dimension` and `DimensionValue` to Order Lines, so on a host built from migrations the accounting vocabulary is not reachable from an order line in the API or on its form. Both are healed in the same file, guarded on id and on their natural key.

- b550e40: Every value that names a calendar day is derived from the business day rather than the clock instant
  (#209).

  A SQL `DATE` is a calendar day with no time. `new Date()` is an instant, and an instant serialises in
  UTC — so a record stamped at 9 PM Eastern was dated tomorrow. A reversal fell in a different period
  from the capture it reverses, a credit settled an order on a day that had not started, an invoice was
  printed with tomorrow's date beside a due date counted from a different calendar, and the journal
  entries followed the wrong day with them. Same defect shape as the order-date case
  (bc-aidp-next-golive#168), fixed the same way.

  Two helpers hold the rule so it is stated once rather than re-derived per site. `AsDateValue(cell)`
  (orders-entities) gives the calendar day a value names, pinned to midnight UTC — which also stops a
  supplied instant carrying its time into a `date` column. `CalendarDayOrToday(cell, provider, user)`
  (core-entities-server) adds the fallback: today's business day when the value names no day, warming
  `BusinessTimeZoneEngine` only on that path, so a metadata read never runs inside a write transaction
  to compute a day that was supplied anyway. Where no provider exists — the browser, the entity layer —
  the pairing is `AsDateValue(x) ?? TodayAsDateValue()`.

  Converted, twenty-eight sites: the reversal factory and the applied-account-credit operation, the
  capture operation, the initial payment, the entitlement grant's validity start, the subscription
  booking day and the cancellation request day, the allocation and processing-fee journal entries, the
  payment line's allocation entry, the order journal entry's effective date, the affiliation as-of day
  on both sides, `PreviewPrice` and `SpawnRenewals`, the checkout service's pricing as-of day, the
  pricing service's four `AsOf` values and the order-line and order-header ones, the order-lines
  editor's dimension catalog and pricing context, the Angular payment form's cleared date field, the
  invoice document's printed date and days-until-due countdown, and the integration harness's own
  fixtures — a test suite that dates its rows from the clock cannot measure this defect.

  Caller-supplied days are refused rather than absorbed. `AsDateValue` answers `null` for a well-formed
  day that does not exist (`2026-02-30`) instead of throwing a `RangeError` its callers cannot defend
  against; `RequireDate` rejects such a day rather than letting `Date.parse` roll it forward to another
  one; and `Orders.CapturePayment`, `Orders.PreviewPrice`, `Orders.SpawnRenewals`,
  `Orders.CancelSubscription` and the invoice render boundary that `Orders.GenerateInvoice` and
  `Orders.SendDocument` share each refuse it, because a quote, a renewal pass, an invoice or a payment
  silently answered for today is wrong with nothing to notice. A day given as a real `Date` rather
  than a string is still accepted everywhere the interface promises one: only text is validated.

  Two source guards cover all five packages — core-entities-server, entities, orders-ng, orders-server
  and the integration harness. One fails if any file stamps a column the migrations declare as `DATE`
  from a bare `new Date()`; the other fails on "a day in hand, else the clock" under any binding name,
  which is the spelling that twice reached a date column through a differently-named variable. Sites
  that cannot be driven in a unit test are pinned positively to the expression they must use.

  No schema change: a `DATE` column is read from UTC parts and written as UTC midnight. The business
  time zone decides only what "today" is.

- 19983f5: A scheduled order books only what it has invoiced (D92, golive #240).

  Confirming an order used to raise the whole contract value on the balance sheet the day it was signed. For a three-year contract billed annually that put three years of receivable there before anyone had billed a penny, and it made Deferred Revenue mean "contract value" rather than "billing ahead of performance". Now the order and its schedule stay in the subledger and the GL records what happened: billed, collected, earned.

  A company billed by instalment books no value at confirm except the instalments already due on the order date, which confirm issues through the same act a person triggers later — `IssueInstalment`, one function, so the document number, the stamps and the entry are identical whichever route raised them. Each remaining instalment is booked when it is invoiced.

  Every order line now carries `BilledToDate` and `RecognizedToDate` (migration `V202609230400`, with this app's CodeGen output folded below the banner). The gap between them is the line's balance-sheet position, and two ordering rules follow from it: invoicing credits **Unbilled Receivable first**, up to the line's `max(0, R − B)`, then Deferred; recognising debits **Deferred first**, up to `max(0, B − R)`, then Unbilled. That is `SplitContraLegs` in `ContractBalance.ts`, and its test walks all nine steps of Andrew's Scenario 4 including the backward slide from 45% to 40%. The totals are stored signed, so an origin line and its reversals net to zero, and they are advanced by the same transactions that book the entries — a separate writer is how a total drifts from the ledger it summarises.

  Unbilled Receivable now means what the standard means by a contract asset: service delivered that the contract does not yet let us bill. That is a different thing from the future instalments the superseded D89 revision parked in the same account.

  An order with no payment schedule — dues, events, and everything the go-live conversion brings in — books exactly what it booked before, asserted on the entry's shape rather than its totals. A gift card sold to a company billed by instalment is refused with an explanation rather than guessed at. An entry that needs an Unbilled Receivable leg is refused when the company has no Unbilled Receivable account linked, rather than posted to Deferred Revenue (golive #261), so a company billed by instalment cannot confirm an order with an up-front line, or issue an instalment against earned-but-unbilled revenue, until that link exists. And a cancelled instalment no longer gives its document number back (golive #242): Bill.com 422s on a duplicate and archiving keeps the number reserved, so the count includes cancelled rows and issuing refuses a number already held by a sibling.

### Patch Changes

- 5630121: Keep the order-line edit veto registry in MJ's global object store instead of a module-scoped
  variable, so every copy of `orders-entities` loaded in one process shares one registry.

  Before this, a host that resolved two copies of the package could register the veto into one and
  look it up in the other, and the veto would never run. That forced cross-repo consumers to pin this
  package exactly. They can now depend on it with a range. `RegisterOrderLineEditVeto` and
  `HostOrderLineEditVeto` keep their signatures.

## 5.16.0

### Minor Changes

- 2e9e3dd: `V202609221500__DimensionDefault` could not apply on any host but the one it was generated from.

  It seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against the hardcoded
  `EntityFieldID` `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField IDs per host, so that
  GUID exists only on the authoring database. Everywhere else:

            The INSERT statement conflicted with the FOREIGN KEY constraint
            "FK_EntityFieldValue_EntityField"

  which aborts the entire migration. On AIDP Next stage it killed the 5.15.0 upgrade at batch 19 of 30
  and left the app registered `Error`.

  **This is a regression of the 5.11.0 fix** — same GUID, same five values — which corrected the identical
  defect in `V202609061900`. Regenerating a migration from the authoring database re-emitted the hardcoded
  ID, and nothing in CI catches it.

  The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` + `EntityField.Name =
'FulfillmentStatus'`), with a `THROW` if genuinely absent rather than a silent no-op. Each value is
  guarded independently on `(EntityFieldID, Value)` and on its own row ID, so a host carrying some of them
  already — which includes every host that ran the 5.11.0 fix — keeps its rows and gains only what is
  missing.

  Edited in place rather than superseded, because a later migration cannot rescue this one: it aborts the
  run before anything after it executes. No host carries a checksum for it, since it cannot have applied
  successfully anywhere but the authoring database.

## 5.15.0

### Minor Changes

- 09624cb: Derive an order line's GL dimensions instead of waiting for someone to type them.

  An order line could already state ONE dimension tag by hand. The chart-of-accounts design needs five
  axes on a revenue line and needs them with no human in the loop, which is what
  MemberJunction/bc-aidp-next-golive#236 actually asks for. This adds the derivation.

  `DimensionDefault` is the product half of the mapping: polymorphic over Product, ProductCategory,
  ProductType and Company and date-effective, so it is resolved by the same precedence
  `GLAccountResolver` already walks for accounts — product, its category and that category's
  ancestors, its product type, then the line's company. Most specific wins **per dimension** rather
  than per walk, so a category can supply Venture while the product supplies Product and both land on
  the line. That is what lets a venture be stated once instead of copied onto every product.

  Two axes cannot come from a mapping table, because they are facts about the line rather than the
  product. ARR-Type reads the subscription decision the save already carries — `CreateNew` is New,
  `ExtendExisting` and `Reactivate` are Renewal — rather than `SubscriptionTerm.TermNumber`, which is
  not written until later in the same save. Vintage reads the event's own year, in UTC, so an event
  starting just after midnight is not filed under the previous year by a server west of the venue.
  Both resolve by CODE, because the ids are minted per environment by whatever pulls the dimensions
  out of Business Central; a missing dimension or value yields no tag rather than a guess.

  The derived values are written as `OrderLineDimension` child rows, so a line can carry all five
  axes. `OrderLine.DimensionID` / `DimensionValueID` become the **human override**: `MergeLineDimensions`
  already gives the column precedence over a child row naming the same axis, so setting a tag by hand
  overrules what was derived for that one axis and nothing else. Where the product mapping and a
  line-level rule name the same axis, the rule wins — it was computed from this line.

  Stamping is diffed rather than delete-and-reinsert, so saving an unchanged order writes nothing to
  the change log, and booked lines are skipped because their tags are what the journal entry already
  carries. The whole pass leaves early when no `Dimension` rows exist at all, which is every
  environment until the ERP sync has run — so this ships inert and starts working when the dimensions
  arrive.

  Nothing here refuses a booking. An unmapped product yields no tags and books untagged, which is the
  state every line was in before this existed; refusing would turn a half-configured mapping into an
  outage across every order.

- 21167e2: Order Headers: stop emitting the geocoding columns, so the view and the generated types agree again.

  `Entity.SupportsGeoCoding` was set on Order Headers at some point, so CodeGen emitted `__mj_Latitude` /
  `__mj_Longitude` into `vwOrderHeadersGenerated` along with a join to `[__mj].[vwRecordGeoCodes]`. The
  generated TypeScript was later regenerated with the flag off, dropping both fields from the entity and
  GraphQL types — but **CodeGen only adds geo columns, it never removes them**, so the view kept them.

  Between 5.13.0 and 5.14.0 the two halves diverged:

  |                         | `__mj_Latitude` |
  | ----------------------- | --------------- |
  | 5.13.0 generated code   | present         |
  | 5.14.0 generated code   | **gone**        |
  | the view, both releases | present         |

  A client builds its query from live `__mj.EntityField` metadata, which reflects the **view**, so it asks
  for `_mj__Latitude` (GraphQL reserves a leading `__`). The API type, built from the generated code, has
  no such field:

      Cannot query field "_mj__Latitude" on type "mjBizAppsOrdersOrderHeader_"

  Single-record load and save on Order Headers both fail. Grids keep working, because views do not go
  through the generated type — which is what made it look like a deployment problem rather than a
  packaging one. Reported as MemberJunction/bc-aidp-next-golive#251; root cause in #238.

  **The view loses the columns rather than the generated code regaining them.** Order Headers has no use
  for geocoding and the columns have never carried a value — 120 rows on the reporting host, none with a
  latitude.

  Both statements in the migration are required, and neither is sufficient alone: clearing the flag leaves
  the existing columns in place, and recreating the view without also clearing the flag lets the next
  CodeGen run add them straight back. `AutoUpdateSupportsGeoCoding` is cleared too, so the flag is not
  re-derived.

  The recreated view is the CodeGen output from `V202609061900` minus exactly the two select expressions
  and the `vwRecordGeoCodes` join, so a later regeneration against a host with the flag off is a no-op.
  `CREATE OR ALTER` because the view exists on every installed host.

- 7ec08da: Payment schedules on the order header (golive #239, plan D85–D88, W1/W4–W8). New `OrderHeaderPaymentSchedule` table: one row per instalment with a stamped `CompanyID`, its own `AmountPaid`/`Balance` rollup, and invoice identity (`DocumentNumber`, `InvoicedAt`, `InvoicedByUserID`, `JournalEntryID`) frozen at invoicing; `ExternalSystem`/`ExternalInvoiceRef`/`SentAt` for the outbound integration to write. `PaymentLine.OrderHeaderPaymentScheduleID` aims a payment at one instalment; unnamed payments cascade oldest-due-first. `vwOrderHeaders` gains `NextDueDate` and `IsOverdue` ages on it. New operations `Orders.IssueInstalmentInvoice` (freeze number, stamp, advance; idempotent; calls the AR-reclass seam AIDP-25 fills) and `Orders.GetBillingWorklist` (instalments due with no invoice), with a Billing worklist page on the Receivables rail. Confirm refuses a schedule that does not tie to the lines, naming the shortfall. Per-instalment invoice documents via `PaymentScheduleID` on `Orders.GenerateInvoice`. An order with no schedule behaves exactly as before.
- 5293c47: Make the order line price picker mean what it says, and require a reason for an override.

  The picker behind the pencil had three faults in one control (MemberJunction/bc-aidp-next-golive#253).
  Its Default row did nothing: the option's value was the empty string, and the `<select>`'s bound
  value was applied before its conditional options existed, so the browser fell back to the first row
  — Default — while the component still believed the line was on a custom amount. Choosing Default was
  then choosing what the DOM already had, and no change event fired. Selection is now bound per option
  and Default carries a real sentinel value.

  The "overridden" badge stuck after a return to list price, because every named-rule pick set
  `PriceOverridden` whether or not the pick differed from the default. The flag is now derived: a pick
  or a typed amount that lands on the engine default restores the default and clears the flag, the
  reason and any custom amount; only a price that actually deviates is flagged. A saved line put back
  on Default is stamped with the rules' answer rather than its stored baseline, which may itself have
  been the override.

  To make that comparison exact, `Orders.PriceOrder` now reports, per line, the rule that produced the
  price (`ProductPriceID`) and the engine's default (`Default`: unit price, rule id, rule name) — for
  a pinned line too. `OrderPricingService` gains `IncludeDefaultsForStatedLines`, an opt-in that
  resolves the rules for a stated line without stamping it and reports the answer in `EngineDefaults`;
  the save path does not set it. With the default known by id, the picker no longer lists the rule the
  engine already chose: Default is that rule, named and priced, and a product with one applicable rule
  offers Default and Custom amount alone.

  `PriceOverrideReason` is now required when `PriceOverridden` is set. The order line's `ValidateAsync`
  refuses the save with "Enter a reason for the price override", and the panel marks the explanation
  required and keeps Done disabled until it has text. The rule fires only when the override itself is
  being written — a new line, or a saved one whose price or override fields changed — so lines
  converted from the previous system, which carry overridden prices with no reason, stay loadable and
  editable for everything else. No database constraint; the field's metadata description now says it
  is required when the price is overridden.

### Patch Changes

- 426e730: A discount can be recorded on an order line.

  `OrderLine` has carried `DiscountPct` and `DiscountAmount` since the baseline, the booking entry has
  had a Sales Discounts leg driven by both since the baseline, and `SalesAuthority` has existed to gate
  who may grant one. Nothing in the product could reach any of it: the only control on a line was the
  price picker, and a price override is different economics. An override says the price was different;
  a discount says the list price held and value was given away, and only the second is reportable as
  discounting. The Sales Discounts account could therefore only ever hold figures the Business Central
  conversion put there. That is MemberJunction/bc-aidp-next-golive#252.

  The control is a Discount block inside the price editor, drawn apart from the price picker on
  purpose. It takes a percentage or an amount — one concession expressed two ways, resolved to one
  number by `ManualDiscountAmount` before anything judges it — a mandatory reason, and it shows what is
  left to discount as you type. It writes no discount field. It stages an unsaved row on
  `Order.Adjustments`, which is the channel `OrderEntityServer` already drains at save time, so the
  concession goes through `AuthorizeManualDiscount` and leaves an adjustment row naming the line, the
  reason, the authority that permitted it and any approver. A discount written straight onto the line
  would produce the same number with none of that.

  Four defects in the engine had to be fixed for that channel to work, none of which could surface
  before something used it:

  A discount aimed at ONE line silently became an order-level one. The pricing walk keys lines
  positionally — an unsaved line has no key yet — so a caller naming a real `OrderLine.ID` matched
  nothing, and an unmatched target fell through to the order-level branch and was allocated pro-rata
  across every line on the order. `Orders.PriceOrder` had the same fault by a different route: its
  input names a target by `LineIndex` and passed it through under a field the engine reads as an id.
  Both spellings now resolve, and a line this order does not have is refused rather than widened.

  The preview ignored `DiscountPct` outright. Both pricing paths computed a line's net as
  `gross − DiscountAmount` while `OrderLineEntityServer` and the journal entry apply the percentage, so
  a line carrying one was quoted at a figure the ledger would never book. Converted orders carry that
  field today, so this was live before anything in the product could set it. Both paths now go through
  `NetAfterDiscount`, which is the function the line itself uses.

  A second discount replaced the first. The stamp assigns `DiscountAmount`, which is correct for a run
  that decided every discount on the line and wrong for a manual one that knows only about the new
  request — the stored figure was erased while the earlier adjustment rows survived describing money
  the line no longer showed. The running total is now seeded with what the line already carries, so
  concessions accumulate, and a second one is judged against what is LEFT rather than against the
  original line value. Stacking to a free line one authorized slice at a time is no longer possible.

  A discount larger than the thing it discounts was accepted. It floored the net at zero and, for a
  zero or negative amount, failed at `CK_OrderAdjustment_Amount` — a constraint name, to someone who
  had typed a number. Both are refused with a sentence now.

  A fifth was the header-only shortcut in `OrderEntityServer.Save`, which asks whether the LINES are
  dirty. Staging a request touches no line, so the flow a person actually runs — open a saved draft,
  discount a line, save — skipped the drain, the authorization and the stamp, and handed the staged row
  to the graph as an ordinary related record: an adjustment with no authority, no allocation and no
  change to the line. The shortcut now also asks whether anything is staged. Staged CHARGES had the
  same hole and are covered by the same clause; nothing caught either, because every existing check
  composes an order and confirms it in one go, which always takes the full walk.

  Two things are deliberately not here. Removing a discount that has already been saved needs reversal
  semantics on the adjustment rows and is not in this change — the control removes a staged request
  only. An over-cap discount is blocked on screen rather than escalated, because the approval routing
  it would escalate into is MemberJunction/bc-aidp-next-golive#222 and does not exist yet.

  **This ships inert without data.** `AuthorizeManualDiscount` refuses a user who holds no
  `SalesAuthority`, on the rule that absence is not permission, so the control tells such a user what is
  missing instead of offering a concession the save would refuse. Authority rows for the reps, and one
  `SalesRule` of type `DiscountLimit`, are configuration someone has to create.

- c869137: A confirmed order containing a subscription or membership line can be returned again.

  Service-period inheritance for reversal lines landed separately and is already on `next`; this
  carries the rest of what that defect needs.

  The recognition CADENCE is now inherited too. The window says which months a reversal covers; it
  does not say how they are cut, and that arrived separately through a map built only where terms are
  created — a path a reversal never takes — so it fell back to one month. A quarterly or annual
  subscription therefore unwound into more, smaller releases than it was sold with: the year netted to
  zero while every month inside it was wrong, which no balance check can see. The cadence now comes
  from the `SubscriptionTerm` the origin line bought rather than from the product's current rules, so
  re-pointing a product at a different subscription type cannot restate an outstanding return. This
  half also fixes `Orders.CancelSubscription`, whose reversal lines had the same gap.

  Two further defects on the Return page, both found while tracing the first:

  - Reversal lines were written with a POSITIVE quantity. The sign is the switch the journal entry
    factory reads to decide whether to mirror an entry, so a return booked the sale's entry — debiting
    the customer again for goods coming back — while the document was labelled a credit memo and the
    entitlements were revoked. Every other caller writes it negative.
  - The per-line maximum ignored prior returns, because the page hard-coded them to zero. It now asks
    the new read-only `Orders.GetPriorReturns` operation, which answers from the same rule the server
    refuses an over-return with: reversals sum across orders, and Draft and Voided returns do not
    count. The server always enforced the real cap, so this was a display fault, not a hole.

## 5.14.0

### Minor Changes

- bc6588e: Order Date defaults to today in the business time zone, "overdue" is judged against it, and the
  Orders/Payments dashboards' day bars no longer disagree with themselves (bc-aidp-next-golive#168).

  An order entered at 9 PM Eastern on the 27th was dated the 28th: `new Date()` is an instant and an
  instant serialises in UTC. `OrderDate` now defaults to `TodayAsDateValue()`, the business calendar
  day pinned to UTC midnight, on the entity, in checkout and in the overdue worklist's "as of" default.
  `Today()` and `LocalDay()` in `date-cell.ts` read the zone from bizapps-common's
  `BusinessTimeZoneEngine` instead of the browser. `vwOrderHeaders.IsOverdue` compares `DueDate`
  against `bt.Today` from `fnBusinessToday()` rather than `CAST(GETUTCDATE() AS date)`, and the view
  text is now emitted by `OverdueViewSQL()` with a test that the committed migration matches it.

  That same `LocalDay()` switch from the browser's zone to the business zone exposed a latent bug in
  the Orders and Payments dashboards: each "last 7 days" bar chart keyed its bars by business day but
  labelled them with the viewer's own local weekday, so a viewer sitting in a different zone than the
  business one saw a bar labelled with one day counting another day's rows. Both dashboards now build
  their bars with a shared `BuildDayBars` helper that derives the label from the same calendar-day key
  used to filter, so the two cannot diverge.

  Requires `@mj-biz-apps/common-entities` 5.43.0.

- 2ce84d1: Expands EventProduct with EventFormat and VirtualMeetingUrl, and expands EventOrderLine with AttendanceStatus, Badge tracking/overrides, TicketTier, TableAssignment, SpecialRequests, and CheckInNotes.
- e1f4e15: Let an order line state a GL dimension, and carry it down to the journal entry.

  `OrderJournalEntryFactory` has ridden dimension tags onto every journal entry line an order line
  produces since the baseline — the AR debit, the revenue or deferred credit, the discount debit, each
  charge and tax credit, and both legs of every recognition release. But nothing ever tagged an order
  line, so every order-originated entry reached the ledger carrying none, silently and permanently:
  the line freezes once `JournalEntryID` is stamped (MemberJunction/bc-aidp-next-golive#236).

  `OrderLine` gains nullable `DimensionID` and `DimensionValueID`, both foreign-keyed into
  `__mj_BizAppsAccounting`. Both, not one: a dimension names the axis and the value names the point on
  it, and a journal entry line's tag is the pair — so a dimension id alone could not be passed down.
  `CK_OrderLine_DimensionPair` makes "both or neither" a database rule, and
  `OrderLineEntityServer.ValidateAsync` reports it in words before the constraint has to.

  A details button on each line card opens a slide-in panel holding the two pickers, with values read
  from accounting as they stand on the order's own date — `DimensionValue` is effective-dated, and a
  back-dated order has to offer the values that were live when it was placed. Changing the dimension
  clears the value, because a value belongs to exactly one axis. A booked line shows its tag
  read-only.

  The factory now merges the line's column tag with any `OrderLineDimension` child rows, with the
  column winning on its own axis: accounting refuses a journal entry line tagged twice on one
  dimension, so a conflict would otherwise fail the whole booking rather than show itself.

  Three migrations, and none is optional: the columns, then the CodeGen output for them (EntityField
  registrations, the rebuilt `vwOrderLines`, `spCreateOrderLine` and `spUpdateOrderLine`, and the
  rebuilt `vwEventOrderLines` for the IS-A child). A host's `mj.config.cjs` carries this app's schema
  in `excludeSchemas`, so `mj codegen` on a host will register the fields in metadata but will not
  rebuild the view or the procedures — leaving an entity that declares fields its base view cannot
  produce, which reads as "no data" rather than an error.

  Note the shape this fixes and the shape it does not: one tag per line means a revenue line can be
  filed under Venture **or** Product **or** ARR-Type, not all of them. The chart-of-accounts design
  asks for five axes on a revenue line.

## 5.13.0

### Minor Changes

- 92f7e68: Order lines can now be frozen by the app that owns the record they were derived from.

  A line saved through a grid is validated by Orders' own rules and nothing else. Orders knows that a
  booked order takes corrections through reversal orders; what it cannot know is that some other app
  has a reason of its own to freeze the line.

  The case that prompted this (bc-aidp-next-golive#206 item 1): Sales closes a deal, the deal locks
  because a contract was derived from its terms, and the order's lines are exactly what that contract
  was derived from. A tester added a line to a Won deal through the "What's being sold" grid and it
  saved, because the deal's lock only runs when the DEAL is saved.

  **A seam rather than a lookup.** The obvious fix is for the order line to look up the deal. It is the
  wrong one: this package does not depend on Sales, and Sales depends on it. Reaching for
  `MJ_BizApps_Sales: Deals` here would invert the dependency chain and bake one consuming app's concept
  into the app every other consumer builds on. So Orders asks — `RegisterOrderLineEditVeto` — and the
  app with the stake answers.

  **Creates, updates AND deletes.** `refuseNewLineOnBookedOrder` returns early on `IsSaved`, because
  Orders' own booked rule is about adding to a booked order. A deal lock is not: a line that already
  exists is what the contract was derived from, so changing it after the close is the damaging case.
  `Delete()` never calls `ValidateAsync`, so it is overridden too — otherwise the grid's delete button
  would be the one way through a lock that refuses everything else, and deleting that line is the worst
  of the three, not the least.

  **A vetoer that throws has REFUSED.** Letting the exception escape would surface as an unhandled
  error on a grid; swallowing it and allowing the edit would let a frozen line change because the thing
  guarding it was briefly unreachable. Both paths resolve through one function so that case cannot be
  written correctly in one place and backwards in the other, and the refusal names the fault and says
  what did not happen.

  The registry is empty by default, so a host that does not run Sales pays nothing and refuses nothing.

  **Nothing registers into it yet, and that is why this merges first.** Sales resolves
  `orders-entities` from npm, so the Sales side cannot call `RegisterOrderLineEditVeto` until this has
  shipped. Inert on every host until it does; golive#206 item 1 is not closed until Sales registers one.

  **Orders own writes go past the check.** It is asked on every save of a line, and Orders saves lines
  constantly after a deal is won — fulfilment, the journal entry id once the order books, bundle
  quantity ripples, the reversal line on a subscription cancel. The vetoer is handed an order id, a
  line id and create/update/delete, so it cannot tell those from a person typing in a grid; the
  distinction is made where it is known, by `MarkAsOrdersOwnWrite`. The deal close itself was never
  affected, because the deal server confirms the order before writing the Won status — everything
  after the close would have been.

  **The WHOLE-ORDER path is scoped to booking, not exempted.** A line reaches the database two ways: on
  its own, which is what the deal form's grid does, and as part of the order graph, header and lines
  together, which is what the deal workspace does. An earlier revision set the bypass unconditionally in
  the graph loops, on the reasoning that it belongs wherever `BypassBookedCheck` is set. That put the
  reported defect back on a different screen: the grid refused a line on a Won deal while the workspace
  saved the whole order and was never asked. The two flags part company there — `BypassBookedCheck`
  means "the header already ran the booked rule", which is true, and `BypassExternalEditVeto` means
  "this write is Orders' own", which that loop cannot claim, since it runs on any header save with dirty
  lines. It is now `this.bookingInFlight`: booking is Orders confirming its own order, and nothing at the
  header level runs the external veto. `deleteRemovedLines` gets the same treatment — it set no bypass
  at all, so a veto during a booking-time removal would have refused the close that creates the record
  being protected.

  **THE VETO IS ASKED ONCE PER LINE, and a vetoer that reads the database has to expect that.**
  Every line save asks, so one order-graph save of a five-line order consults it six times (measured, not reasoned). A fifty-line order asks fifty times. That is the right shape — each
  line is a separate write and a vetoer is entitled to answer differently per line — but it means an
  implementation that looks a record up per call will issue one query per line. The context carries
  `OrderHeaderID`, which is the natural key to cache on for the life of a request. Written down here
  because it is an expectation on the CONSUMER that no signature expresses.

  **The vetoer is handed a user.** It has to read something to answer, and on the server that read
  needs one. It matters more than usual because the seam fails closed: a vetoer that throws for want of
  a user would refuse every line edit on every order.

  29 tests. Six of them drive `OrderLineEntityServer` itself rather than the registry, which is how a
  refused DELETE was found to throw instead of refusing: it assigned onto `LatestResult`, and core
  returns null from that getter on an entity that was loaded and never saved — while typing it
  non-null, so nothing caught it.

  All three graph loops are covered, not just the one the defect was reported on. The save loop and the
  removal loop are each driven for real, in both directions; the subscription loop is held by a
  structural check, because reaching it needs a provider, a user and a decisions map, which would test
  the harness rather than the rule. That check asserts the one property all three share and any fourth
  loop would inherit: the bypass is never assigned unconditionally, which is the exact shape of the
  defect found in review.

  Writing those turned up a write this description was already claiming: the journal entry id, stamped
  once the order books. `resolveOrderLineForStamp` walks UP the IS-A chain, so what gets saved is the
  parent Order Line of an Event or Subscription line — an object no graph loop has touched, as is a line
  loaded fresh because it was not in `this.Lines`. Nothing refuses it today, since Sales confirms the
  order before writing the Won status and the freeze is not yet in place, but that is an ordering in
  another repository and this write has no reason to depend on it. It is marked now, and driven.

  Each of the six mutants — one per loop, dropping and inverting the removal loop's assignment, and
  unmarking the stamp — fails the suite.

## 5.12.2

## 5.12.1

## 5.12.0

### Minor Changes

- b8b2131: Fix PaymentLines query to use vwPaymentLines view with user permissions, expose \_mj**Latitude / \_mj**Longitude in GraphQL schema, and forward-heal Event Products IS-A parent fields.
- e9bf1f9: Forward-heal missing EntityField registrations for Price Tiers (ProductPrice) and Product Categories (RootParentProductCategoryID, ParentProductCategoryIDDepth, ParentProductCategoryIDPath, ParentProductCategoryIDIsLeaf, ParentProductCategoryIDChildCount).
- ecbfe69: Support prospective subtype resolution with SubtypeSelector and EnsureISAChild for OrderLine extension entities.

## 5.11.0

### Minor Changes

- a6ad8c5: `V202609061900` could not apply on any host but the one it was generated from.

  The migration seeds five `EntityFieldValue` rows for `OrderLine.FulfillmentStatus` against a
  hardcoded `EntityFieldID` — `F04330BA-4A37-4674-A2FE-237CE04E2C52`. CodeGen mints EntityField
  IDs per host, so that GUID exists only on the authoring database. Everywhere else the insert
  hits `FK_EntityFieldValue_EntityField` and aborts the whole migration at batch 8 of 233,
  taking the rest of the 5.10.0 upgrade with it — and, because `mj app upgrade` resolves
  dependencies to latest, blocking every app that depends on orders too.

  The field is now resolved by natural key (`Entity.BaseTable = 'OrderLine'` +
  `EntityField.Name = 'FulfillmentStatus'`), with a `THROW` if it is genuinely absent rather
  than a silent no-op. Each of the five values is guarded independently on
  `(EntityFieldID, Value)`, so a host that already carries some of them keeps its own rows and
  IDs and only gains the missing ones — an install that had Fulfilled/Pending/Returned gains
  NotApplicable and PartiallyFulfilled and nothing else moves.

  The file is edited in place rather than superseded: it has never applied successfully
  anywhere except the authoring database, so no host carries a checksum for it.

## 5.10.0

### Minor Changes

- 76b3d3e: Forward CodeGen remainder for V202609031400 (ProductPrice.Name / ProductCategoryID / Applicability). That file added the columns and SPs but omitted EntityField inserts. Recaptured on a clean DB with includeSchemas limited to \_\_mj_BizAppsOrders; the migration is the full SQL log, not a subset.

## 5.9.0

### Minor Changes

- e121d98: Rebuild `vwEventOrderLines` so Event Order Lines can be read again.

  `EventOrderLine` IS-A `OrderLine`, and its base view lists every inherited column explicitly.
  5.7.0 added `PriceOverridden` / `PriceOverrideReason` to `OrderLine` and rebuilt `vwOrderLines`,
  but nothing rebuilt the **child** IS-A view — so it still carried the pre-5.7.0 parent column list.

  CodeGen cannot heal this: a host's `mj.config.cjs` carries this app's schema in `excludeSchemas`
  (written back on every `mj app install`/`upgrade`), because the BizApps apps own their own views.
  So CodeGen registers the inherited fields on the child entity and then reports them as unreadable.

  The failure is quiet, which is the dangerous part: every read of the entity fails with
  "column … does not exist", and a grid renders that as **"no data"** rather than an error — Event
  Order Lines looks empty while its table is full.

  `vwEventOrderLines` is the only IS-A child of `OrderLine` in this schema, verified against a live
  database where these were the only two unreadable fields across every `__mj_BizApps*` entity.

## 5.8.0

### Minor Changes

- 2981938: Stop the PriceOverride metadata seed hard-coding EntityField `Sequence`.

  `V202609041600` inserted `PriceOverridden` and `PriceOverrideReason` at Sequence **43** and **44** —
  whatever happened to be free on the authoring database. On AIDP stage 42/43/44 are held by
  `ParentOrderLineIDPath`, `ParentOrderLineIDIsLeaf` and `ParentOrderLineIDChildCount`: CodeGen
  hierarchy virtuals, which exist per host depending on schema shape. The insert hit
  `UQ_EntityField_EntityID_Sequence` and the 5.7.0 upgrade stopped at batch 1/10, taking sales down
  with it as a dependent.

  Both values are now `MAX(Sequence) + 1`, evaluated per host. The two inserts are separate
  statements, so the second sees the first.

## 5.7.0

### Minor Changes

- bbb5171: OrdersEngine now caches Products, Product Prices, Product Categories, Product Types, Subscription Types, and Revenue Recognition Types (@RegisterForStartup). Confirm, pricing, checkout, fulfilment, and the catalog picker read those arrays instead of per-call RunView. Confirm looks up rev-rec types by normalized ID and inherits ProductType.DefaultRevenueRecognitionTypeID when the product left it blank. GL Account Roles stay on AccountingEngineBase; booking no longer force-refreshes that cache. Confirm also inherits ProductType.DefaultSubscriptionTypeID when the product left SubscriptionTypeID blank. `@mj-biz-apps/accounting-engine-base` is a real dependency of orders-core-entities-server (static import, declared in package.json), not a peer. Local filter-eval helpers are PascalCase (`EvaluateFilter`, `IsCompositeFilter`, `ParseFilterField`). Order-line price override is a pencil that expands a named-price picker (custom amount only when Custom is selected) plus Override Explanation when the price diverges from default. OrderLine gains PriceOverridden and PriceOverrideReason. Ship/bill addresses bind AddressID from the party; custom addresses can be linked onto the person/org profile.
- bb9a5f2: Ship the three price-override Authorizations to hosts.

  `metadata/authorizations/.price-override.json` declares `MJ.BizApps.Orders.Price.Override` and its
  two children, but metadata is a dev-time source — the install engine never reads that directory, so
  records reach a host only through a migration. Without one the price-override permission checks
  would find no authorization to test against anywhere but the developer's own database, and
  `scripts/check-release-seed-coverage.mjs` blocked the release saying exactly that.

  The seed guards on **ID or Name**, because `__mj.Authorization` carries `UQ_Authorization` on
  `Name`: on a host that created these via `mj sync push`, MJ assigned its own IDs, so an ID-only
  guard passes and the insert then trips the unique constraint. The children resolve their parent by
  name rather than by the literal ID for the same reason.

### Patch Changes

- a436049: License declarations now agree on BUSL-1.1 everywhere.

  The manifest was corrected earlier; the README badge still advertised ISC, which is the
  first license statement a reader meets and outranked `LICENSE`, `package.json`,
  `mj-app.json` and every workspace package in practice. The badge now reads BUSL-1.1 and
  links to `LICENSE`.

- 4dfa35c: Unbreak the build: `FieldIsDirty` was called but never defined.

  `next` has not compiled since #155. Nine call sites across Entities and Angular call
  `BaseEntity.FieldIsDirty(...)`, which **does not exist in MemberJunction** — a code search across
  the whole MJ repo finds nothing, and 6.1.0-edge.5 is the newest edge. `orders-entities` failed to
  compile, which cascaded into `orders-core-entities-server` as dozens of "has no exported member"
  errors.

  Adds `anyFieldIsDirty(entity, names)` over MJ's real API (`GetFieldByName(name)?.Dirty`) and a
  `FieldIsDirty(...names)` method on `OrderLineEntity` and `OrderHeaderEntity`. Call sites holding a
  _generated_ entity type — `Lines.Items`, and the Angular services — go through the helper directly,
  since the generated class has no such method.

  Also fixes two unrelated breaks in the same run: `Products$`/`ProductPrices$` had no explicit
  return type, so TypeScript could not name the inferred `Observable` (TS2742) — `rxjs` is now a
  declared dependency rather than a transitive one — and `CreateEmptyFilter` was imported with the
  wrong casing (`createEmptyFilter`).

## 5.6.0

## 5.5.0

### Minor Changes

- 24f8625: Stop the Metadata_Sync seed from writing host-owned user rows, and guard the rest by natural key.

  The generated seed contained two `spCreateUserApplication` calls for specific developer accounts.
  `UserApplication` is not declared as metadata by this app — there is no `metadata/user-applications`
  directory and `metadata/applications/.mj-sync.json` declares no related entity for it. It was
  captured incidentally by the SQL log that generated the file, because the shared user views in
  `metadata/user-views/` hardcode an owning `UserID`. MJ creates `UserApplication` itself when a user
  is granted an application, so seeding it forced one deployment's user nav onto every other host and
  collided with the row the host had already made under its own ID. Those two statements are removed.

  The remaining creates are guarded on `[ID]` **or** the table's natural key, generated from the live
  unique-constraint definitions (including the filter predicate for the six filtered indexes). A host
  that acquired a row under a different ID is now skipped rather than colliding. No error is
  swallowed: a genuine failure still aborts the migration.

## 5.4.0

### Minor Changes

- d29cc6c: Make the Metadata_Sync migration idempotent — it cannot upgrade a host that ever ran `mj sync push`.

  `V202609020400__v5.3.x__Metadata_Sync.sql` fails on the first record against any database that already
  holds this app's metadata:

  ```
  Migration failed for schema '__mj_BizAppsOrders': Failed at batch 1/248 (lines 1-83):
  Violation of PRIMARY KEY constraint 'PK_RevenueRecognitionType'.
  The duplicate key value is (a1d4e7b0-3c62-4f85-9a17-2b3c4d5e6f01).
  ```

  That is not a hypothetical. It is what an upgrade hits on AIDP stage, where **78 of the 91 declared
  metadata primaryKeys already exist** because somebody ran `mj sync push` against that database
  directly — the stopgap `docs/database-migrations.md` explicitly sanctions ("If a consumer needs it
  sooner, a one-off `mj sync push` against the target environment bridges the gap"). The seed was
  generated against a clean database, so every `spCreate*` is an unguarded INSERT.

  Neither skipping nor deleting works: skipping leaves the 13 genuinely-missing rows uncreated, and the
  78 that exist include `ProductType` / `PaymentType` rows that live order data references by FK.

  All **154** `spCreate*` calls are now wrapped:

  ```sql
  IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RevenueRecognitionType] WHERE [ID] = @ID_83a57164)
  EXEC [${flyway:defaultSchema}].spCreateRevenueRecognitionType @ID = @ID_83a57164, ...
  ```

  so the migration creates what is missing and steps over what is already there. The 93 `spUpdate*` calls
  are untouched — they target rows CodeGen already made and are naturally re-runnable.

  Verified both directions on SQL Server 2022 with MJ core v6.1.0-edge.5:

  - **Existing metadata** (the AIDP case, colliding ID present): applies cleanly, and twice more, with
    row counts unchanged.
  - **Fresh install** (core 69 + common 22 + tasks 7 + accounting 8 + orders 16): still seeds everything
    — Application 1, Remote Operations 44, ProductType 11, PaymentType 11, both party-order queries.
    Release seed coverage still passes.

  Minor, not patch: this repo requires a minor-or-higher bump for any change under `migrations/`
  (`changes_and_migrations` enforces it), and the rule holds here — on a host that took the sanctioned
  `mj sync push` shortcut this migration now _does_ something it previously could not, creating the rows
  that were missing. On a fresh install its effect is unchanged.

## 5.3.0

### Minor Changes

- 406bcaa: First `Metadata_Sync` migration for bizapps-orders — the app's seed metadata now actually ships.

  `bizapps-orders` has never had one. `plans/entitlement-read-contract.md` said so outright: *"There is
  no `*Metadata_Sync*.sql`in`migrations/`, and no migration inserts a `RemoteOperation` row."* Since
  `mj-app.json`'s `metadata.directory` is a dev-time pointer the install engine never reads, and
  `mj app install` applies migrations and nothing else, all 25 directories under `metadata/` shipped
  nowhere: a clean install produced every table, view and CRUD proc, and no Application row, no Actions,
  no Remote Operations, and none of the seeded lookups — with every install step reporting success.

  `V202609020400__v5.3.x__Metadata_Sync.sql` carries 279 records (134 created, 93 updated, 0 errors),
  generated by `mj sync push --dir metadata --ci` against a database built from migrations only —
  MJ core v6.1.0-edge.5, common, tasks, accounting, then this app.

  Also fixes `metadata/.mj-sync.json`'s `directoryOrder`, which omitted every category directory. With
  `queries` sorting before `query-categories`, the push aborted on
  `Lookup failed: No record found in 'MJ: Query Categories' where Name='Orders'` — so the seed could not
  be generated at all until the order was corrected.

  Minor, not patch: this release carries a migration.

### Patch Changes

- 4fcc102: Move to MJ `6.1.0-edge.5`, and raise the cross-repo dependency floors that were resolving to ancient releases.

  69 `@memberjunction/*` pins move `^6.1.0-edge.4` → `^6.1.0-edge.5`.

  **The floors are the real fix.** `@mj-biz-apps/accounting-*` was declared `>=0.1.0`, and as a _peer_
  dependency pnpm resolved it to the lowest satisfying version — `accounting-server@0.1.0`, whose own MJ
  dependencies are `edge.3`. So a tree that declared edge.5 everywhere still pulled **48** MJ packages at
  edge.2/3/4 through one ancient sibling. `@mj-biz-apps/tasks-entities` was worse: pinned **exactly** at
  `1.2.3`.

  Floors now match what is actually published, which is the convention this repo already stated when it
  moved to edge.4 ("app dependency floors to the latest releases, read from npm at cut time"):

  |                                 | was                       | now        |
  | ------------------------------- | ------------------------- | ---------- |
  | `accounting-*`                  | `>=0.1.0`                 | `>=0.5.0`  |
  | `common-entities` / `common-ng` | `>=0.1.0`, `>=5.35.0`     | `>=5.37.0` |
  | `tasks-entities`                | `1.2.3` (exact), `^1.2.3` | `>=1.4.1`  |

  Verified after a clean install: `accounting-actions` resolves 0.5.0 (was 0.1.0), a single
  `@memberjunction/core` at edge.5, build 6/6, and 1441 unit tests passing.

  Some MJ packages still resolve at edge.3/4 through `common-ng@5.37.0` and `accounting-*@0.5.0`, which
  are themselves published against older edges. That clears when those repos republish — their edge.5
  bumps are open alongside this one.

## 5.2.1

## 5.2.0

### Minor Changes

- 2daf9b9: Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
- 94af4e5: Platform floor to MJ 6.1.0-edge.4 and app dependency floors to the latest
  releases, read from npm at cut time: bizapps-common >=5.36.0,
  bizapps-accounting >=0.4.0, bizapps-tasks >=1.4.0. Every @memberjunction/\*
  dependency now pins ^6.1.0-edge.4 — caret, never exact: orders-ng's exact
  ng-hierarchy-tree pin forced two MJ copies into consumers' Explorer trees and
  split the ClassFactory registry (consumers carried a root override to undo it).
- d0e5450: Scope CodeGen heal EXECs with authored excludeSchemas plus `@IncludedSchemaNames` for the Orders schema, instead of photographing sibling Open Apps. Strip Common Activity Types field inserts and the unscoped field-from-schema heal that broke from-scratch migrate.

### Patch Changes

- e21ad46: Host the Angular checkout widget as an Angular Element on `GET /checkout/:slug`, retrieve Stripe intent status on complete (localhost has no webhook), skip a second confirmCardPayment when the intent already succeeded, and book `Orders.CapturePayment` after confirm so AmountPaid / PaymentHeader land without waiting for Stripe to POST. Stripe Capture treats an already-captured automatic-capture intent as success.
- 07e0b10: Checkout hardening wave: fix the blocking defects and ship the anonymous edge.

  Defect fixes in CheckoutSessionService:

  - The payer Person is now resolved (find-or-create by the session's captured email) at
    completion and stamped onto the session and the order's BillTo/ShipTo — previously every
    widget order failed OrderHeaderEntity.Validate() with no customer.
  - A session acquires a payment intent through the new OpenPaymentIntentForSession (amount
    from the session's server-priced snapshot, provider from the widget's Configuration
    paymentProviderId); the completion gate now verifies the intent's STATE (Succeeded, as
    advanced by the signature-verified webhook) and that its amount covers the re-priced
    total — mere existence of an intent id no longer books an order.
  - The GuestOrder claim mint uses the real IdentityClaimEngineServer import (the previous
    MJGlobal.ClassRegistry duck-type was dead code) and passes the entity GUID.
  - EntitlementGrantClaimDriver.OnRevoke stamps RevokedAt + RevocationReason (the generated
    validation rule rejected Revoked-without-RevokedAt, so revocations silently no-oped) and
    failures are logged instead of swallowed; OnExpire logs failed saves.

  Session hardening:

  - ClientSessionKey is re-verified (constant-time) on every mutating call; ExpiresAt is
    enforced past initialization (expired sessions transition to Expired); completion is
    replay-safe (a Confirmed session returns its existing order) and never reverts to Open
    once the order has committed; server-side quantity/line caps apply when unconfigured;
    hand-rolled SQL escaping replaced with the sql-guards helpers; secret-shaped keys are
    stripped from the Configuration returned to anonymous callers; Person rows are no longer
    minted on the draft path; the platform-specific GETUTCDATE() filter is now portable.

  The anonymous checkout edge (new):

  - CheckoutServerExtension (DriverClass 'OrdersCheckoutEdge') mounts pre-auth REST routes
    POST /checkout/{initialize,draft,payment-intent,complete} via the serverExtensions
    mechanism, with fail-closed gates: body cap, per-IP(+slug) rate limiting, per-widget
    origin allowlist (Configuration.allowedOrigins) with scoped CORS grants, and optional
    Cloudflare Turnstile (Configuration.requireTurnstile + Settings.TurnstileSecretEnvVar).
    Writes run as the configured ServiceUserEmail principal (system-user fallback). The
    claim-driver Load anchors are now called from LoadBizAppsOrdersServer so the drivers
    survive tree-shaking.

- c490929: Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
- 8ad33a8: Route `Orders.PreviewPrice` through `OrderPricingService` (the same walk save and `Orders.PriceOrder` use) instead of calling `ResolvePrice` directly. Price resolution now loads rules from every in-force list assigned to the customer, so a member list cannot lose to catalog `BCP-STD` when both assignments are Priority 0.

## 5.1.0

### Minor Changes

- c094b64: Add `CustomerPaymentTerms` — the terms a particular buyer negotiated

  Date-effective and optionally scoped to one selling company, keyed on organization or person the way
  `CustomerTaxExemption` and `CustomerPaymentMethod` already are. Not an IS-A extension of
  `AccountingCompanyProfile`: that profile IS-A `Company` and describes the SELLER, whereas a buyer
  here is an Organization or a Person — there is nothing to extend.

  Seeds the six standard `PaymentTermsType` rows the walk resolves against; the table had none.

- e468e73: Event Order Line attendee is a required Person. Organizer notes, collapsed embeds, Confirm as a verb, Check/ACH reference on the Payment tab, and Product.MaxQuantityPerLine (event tickets seed to 1 — more people means more lines).
- a09b96c: Person and Organization Orders/Payments/Subscriptions use L1 inclusion. Orders is one section over Bill-To OR Ship-To. Stored payment methods sit in More; tax exemptions, entitlements, intents, price-list assignments, promo codes, and stored value are None.
- be5005a: Payment Headers reversing-payment self-join is None, matching Order Headers.ReversesOrderHeaderID. Payments and Subscriptions already use left-nav; Order Headers stay on the custom compose form.
- 0ff52d7: Punch Bill-To Orders, Bill-To Payments, and held/beneficiary Subscriptions as FormRole Primary on People and Organizations so those grids stay first-class when the parent form's smart ranker folds the rest into More. DisplayName is Orders / Payments. Line-level Order Lines and Event Order Lines are DisplayInForm=false on Person and Org forms.
- 7d04b06: Upgrade MemberJunction from 5.50 to 6.1.0-edge.1, and declare four dependencies that were resolving
  by accident.

  The upgrade itself is clean: none of the APIs removed in 6.x — `BeginISATransaction` /
  `CommitISATransaction` / `RollbackISATransaction`, `BaseEntity.ProviderTransaction`,
  `PropagateTransactionToParents()` — had a single call site here. The 21 `BeginTransaction()` sites
  use the depth-counted primitive that survives and is now what IS-A chains use too.

  All five repos move together because `BaseEntity` became generic in 6.x (`BaseEntity<unknown>`), so
  a package still on 5.x consuming an entity class built against 6.x fails to compile.

  **Four undeclared dependencies surfaced**, each previously satisfied by a stale repo-level
  `node_modules` left over from a pre-workspace `npm install`. Once that hoisting was removed they
  stopped resolving, which is the correct behaviour and would have broken any standalone consumer too:

  - `@memberjunction/actions`, `@memberjunction/actions-base` and `@memberjunction/templates` are
    imported by `packages/Server` (the invoice, payment-intent and send-document actions) and were
    declared nowhere. Added as peer dependencies, matching that package's convention for MJ packages.
  - `@angular/cdk` is imported by the workspace tab strip in `packages/Angular` and was declared
    nowhere. Added as a peer at the `>=21.0.0 <22.0.0` range the rest of the workspace uses.

  Also declares `vitest` at the repo root, where `vitest.config.ts` lives. It was declared only in
  individual packages, so the repo-wide suite could not be launched from the root.

  Verified: 31 packages build clean, and the full unit suite passes — 39 files, 1062 tests.

- be5bcde: Commit ORD-WORLD as the shared integration catalog, and seed Product Types as app metadata.

  The suite no longer fabricates `IT-ORD-*` companies, people, or products on every bundle. ORD-00
  loads a CSV world through BaseEntity (Blue Cypress Press, Harbor House, Orphan Ledger; eight
  customer orgs; ~33 people; priced catalog) and later bundles book against it inside rolled-back
  transactions. Types (Product Type, Charge Type, Rev Rec, Subscription, Payment) are looked up from
  `metadata/`, never created by the fixture. Fast Entry hides leftover `IT-ORD-*` rows so they cannot
  show up as unpriced picks.

- c094b64: Resolve and store `OrderHeader.DueDate` from payment terms (D83)

  Nothing derived a due date. `DueDate` was only ever what a caller passed, `PaymentTermsType` had no
  rows, and `Orders.GetOverdueWorklist` returned zero rows against 67 orders carrying an unpaid
  balance — a collections screen reporting a quiet afternoon because its only input was null on every
  row.

  Adds a resolution walk (the third of this shape after GL accounts and price): stated `DueDate` →
  stated `PaymentTermsTypeID` → the buyer's `CustomerPaymentTerms` → the selling company's
  `AccountingCompanyProfile.DefaultPaymentTermsTypeID` (which existed and nothing read) → due on
  receipt. Resolved once at confirm and STORED, so aging, the worklist and the invoice all read one
  date instead of deriving three.

  Terms are deliberately not per-product: they are a property of the deal, and an order carrying a
  Net 30 and a Net 60 product has no coherent answer.

- 54b33f0: The custom Order Header form can collapse to customer + date + money so a large order gives its lines the vertical space. The expanded/collapsed preference lives in UserInfoEngine and applies only when opening an existing order — a new record always starts expanded. Leftover related (charges, adjustments, payment intents/lines) are inclusion None because the custom form already owns those surfaces.
- f4df491: Ship-to and bill-to on the order header can both collapse. Street addresses are owner-held embeds of Common Address (orphan on clear) and edit inline instead of a bare FK textbox.
- 78ae16a: Lift the pricing walk out of `OrderEntityServer` into `OrderPricingService`, and expose it as
  `Orders.PriceOrder` so a whole order can be priced without saving it.

  The walk — resolve each line's price, then promotions, then charges, then tax — was private methods
  on the entity reading its own fields. That meant the UI could not ask what an order would cost
  without saving one, and `Orders.PreviewPrice` could only answer for a single line, which its own
  description admits is advisory: promotions stack against ORDER totals, charges apportion ACROSS
  lines, and tax computes on the discounted amount.

  Now one implementation with two callers. `OrderEntityServer.Save()` prices before it persists;
  `Orders.PriceOrder` prices and persists nothing. The operation's input mirrors the entity shape
  rather than being a DTO, so the object the client prices is the object it later saves.

  Also adds section mapping to `OrderHeaderEntity` — which editing section a validation failure belongs
  to. Metadata-only logic, so the browser gets it without a round trip.

- c094b64: Enforce the order lifecycle: guard illegal status transitions in `OrderEntityServer.Save`

  `CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
  `Fulfilled → Draft` saved. `Voided → Confirmed` saved — a voided order could come back to life,
  keep the journal entries its reversal had already unwound, and be shipped, with every row valid and
  the constraint satisfied.

  New `OrderStatusBehavior` owns the transition table and the predicates six modules previously spelled
  out as ad-hoc string sets that had drifted apart (one of them guarded against `Cancelled`/`Canceled`,
  which are not legal order statuses at all). The guard runs in `Save`, the one path every write goes
  through, and refuses with a reason rather than a bare `false`.

- 6e6ec69: `PricingDriverClass` on Product, ProductCategory, ProductType and OrderCompanyPolicy, plus `ResolvePricingDriver` — the four-level walk that answers whether a given product prices from metadata alone or needs a server-side `BasePriceResolver` plugin. This is the seam client-side pricing needs: the metadata walk can run in the browser, a plugin cannot, and the client has to know which it is facing WITHOUT asking the server or the round trip defeats the point. Every uncertain case — a read that fails, a product that does not exist, an id that is not a UUID — resolves to ESCALATE, because escalating costs a round trip nobody notices while guessing costs a wrong price on screen that corrects itself at confirm.
- 49d9ef3: Promotion codes, charges and manual discounts can reach the engine from a browser again. They were transient arrays only the server could fill, so when `OrderDraft` was deleted the wire went with it: a code or a charge entered on screen was priced into the preview and then silently dropped at confirm, and the customer was billed a number the screen never showed. Charges and adjustments are now related-record collections — a client stages the row it is asking for and the engine completes it — and promotion codes are an `EntityCompanion`, because a code has no child row of its own and only the engine can turn one into an `OrderAdjustment`. Also fixes `ORDER_ENTITY = 'MJ_BizApps_Orders: Orders'`, an entity name that does not exist, used by every new-order and open-order path in the workspace. `MJOOrderEntryService` is now `MJOPricingScheduler` and holds only the debounce and the out-of-order guard; `SaveOrThrow`, `Confirm` and `LoadWithLines` moved onto `OrderHeaderEntity` where a non-Angular host can reach them.
- 6e8eba0: The pricing engine moves into the browser-safe package and the price strip runs it locally. `OrderPricingService`, `PriceResolver`, `PromotionEngine`, `TaxResolver`, `ChargeEngine`, `OrdersEngine` and the three behaviour modules — 3,716 lines — always could run on either tier: they use `RunView`, `IMetadataProvider` and `MJGlobal` and nothing else. They sat in the server package by convention, and that convention was the only thing making a price preview cost a round trip. An order with no promotion code and no custom pricing plugin now prices with no server call at all, from the SAME code the booking walk runs. Anything a plugin decides, or any promotion code, escalates to `Orders.PriceOrder` — plugins are server-side code the browser's class factory does not have, and redemption caps change with orders other people are placing.
- 389a381: Move order lines onto an MJ 6.1 related-record collection, and split the order rules across the two
  tiers.

  `Lines` is now declared as `EntityRelationship.RelatedRecordCollection` metadata, so CodeGen emits a
  typed accessor onto the GENERATED entity class and both tiers have it. That replaces a `_lines`
  array with a getter/setter pair that existed only on the server, and it is what lets the browser
  compose an order and ship the whole graph in one call.

  Adds `OrderHeaderEntity`, a shared client+server subclass holding every rule decidable without the
  database — the status-transition guard, the must-have-a-payer rule and the must-have-something-to-book
  rule — so the browser refuses those before a round trip and every other caller still gets them.
  `OrderStatusBehavior` moved down to the entities package with it (it was pure, with zero imports).

  Also fixes a cross-repo break: `AccountingCompanyProfile.DefaultPaymentTermsTypeID` was removed by
  bizapps-accounting (their issue #22, on the correct grounds that payment terms are an orders
  concern), and orders kept reading it — so every order whose customer had no negotiated terms failed
  the company-default step of the due-date walk. The column now lives on `OrderCompanyPolicy`.

  `ExpectedGrossTotal` on `Orders.ConfirmOrder` is now enforced. It was accepted and read by nothing.

- b6031e2: Remove `OrderDraft` and the four remote operations that existed only to carry it. `Orders.SaveOrder`, `Orders.ConfirmOrder`, `Orders.PreviewOrder` and `Orders.PreviewConfirm` are gone — composing and booking an order is `order.Save()` through MJ 6.1's entity graph, and pricing without writing is `Orders.PriceOrder`. `Orders.CreateOrderInState` is renamed to `Orders.AdvanceOrderState` and now takes an `OrderHeaderID`: it starts where the save finishes, and refuses an order that never booked rather than producing one that reads Fulfilled with no ledger behind it. A migration deletes the retired operation rows, because `mj sync push` only reconciles rows it is given and would leave them Active with no code behind them.
- c094b64: Retire `RevenueRecognitionSchedule`, `RevRecScheduleLine` and `OrderLine.RevenueRecognitionScheduleID` (D84)

  Kept as "the computed envelope for MRR/ARR display and the computation trail", and never written by
  anything — 14 lines in the review seed carry a deferred recognition type and none had a schedule.

  Both purposes are already served by what recognition actually produces. The releases ARE a schedule:
  forward-dated, balanced and queryable in `JournalEntry`/`JournalEntryLine`, and the trail is those
  entries plus `OrderLinePriceComponent`. A second copy of the same facts is free to drift, and empty
  tables that look authoritative are worse than absent ones — a report writer finds them and assumes
  they are the source of truth. Forecasting belongs in an FP&A layer, not beside the ledger.

  Revenue recognition itself is unchanged; `RevenueRecognitionType` and the forward-dated entries stay.

- 72e0e8e: Subscription form rail: Terms (renamed from Coverage Terms) then Deferred Revenue then Entitlement Grants, via relationship and contribution sortKey.

### Patch Changes

- 933075e: Follow accounting's JournalEntryBatch rename in the seeded journal-entry types

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

- 319f76e: A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
- b32c32a: Confirm-after-draft loads Lines and writes them before Status flips.

  A GraphQL form save reloads the header only. Changing Status to Confirmed then
  walked an empty collection, created no membership term, and EvenOverTime
  refused. Existing draft lines were then UPDATEd after the header was already
  Confirmed, so trigger 51003 rolled back inside INSERT-EXEC.

  `OrderHeaderEntity.EnsureLinesLoaded` is the shared read. The server persists
  prorated line money while the header is still Draft, then flips Status.

- 4cbd90e: Read date cells through `ToISODate` instead of `String(cell).slice(0, 10)`, which yields
  `'Thu Jul 30'` for a `Date` and compares as less than nothing. Fixes two all-zero dashboard charts,
  a year column reading `'Mon '`, and an expired tax-exemption certificate that never warned.
- fad54cb: PaymentDetail is an owner-held 1:1 embed on the wallet, payment header, and order intent FK. Booking and capture skip related collections so the detail persists with the header.
- 5b379d1: Realign the cross-app references so orders installs onto an empty database

  Orders could not be installed from zero at all, and it had never been noticed: an incrementally-built
  instance already carries the rows and views the baseline expects, so the defect is invisible until
  the database is wiped.

  Orders is downstream, and both breaks are ours — upstream moved deliberately and our generated tail
  kept pointing at where things used to be. Nothing in accounting or common is changed.

  The baseline writes EntityFields and an EntityRelationship against accounting's `Dimension Values`,
  `Dimensions` and `Journal Entries` entities but never creates them — it expects accounting to, by ID.
  Accounting re-minted those IDs when it re-baked, so the insert failed on
  `FK_EntityRelationship_EntityID`. Separately, our generated views joined
  `__mj_BizAppsCommon.vwPeopleExtended`, which common retired once `Person.DisplayName` became a
  computed column; the join target is now `vwPeople`, which carries it.

  All ten cross-app references were audited rather than only the one that failed — common's other three
  and MJ core's four are still valid and were left alone.

  **This will recur.** The tail hardcodes upstream entity IDs, so every upstream re-bake re-mints them
  and silently breaks the from-zero install again while every existing instance keeps working. The
  durable fix is to resolve cross-app entities by schema and table name instead of embedding a GUID.

- 0db0276: Archive the historical design plans and document how the running system actually works. README and code comments now point at `docs/HOW_THE_SYSTEM_WORKS.md` instead of treating the master plan as current schema.
- 79bb2b3: A check number typed on Fast Entry never reached confirm.

  `InitialPaymentTypeID` and `InitialPaymentAmount` are columns and already crossed
  the wire. The reference is not a column — it lives on `PaymentDetail` after
  confirm — so both screens kept it as page state. The server only looked at
  `InitialPaymentDetailID`, which Fast Entry never set, and refused with
  "Check payments need a reference number".

  The typed number now rides `Order.InitialPaymentReference` (a companion, like
  promotion codes). Confirm creates the `PaymentDetail` from it and attaches that
  to the payment.

- 25c6b24: Declare BUSL-1.1 in mj-app.json. The LICENSE file and every package
  already state BUSL-1.1; the app manifest still said ISC, so anything
  reading the manifest saw the wrong license.
- 797303e: Move to MemberJunction 6.1.0-edge.3, and make `orders-ng` loadable by Node.

  The workspace was on a half-applied edge.2 line: `@memberjunction/ng-hierarchy-tree` was pinned to
  `6.1.0-edge.2` while the peer ranges asked for `^6.1.0-edge.1`, and the two `@mj-biz-apps/common-*`
  dependencies were pinned to `5.33.2`, which predates the components this package imports. Both now
  point at versions that exist and agree: MJ at `6.1.0-edge.3`, common at `>=5.35.0`.

  `orders-ng` shipped ESM that only a bundler could load. It declares `"type": "module"`, but its
  build was `ngc` alone — and `tsconfig.angular.json` sets `"moduleResolution": "bundler"`, which
  permits extensionless relative specifiers and emits them verbatim. Node's ESM resolver rejects
  those, so `import('@mj-biz-apps/orders-ng')` failed with `ERR_MODULE_NOT_FOUND` naming a file that
  was present in the package. 274 of the 346 relative specifiers in `dist` were affected, 19 of them
  emitted by ngc itself for template component references, which no source-level change can reach.

  The fix is the one the rest of this workspace already used: run `tsc-alias -f`
  (`--resolveFullPaths`) after the build. The other five `orders-*` packages build with
  `tsc && tsc-alias -f` and have zero extensionless specifiers; the Angular package builds with `ngc`
  and was the only one that skipped it. Adding it takes `dist` to 0 extensionless and 0 unresolvable
  specifiers with no source changes.

  Test-side, eight Angular suites could not load at all, and had been invisible while CI was failing
  earlier in the job. Same root cause, in dependencies rather than here: every BizApps `*-ng` package
  has this defect (`accounting-ng` 218 specifiers, `common-ng` 81, `tasks-ng` 64). `vitest.config.ts`
  now inlines those so Vite resolves them instead of Node — the real modules stay in the graph, so
  unlike the `accounting-engine-base` alias beside it, nothing is stubbed and the class-registration
  assertions still test real registrations.

  Verified: 31 packages build clean; 64 test files, 1232 tests pass.

- f59a6fb: Stop treating save-populated fields as user errors on a new order.

  `Validate()` was refusing every unsaved draft with "Order Number cannot be null"
  (and the same for a new line's UnitPrice / CompanyID). Those values are minted
  or stamped by `OrderEntityServer.Save()`, so Fast Entry and the editor — both
  of which gate Confirm on `Validate()` — disabled the button on a complete order.
  A new header also defaults `OrderDate` to today so Fast Entry, which has no date
  control, can confirm.

- f4cce15: State the overdue rule once, in `overdue.ts`, and have `GetOverdueWorklist` read it. Three surfaces
  derived it independently and only one excluded a voided order — so a voided order with a stale
  balance appeared on collections lists as money owed.
- 6e50c38: Migrate the workspace from npm to pnpm and remove the MJAPI/MJExplorer dev harness,
  mirroring bizapps-tasks and bizapps-accounting. No published package's code, types,
  metadata or migrations change — build tooling only, hence a patch.

  `packageManager` moves to `pnpm@10.33.0`; npm-only files/keys are dropped; CI workflows
  move to pnpm; the load-bearing workspace settings mirror MJ core (`linkWorkspacePackages`,
  `onlyBuiltDependencies`). The npm `overrides` move to pnpm-workspace.yaml with the stale
  `@memberjunction/core|global ^5.50.0` pins corrected to `^6.1.0-edge.1` — those stale pins
  were orders#60's root cause, and the `apps/` tree they were holding together is deleted here.
  The npm-era `link:local` / `postinstall` / `.mj-links.json` local-linker is deleted: MJ 6.x
  workspace linking is how cross-app source dependencies resolve now. `mj:migrate` gains
  `--schema __mj_BizAppsOrders --dir ./migrations` (bare `mj migrate` silently applied
  nothing — same fix as tasks and accounting).

  **A real pnpm-lock.yaml is committed.** Two things previously made that impossible: the
  workspace root's devDependencies pinned the unpublished `@mj-biz-apps/accounting-*`
  packages (for the root integration harnesses), and pnpm 10's default
  `autoInstallPeers: true` turns even optional peer ranges into fatal registry 404s. The
  root no longer declares the unpublished packages — the harnesses resolve accounting
  through `packages/IntegrationTests` (which declares them as peers) via
  `test-harnesses/resolve-app-packages.mjs` — and `auto-install-peers=false` is set in
  `.npmrc` with the reasoning in-file. Accounting staying unpublished is accepted WIP:
  install-based CI now installs cleanly from a bare checkout; the build leg that needs
  accounting stays red until it publishes.

  **Accounting is declared as a MANDATORY peer** (the `optional: true` markings are gone) —
  it is a hard runtime requirement and the manifests now say so. With auto-install-peers
  off, an unmet mandatory peer is an install warning, not a registry 404, so this is safe
  pre-publish (see `docs/dependency-on-accounting.md`). The MJ floor moves to
  `6.1.0-edge.2`, the edge release carrying the MJ#3734 UserCache relocation this repo's
  imports were fixed for.

  Verified: all six packages build green as workspace members against MJ next
  alongside bizapps-common, bizapps-tasks and bizapps-accounting, and
  `pnpm install --frozen-lockfile` from the registry succeeds on a bare copy.

- 65b60a9: Default price/tax/secret resolvers are intentionally registered with no ClassFactory key. Mark those registrations so Explorer/MJAPI stop warning at boot, and probe for a plugin key before CreateInstance so the walk does not fall back (and warn) on every Product/Category/Company miss.
