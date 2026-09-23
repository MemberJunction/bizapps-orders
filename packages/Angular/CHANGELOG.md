# @mj-biz-apps/orders-ng

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

### Patch Changes

- Updated dependencies [2e9e3dd]
  - @mj-biz-apps/orders-entities@5.16.0

## 5.15.0

### Minor Changes

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

- 381d610: The Product form's Accounting section now badges on the left rail when Company or Revenue
  Recognition Type is missing, before a save and after a failed one.

  Both columns are NOT NULL, so a new product cannot be saved without them, yet the rail put an error
  badge only on Details (Product Type, Product Category) and left Accounting clean. The section's four
  fields were declared inside the widget component's own template, and MemberJunction's collapsible
  panel reads its fields through a content query that cannot see past a child component's view. A
  section that sees no fields reports no required-and-empty count and claims none of the field-named
  errors a failed save publishes, so the two errors were left with no rail item to land on.

  The fields are now declared in the panel template and projected into the widget, the same shape the
  Fulfillment and Subscription sections already use. The widget keeps rendering the GL links.

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

- Updated dependencies [09624cb]
- Updated dependencies [426e730]
- Updated dependencies [21167e2]
- Updated dependencies [7ec08da]
- Updated dependencies [5293c47]
- Updated dependencies [c869137]
  - @mj-biz-apps/orders-entities@5.15.0

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

### Patch Changes

- 7207f3c: Add an Order chip to the Subscription form header.

  A subscription booked from an order stored only `OrderLineID`, and the only way back was the Order
  Line ID field in the Subscription Overview panel — which opens the LINE. Reaching the order meant
  opening the line and navigating up from there, which a UAT tester hit while ordering a subscription
  product (MemberJunction/bc-aidp-next-golive#228).

  The header now carries a related-records chip that opens the order directly, showing its order
  number rather than an id. The Order Line ID field is unchanged: it answers a different question —
  which line of the order bought this — and remains the way to the line.

  Built on `bizapps-related-chips` from `@mj-biz-apps/common-ng` rather than a chip of this app's own,
  so the resolve-and-hide rules are the shared ones: no chip for an order this user cannot read or
  that is not there, never an id in place of a name, and ctrl/cmd-click opens a new tab. That raises
  the `@mj-biz-apps/common-ng` floor to `>=5.44.0`, the release that introduces the component.

  A subscription stores no `OrderID`, so the chip names the order by a filter through `vwOrderLines`
  rather than by id — the reverse-link case the shared component exists to cover. The one consequence
  worth knowing: a read that throws drops the chip instead of rendering it unresolved, because the
  failed read also cost us the id to open.

- Updated dependencies [bc6588e]
- Updated dependencies [2ce84d1]
- Updated dependencies [e1f4e15]
  - @mj-biz-apps/orders-entities@5.14.0

## 5.13.0

### Patch Changes

- 2f2895b: Format Balance as currency on every Orders grid the app hosts.

  The grid renders a money column as currency only when the column declares
  `format: { type: 'currency' }` or its field name matches the core name heuristic
  (`amount`/`price`/`cost`/`total`). `TotalGross` matches that heuristic and `Balance` does not, so
  grids with no column state of their own — All Orders, and the dashboard's Active Orders, Orders
  Explorer and Overdue Collections panes — showed Total with a dollar sign and Balance as a raw
  number, as did Overdue one-time orders, the customer A/R open-items list and the account-credit
  picker. All seven now share `MJO_ORDER_HEADER_GRID_STATE`, which declares the currency format for
  both columns, so the formatting no longer depends on the field's name.

  Binding that state also changes the column set on those grids, deliberately. They previously rendered the entity's
  `DefaultInView` fields; they now render the eight columns of the "Orders: Working" saved view, so
  Payment Status and Bill To Person no longer appear and a positive balance is highlighted amber.

- 1d66218: Let the Product form edit Name, SKU and Description again.

  The Product hero header registers `replacesSectionKey: 'productIdentification'`, which tells MJ's
  form chrome to hide the generated section outright — no rail item, no entry in Manage Sections, no
  way back through the section search or the layout toggles. That section is the only place Name, SKU
  and Description render, and the hero showed them read-only: Name as an `<h1>`, SKU as a chip,
  Description nowhere at all. Name is required, so no product could be created and none could be
  renamed; the rail's error badge counted errors in a panel nobody could open.

  The hero now renders those three fields as real inputs when the form is in edit mode, and shows the
  description when it is not — the same contract the Common People and Organizations identity headers
  already honor. Claiming a generated section means owning its fields, so a test now asserts that the
  header renders every field of the section it claims.

- Updated dependencies [92f7e68]
  - @mj-biz-apps/orders-entities@5.13.0

## 5.12.2

### Patch Changes

- b20af95: Search the whole active catalog from the add-product box on an order line, rank the results, and give each row its own company.

  `GetCatalogOptions()` asked `GetProducts()` for 500 rows, and `GetProducts()` applied that cap by sorting the catalog by name and slicing — **before** any search ran. So on a catalog over 500 active products, everything sorting past the 500th name was unreachable from the picker no matter what an order taker typed, and nothing on screen said a product had been withheld. The cap bought nothing: `OrdersEngine` already loads the entire Products table into memory (`IgnoreMaxRows: true`, as every BaseEngine dataset does), so the slice only discarded rows the browser was already holding. `MaxRows` is now optional on `GetProducts()` and unbounded when omitted; a caller that genuinely wants a short list still passes one. `GetSellingCompanies()` loses the cap for the same reason and a sharper one — it derives companies from which companies own products, so the cap did not shorten that list, it dropped companies whose products all sorted past the 500th, and a company missing there cannot raise an order.

  Matching was `includes()` with no ranking, so typing `sum` put "Executive Summary Report" level with "Summit Ticket" in whatever order the catalog array arrived in. The new `RankCatalogMatches()` orders by name-starts-with, then SKU-starts-with, then contains; within a tier the order's own selling company comes first, then alphabetically. Relevance outranks company deliberately: cross-company selling is intended — BCC sells SoundPost products — so company is a disambiguator between similar names, not a filter, and burying an exact name match under every own-company partial match would hide the row someone typed out in full. The function is pure and exported so the ordering is testable without Angular.

  Each picker row now carries its company as its own marked element rather than as the third item in a muted "SKU · type · company" run, flagged when it differs from the order's selling company — the same test `ShowsForeignRevenue()` already applied to lines already added, so the label someone chose by is still there afterwards. Cross-company products keep appearing; they are marked, never hidden.

- 7c16e2d: Rewrite the Orders app's on-screen copy in plain business language, applying the screen-by-screen
  replacement list from bc-aidp-next-golive#210: section subtitles and rail descriptions, the Orders
  and Payments dashboards, the fulfillment, returns, refund, account-credit, customer A/R, overdue,
  subscriptions, products and pricing pages, the order document, and the shared allocation grid,
  journal-entry preview, order-stage notes and price badge. Headings now name what a panel shows and
  helper text says what the screen does; the design-rationale explanations are removed.
  - @mj-biz-apps/orders-entities@5.12.2

## 5.12.1

### Patch Changes

- b1159b5: Confirm before saving an event product whose effective revenue recognition type is not deferred, and fix the accounting widget's field layout so the revenue recognition picker is usable.
- c85f402: Resolve the product header and overview lookup names (type, category, rev-rec, successor) from their ids instead of the record's virtual name columns, which load null and go stale after a save.
  - @mj-biz-apps/orders-entities@5.12.1

## 5.12.0

### Minor Changes

- b8b2131: Fix PaymentLines query to use vwPaymentLines view with user permissions, expose \_mj**Latitude / \_mj**Longitude in GraphQL schema, and forward-heal Event Products IS-A parent fields.
- ecbfe69: Support prospective subtype resolution with SubtypeSelector and EnsureISAChild for OrderLine extension entities.

### Patch Changes

- 9c7680d: The Order Line form could not open once the price-override authorizations were seeded.

  `overrideKindFromLiveRoles` filters `MJ: Authorization Roles` to find out whether the current
  user may override a price. Its `ExtraFilter` referenced `Authorization` unbracketed, and
  `Authorization` is a RESERVED T-SQL keyword, so SQL Server rejected the entire statement:

      Incorrect syntax near the keyword 'Authorization'.

  The generated select list brackets the column (`[Authorization]`); only this hand-written
  filter did not, which is why nothing caught it.

  The bug has been present since the price-override feature shipped, but was unreachable: the
  call is gated on `priceOverrideCatalogInstalled()`, so on a host without the authorization
  catalog the query never ran. Seeding the three `MJ.BizApps.Orders.Price.*` authorizations
  switches the path on — so the form breaks on exactly the hosts that adopt the feature.

  `[RoleID]` and `[Type]` are bracketed in the same filter for consistency; neither is reserved,
  so neither was failing.

- 6a33597: Shows the order accounting tab gross, over every origin, with an As-of date and a date-basis toggle.

  The rolled-up view netted debits against credits per account and then dropped any account that came out at zero, with no idea what date anything was effective. On an event order the forward-dated recognition entry cancelled the booking credit, so the Deferred Revenue row disappeared and the screen read `Dr AR 895 / Cr Sales 895` — revenue on screen for an event that has not happened. It now sums debits and credits separately and keeps every account, so the money is visibly parked in deferred revenue and released into sales.

  Both views also now gather entries from every origin that affects the order — order lines, their subscription terms, payment allocation lines and the payment header fee entry — rather than from order lines alone, which had been hiding every membership recognition entry and every payment entry. A payment shared across orders shows its fee entry in full on each, labelled rather than pro-rated. An optional As-of date (blank by default, meaning the whole life of the order) and an Effective/Posting date basis apply to Rolled up and By line together, and By line now lists each entry unnetted with its batch, batch status and posting date. The Rev-Rec waterfall is unchanged.

- 888983a: Name the price rule that actually won on the order line instead of labelling every resolved price "base price". The winning rule's name already reached the browser as the resolution walk's `Base`/`Rule` component label and was being discarded, so a line priced off a member list read as base-priced. Also fixes both component mappers, which read a field named `Kind` where the resolver emits `ComponentType`, and names the rule (with a currency symbol) in the override picker's `Default` row.
- 9b63bf1: Honor a term start stated on a subscription order line instead of always deriving it from the order date (#121). `OrderDate` remains the booking date and still dates the booking journal entry; a `ServicePeriodStart` set on the line now starts the term on that date, with the subscription type's rules computing the end (and any anchored-period proration) from it. An extension continues existing coverage as before, and reports a stated start only when the term genuinely begins on a different date. The order line editor gains a "Term start" field on subscription lines that shows the order date as its default and offers a reset back to it; on a line renewing live coverage the field is read-only and shows the date the term will actually begin, since a renewal continues where existing coverage ends.
- Updated dependencies [b8b2131]
- Updated dependencies [e9bf1f9]
- Updated dependencies [ecbfe69]
  - @mj-biz-apps/orders-entities@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a6ad8c5]
  - @mj-biz-apps/orders-entities@5.11.0

## 5.10.0

### Patch Changes

- ba21e1a: Make "Manage columns" work on the Catalog grids by hosting them in `mj-view-workspace`.

  The kebab item was a dead control. `mj-entity-data-grid` does not own a column-management UI — it
  raises `ManageColumnsRequested`, the grid renderer forwards it as `configureRequested`, and
  `mj-entity-viewer` re-emits it as `ConfigureRequested`. The Catalog pages dropped
  `<mj-entity-viewer>` straight into their templates and subscribed to none of that, so the chain
  ended at an emitter with no listener: the menu closed and nothing happened, with no error anywhere
  to say why.

  `mj-view-workspace` is the host that closes the chain. It binds `(ConfigureRequested)` and owns
  `mj-view-config-panel`, where columns, sort and filters are actually chosen. All four Catalog grids
  (products, charge types, price rules, promotions) now go through it.

  The workspace brings its saved-view toolbar with it, so those grids also gain a view selector, a
  view-type switcher and view save/duplicate/delete. `AutoSaveView` is `true`, so the workspace
  persists view CRUD itself against `MJ: User Views` — a host that only forwarded the events would
  have replaced one dead control with several.

- 7b71dbc: Product form: the Subscription and Fulfillment sections no longer render a bare header when every field in them is empty, and the three widget panels stop duplicating the generated Catalog Lifecycle, Subscription and Entitlements, and Financial and Accounting sections. Status moves onto Fulfillment and CompanyID onto Accounting so no field is lost.
- Updated dependencies [76b3d3e]
  - @mj-biz-apps/orders-entities@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [e121d98]
  - @mj-biz-apps/orders-entities@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [2981938]
  - @mj-biz-apps/orders-entities@5.8.0

## 5.7.0

### Minor Changes

- bbb5171: OrdersEngine now caches Products, Product Prices, Product Categories, Product Types, Subscription Types, and Revenue Recognition Types (@RegisterForStartup). Confirm, pricing, checkout, fulfilment, and the catalog picker read those arrays instead of per-call RunView. Confirm looks up rev-rec types by normalized ID and inherits ProductType.DefaultRevenueRecognitionTypeID when the product left it blank. GL Account Roles stay on AccountingEngineBase; booking no longer force-refreshes that cache. Confirm also inherits ProductType.DefaultSubscriptionTypeID when the product left SubscriptionTypeID blank. `@mj-biz-apps/accounting-engine-base` is a real dependency of orders-core-entities-server (static import, declared in package.json), not a peer. Local filter-eval helpers are PascalCase (`EvaluateFilter`, `IsCompositeFilter`, `ParseFilterField`). Order-line price override is a pencil that expands a named-price picker (custom amount only when Custom is selected) plus Override Explanation when the price diverges from default. OrderLine gains PriceOverridden and PriceOverrideReason. Ship/bill addresses bind AddressID from the party; custom addresses can be linked onto the person/org profile.
- 71ed7c7: Order-line override explanation is registered in metadata (EntityField, vwOrderLines, CRUD procs) so it persists. The reason shows under the consequence chips in view mode. The "Revenue to X" chip is hidden when X is the order's selling company.

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

- Updated dependencies [a436049]
- Updated dependencies [bbb5171]
- Updated dependencies [bb9a5f2]
- Updated dependencies [4dfa35c]
  - @mj-biz-apps/orders-entities@5.7.0

## 5.6.0

### Minor Changes

- e48bc43: Stop the order Balance rendering as a dash, and stop it erasing itself (bc-aidp-next-golive#186).

  `TotalGross`, `AmountPaid`, `Balance` and `FulfillmentStatus` on `OrderHeader` are maintained by
  `spRecalcOrderHeaderTotals`, which the OrderLine and PaymentLine triggers fire. On a
  create-and-confirm the header is written before any line exists, so `Balance` is legitimately NULL
  at that moment — and `OrderEntityServer.Save()` never read the refreshed row back onto the entity.
  `SaveEntityGraphOperation` returns `root.GetAll()`, so the browser adopted that NULL, and
  `FormatMoney` renders NULL as an em-dash. A confirmed, unpaid $895 order therefore reported its
  balance as `—`, which in that formatter means "not computed", not "nothing owed".

  The stored value did not survive either. Every SP-parameter field is sent on the next update
  regardless of dirty state, and a nullable column carrying NULL emits `@<Col>_Clear=1`, which
  `spUpdateOrderHeader` obeys by writing NULL over the trigger's value; a stale `AmountPaid = 0` needs
  no flag at all to overwrite a captured payment. So editing anything on a confirmed order erased its
  totals — the figures payment allocation and the aging report read.

  - `OrderEntityServer` now adopts the row's rollups before `Save()` returns, on the full path (after
    lines, payments, entitlements, inside the transaction) and on the header-only shortcut, where the
    refresh exists to overwrite whatever the caller believed about those four columns before the
    update is sent.
  - The merge rule moved to `OrderRollupBehavior` and is explicit that the ROW wins, including when it
    reports NULL: a row saying "not computed yet" is more current than an entity's leftover figure.
  - The order form's Balance and Paid tiles no longer return a bare dash for a record that exists.
    `AmountPaid` is NOT NULL, and the balance falls back to the pricing preview's total less anything
    paid, so an unsaved draft shows real figures instead of two dashes.
  - `V202609021530__v0.1.x__Repair_OrderHeader_Rollups.sql` re-derives `TotalGross`, `AmountPaid` and
    `Balance` from lines and captured payments for the rows that disagree with them, repairing orders
    already erased. It deliberately leaves `FulfillmentStatus` alone: that column has unrelated drift
    from never being backfilled when it was added, and correcting it inside a money repair would
    quietly change what the fulfilment queue shows.

### Patch Changes

- @mj-biz-apps/orders-entities@5.6.0

## 5.5.0

### Patch Changes

- Updated dependencies [24f8625]
  - @mj-biz-apps/orders-entities@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d29cc6c]
  - @mj-biz-apps/orders-entities@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [4fcc102]
- Updated dependencies [406bcaa]
  - @mj-biz-apps/orders-entities@5.3.0

## 5.2.1

### Patch Changes

- 0149661: Product GL account links widget (#113).

  Products carried no revenue GL account, so every order line booked through the company
  default and nothing could be attributed per product. The Product form's accounting tab now
  embeds `product-gl-links`, which reads and writes the product's `GLAccountLink` rows by role,
  so a product can name its own revenue (and contra) accounts. The existing
  `product-accounting-widget` hands off to it rather than restating the same fields.

  Patch, not minor: this is Angular code only — no migration. A minor here would claim a schema
  change this release does not carry.

  NOT in this release: the `DefaultInView` / orders-working-view work merged in #128 is
  metadata-only (`metadata/entity-fields/.default-in-view.json`,
  `metadata/user-views/.orders-working-view.json`). `metadata/` reaches a host ONLY through a
  `*__Metadata_Sync.sql` migration, and this repo has none — so those rows ship to nobody until
  the build engineer generates one. See docs/database-migrations.md, "Metadata reaches a host
  only as a migration".

  - @mj-biz-apps/orders-entities@5.2.1

## 5.2.0

### Minor Changes

- c724132: Add CheckoutWidget, CheckoutWidgetDistribution, and CheckoutSession entities, embedded checkout widget component, and session management with atomic Compare-and-Swap state transitions and identity claiming.
- 2daf9b9: Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
- d0e5450: Scope CodeGen heal EXECs with authored excludeSchemas plus `@IncludedSchemaNames` for the Orders schema, instead of photographing sibling Open Apps. Strip Common Activity Types field inserts and the unscoped field-from-schema heal that broke from-scratch migrate.

### Patch Changes

- e21ad46: Host the Angular checkout widget as an Angular Element on `GET /checkout/:slug`, retrieve Stripe intent status on complete (localhost has no webhook), skip a second confirmCardPayment when the intent already succeeded, and book `Orders.CapturePayment` after confirm so AmountPaid / PaymentHeader land without waiting for Stripe to POST. Stripe Capture treats an already-captured automatic-capture intent as success.
- c490929: Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
- Updated dependencies [e21ad46]
- Updated dependencies [07e0b10]
- Updated dependencies [c490929]
- Updated dependencies [2daf9b9]
- Updated dependencies [94af4e5]
- Updated dependencies [d0e5450]
- Updated dependencies [8ad33a8]
  - @mj-biz-apps/orders-entities@5.2.0

## 5.1.0

### Minor Changes

- e468e73: Event Order Line attendee is a required Person. Organizer notes, collapsed embeds, Confirm as a verb, Check/ACH reference on the Payment tab, and Product.MaxQuantityPerLine (event tickets seed to 1 — more people means more lines).
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

- 54b33f0: The custom Order Header form can collapse to customer + date + money so a large order gives its lines the vertical space. The expanded/collapsed preference lives in UserInfoEngine and applies only when opening an existing order — a new record always starts expanded. Leftover related (charges, adjustments, payment intents/lines) are inclusion None because the custom form already owns those surfaces.
- 93c297d: Always-on identity banners and Overview-first left-nav sections for the major Orders catalogue, price/promo, payment, and subscription entities. Order Headers are left for a follow-up.
- 5b379d1: Render the approved UI, on MJ's design system instead of beside it

  The design Amith approved was written but never rendered: the stylesheet was never attached to a
  component, so the app shipped carrying the mockup's class names and none of its styles.

  Attaching it was the small half. The larger half was deleting what MJ already owns — banners are now
  `mj-alert` (43 of them), tabs are `mj-tab-nav`, inputs are MJ's own `mj-input` — so what remains in
  the kit is genuinely app-specific rather than a parallel copy of the design system. Every hardcoded
  hex became an `--mj-*` token, and the type scale bottoms out at `--mj-text-xs` (12px); smaller was
  rejected on accessibility grounds.

  Fixes the layout faults that came with never having rendered: sub-pages could not scroll, the page
  header reserved 29px for an always-empty toolbar, action bars floated mid-page instead of seating at
  the bottom, and non-interactive cards lifted on hover. Save errors were an undismissable wall of
  serialized JSON and now read as a sentence.

  Adds a unit test that fails the build when an `mjo-` class is used in a `.ts` or `.html` without
  being defined in the kit — it immediately caught a live `mj-search` typo that had been invisible.

- 95a4d5f: Lock the Order Header compose form (`ShowRelatedEntities: false`) so leftover related grids no longer appear under Lines. Payment Headers, Subscriptions, Subscription Terms, Products, Price Lists, and Promotions switch to the generated form plus contributions (identity headers, journals, term cards, rev-rec waterfall, catalog widgets, volume simulator) and left-nav chrome. Primary children stay first-class; satellite relationships go to More.
- 49d9ef3: Promotion codes, charges and manual discounts can reach the engine from a browser again. They were transient arrays only the server could fill, so when `OrderDraft` was deleted the wire went with it: a code or a charge entered on screen was priced into the preview and then silently dropped at confirm, and the customer was billed a number the screen never showed. Charges and adjustments are now related-record collections — a client stages the row it is asking for and the engine completes it — and promotion codes are an `EntityCompanion`, because a code has no child row of its own and only the engine can turn one into an `OrderAdjustment`. Also fixes `ORDER_ENTITY = 'MJ_BizApps_Orders: Orders'`, an entity name that does not exist, used by every new-order and open-order path in the workspace. `MJOOrderEntryService` is now `MJOPricingScheduler` and holds only the debounce and the out-of-order guard; `SaveOrThrow`, `Confirm` and `LoadWithLines` moved onto `OrderHeaderEntity` where a non-Angular host can reach them.
- 6e8eba0: The pricing engine moves into the browser-safe package and the price strip runs it locally. `OrderPricingService`, `PriceResolver`, `PromotionEngine`, `TaxResolver`, `ChargeEngine`, `OrdersEngine` and the three behaviour modules — 3,716 lines — always could run on either tier: they use `RunView`, `IMetadataProvider` and `MJGlobal` and nothing else. They sat in the server package by convention, and that convention was the only thing making a price preview cost a round trip. An order with no promotion code and no custom pricing plugin now prices with no server call at all, from the SAME code the booking walk runs. Anything a plugin decides, or any promotion code, escalates to `Orders.PriceOrder` — plugins are server-side code the browser's class factory does not have, and redemption caps change with orders other people are placing.
- b6031e2: Remove `OrderDraft` and the four remote operations that existed only to carry it. `Orders.SaveOrder`, `Orders.ConfirmOrder`, `Orders.PreviewOrder` and `Orders.PreviewConfirm` are gone — composing and booking an order is `order.Save()` through MJ 6.1's entity graph, and pricing without writing is `Orders.PriceOrder`. `Orders.CreateOrderInState` is renamed to `Orders.AdvanceOrderState` and now takes an `OrderHeaderID`: it starts where the save finishes, and refuses an order that never booked rather than producing one that reads Fulfilled with no ledger behind it. A migration deletes the retired operation rows, because `mj sync push` only reconciles rows it is given and would leave them Active with no code behind them.

### Patch Changes

- 319f76e: A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
- 210c335: Fix three "the button does nothing" bugs with one root cause

  Pages are created imperatively through `ViewContainerRef.createComponent`, so anything that
  should travel with a navigation has to be handed over explicitly. Nothing was.

  - **Clicking an order in All orders did nothing.** `showPage` re-inserted the cached page
    and returned before passing the pending record — so it worked exactly once, before the
    editor had ever been visited, and was silently inert every time after.
  - **"Open in full editor" did nothing.** The section received the emitted draft and
    discarded it, so escalation landed on an empty workspace with the half-typed order gone.
    It now adopts the same draft INSTANCE, which is what makes the handoff lossless.
  - **"Take a payment" showed the previous payment.** The cached page came back with its
    state and nothing could blank it. Pages that can start fresh now expose `Reset()`; the
    cached view is asked rather than destroyed, so a part-typed order is still safe.

  Also locks a captured payment read-only — three triggers make the database refuse edits, so
  live fields were inviting typing that could never save.

- b32c32a: One Order Header form for new and existing records.

  `BizAppsOrderHeaderFormComponent` extends the generated form and wins
  ClassFactory for `MJ_BizApps_Orders: Order Headers`. Bill-to / ship-to
  summaries, context tabs (payment, charges, accounting, subscriptions),
  and always-visible lines use MJ collapsible panels (UserInfoEngine via
  FormStateService) and entity-viewer lists for related records. The Orders
  dashboard/list open a record through NavigationService.OpenEntityRecord.

- fe01054: Custom Products form overrides the CodeGen layout via ClassFactory.

  `BizAppsProductFormComponent` extends the generated Products form and
  registers under `MJ_BizApps_Orders: Products` after the generated module
  loads, so Explorer opens the custom form (identification + prices panels,
  optional EventProduct IS-A extension) instead of the generated field list.

- 4cbd90e: Read date cells through `ToISODate` instead of `String(cell).slice(0, 10)`, which yields
  `'Thu Jul 30'` for a `Date` and compares as less than nothing. Fixes two all-zero dashboard charts,
  a year column reading `'Mon '`, and an expired tax-exemption certificate that never warned.
- 1d23637: A new Draft with no lines now mints OrderNumber instead of failing the insert. Subscriptions consume accounting-ng's deferred-revenue waterfall (the 3-column stub is gone) and label the rail Terms. Event-line extensions reload CompanyID/UnitPrice from the saved parent after the graph returns.
- 7af4949: feat(orders-ng): add ProductCategoryHierarchyPanel with @memberjunction/ng-hierarchy-tree

  - Adds `ProductCategoryHierarchyPanel` registered on `MJ_BizApps_Orders: Product Categories` in the `after-related` slot.
  - Visualizes multi-level product category and catalog hierarchies with smooth pan, zoom, real-time search, and focus.

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

- be5bcde: Commit ORD-WORLD as the shared integration catalog, and seed Product Types as app metadata.

  The suite no longer fabricates `IT-ORD-*` companies, people, or products on every bundle. ORD-00
  loads a CSV world through BaseEntity (Blue Cypress Press, Harbor House, Orphan Ledger; eight
  customer orgs; ~33 people; priced catalog) and later bundles book against it inside rolled-back
  transactions. Types (Product Type, Charge Type, Rev Rec, Subscription, Payment) are looked up from
  `metadata/`, never created by the fixture. Fast Entry hides leftover `IT-ORD-*` rows so they cannot
  show up as unpriced picks.

- 170af56: Order Header Accounting is a rolled-up journal (debits then credits, account code + dimensions) or the per-line grid — one view at a time. Charges, journals and subscriptions hide New; payments still offer it.
- f4df491: Ship-to and bill-to on the order header can both collapse. Street addresses are owner-held embeds of Common Address (orphan on clear) and edit inline instead of a bare FK textbox.
- 04a43fd: Order header Total / Paid / Balance drop `.00` when every visible amount is a whole dollar, and keep two decimals on all three if any has cents.
- 801cc99: Order lines introspect ProductType.OrderLineExtensionEntity: Simple shows required extension fields, Extended embeds the plugin form. Party and company links emit Navigate so Explorer opens the record; consequence chips keep their chrome.
- 6b7bbbe: Order header Ship To sits on the left and starts expanded; Bill To is a slim rail that takes the width when selected. Person and Organization Orders grids pass every filter join field as NewRecordValues so a new order is linked back to the party.
- 210c335: Make the full order editor able to take an order

  It was a viewer. Opening it without a record handed it an undefined draft, so every field
  rendered its "— none —" fallback; and even with a draft it could only REMOVE lines, never
  add one, so its empty state named a requirement it gave you no way to meet.

  Adds an order workspace — several orders open at once, one tab each, on the same
  `mj-workspace-card` accounting uses rather than a second implementation of it. "New order"
  mints a real draft. Adds the inputs that were missing: a product picker that adds lines,
  party pickers in place of printed GUIDs, and the order's own fields (type, dates, PO number,
  initial payment tender and amount).

  An existing order now opens with its number, its real stage, and READ-ONLY once past Draft.
  It had been opening as an editable Draft, which invited edits to money that is already
  booked and that the immutability triggers would refuse anyway.

- 72e0e8e: Subscription form rail: Terms (renamed from Coverage Terms) then Deferred Revenue then Entitlement Grants, via relationship and contribution sortKey.
- 210c335: Hand several hand-rolled controls back to MJ, and get under the accessibility floor fixed

  A UI review pass, all of it the same shape: the app had reimplemented something MJ already
  ships, slightly worse.

  - **Six native `<select>` elements become `mj-dropdown`** — they were rendering the operating
    system's own list, a different control per platform, ignoring the design tokens entirely.
  - **`.mj-table` handed back to MJ.** The kit restated `width` and `border-collapse`
    identically to MJ's and replaced its tokenised type with a hardcoded `13px`. Only what MJ
    does not do is kept: the sticky header, tabular numerics, the sort affordance and the row
    states.
  - **Eight permanent `mj-alert`s become quiet notes.** An alert is for something that
    HAPPENED; these explained how a screen works, permanently, in a full-width coloured card
    above the work. Conditional alerts were judged individually and left alone.
  - **The confirm banner became one line**, with each outstanding item a button that jumps to
    the tab that owns it — it had been a card restating what the tab dots already said.

  Sizes below the 12px accessibility floor are fixed where touched: the table header was
  10.5px, its secondary text 11.5px, the sort caret 9px. All now `--mj-text-xs`.

  Also: pickers open on focus and close on click-away or Escape, the party search is debounced
  (it fired a server round-trip per keystroke), the workspace card sits inset on a toned page,
  and the payments dashboard no longer leaves a card-shaped hole where a duplicated CSS rule
  had collapsed a three-card row into two columns.

- Updated dependencies [933075e]
- Updated dependencies [319f76e]
- Updated dependencies [b32c32a]
- Updated dependencies [c094b64]
- Updated dependencies [4cbd90e]
- Updated dependencies [fad54cb]
- Updated dependencies [e468e73]
- Updated dependencies [a09b96c]
- Updated dependencies [be5005a]
- Updated dependencies [0ff52d7]
- Updated dependencies [5b379d1]
- Updated dependencies [0db0276]
- Updated dependencies [79bb2b3]
- Updated dependencies [25c6b24]
- Updated dependencies [7d04b06]
- Updated dependencies [797303e]
- Updated dependencies [be5bcde]
- Updated dependencies [c094b64]
- Updated dependencies [54b33f0]
- Updated dependencies [f4df491]
- Updated dependencies [f59a6fb]
- Updated dependencies [78ae16a]
- Updated dependencies [c094b64]
- Updated dependencies [f4cce15]
- Updated dependencies [6e50c38]
- Updated dependencies [6e6ec69]
- Updated dependencies [49d9ef3]
- Updated dependencies [6e8eba0]
- Updated dependencies [65b60a9]
- Updated dependencies [389a381]
- Updated dependencies [b6031e2]
- Updated dependencies [c094b64]
- Updated dependencies [72e0e8e]
  - @mj-biz-apps/orders-entities@5.1.0
