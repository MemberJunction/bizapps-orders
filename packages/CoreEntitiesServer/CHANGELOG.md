# @mj-biz-apps/orders-core-entities-server

## 5.1.0

### Minor Changes

- c094b64: Add `CustomerPaymentTerms` — the terms a particular buyer negotiated

  Date-effective and optionally scoped to one selling company, keyed on organization or person the way
  `CustomerTaxExemption` and `CustomerPaymentMethod` already are. Not an IS-A extension of
  `AccountingCompanyProfile`: that profile IS-A `Company` and describes the SELLER, whereas a buyer
  here is an Organization or a Person — there is nothing to extend.

  Seeds the six standard `PaymentTermsType` rows the walk resolves against; the table had none.

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

- 3c2b404: Move payment allocations onto a related-record collection, and let the graph write them.

  `Payment Headers → Payment Lines` is declared as `RelatedRecordCollection` metadata, so `Lines`
  exists on both tiers. `PaymentHeaderEntityServer` drops its `_lines` array and its `savePendingLines`
  loop entirely: a payment's allocations are complete when they arrive — the caller supplies them,
  whether that is manual entry, an order's initial payment or a reversal — and the gateway has already
  settled by then, so there is nothing left to decide and no reason to keep ownership of the write.

  The graph does it better than the loop it replaces: removals run before inserts, and the foreign key
  is stamped at execution time, so it is correct even though the header's key is minted by that same
  save.

  No `Sequence` policy, unlike order lines: an allocation is identified by which order line it pays,
  not by position, and `PaymentLine` has no line-number column.

  `AllocatedAt` is now defaulted before the header save rather than during the line loop. It is
  `NOT NULL` and no caller is required to author it, so companion validation — which runs from the
  parent's save, before any line's own `Save()` — would otherwise reject allocations from every caller
  that relied on the fallback.

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

### Patch Changes

- 319f76e: A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
- c094b64: Correct CI's stale figures and stop claiming changesets are enforced

  The workflow described 217 integration checks and 250 unit tests; there are 366 and 999.
  `migrations/_README.md` said a changeset was required "(CI enforces)" — there was no changeset
  tooling in the repo at all, and the claim sat unenforced through several schema changes. The rule
  above it claimed migration timestamps were CI-enforced too; no such check has ever existed either.
  Both now state what is true, which is that they are review items.

  Adds `@changesets/cli` configured against this repo's `next` trunk, and an ADVISORY warning
  annotation on pull requests. Advisory rather than a gate on purpose: a red X on a documentation PR
  with no version impact is a check people learn to ignore.

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
- 1d23637: A new Draft with no lines now mints OrderNumber instead of failing the insert. Subscriptions consume accounting-ng's deferred-revenue waterfall (the 3-column stub is gone) and label the rail Terms. Event-line extensions reload CompanyID/UnitPrice from the saved parent after the graph returns.
- 5b379d1: Fix four money and subscription defects found by stressing the UI

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

- 65ebe2c: GL account resolution now walks product → category → product type → company, and
  ORD-WORLD seeds the accounts, dimensions, and company-level AR links a confirm needs.

  Booking also force-refreshes the accounting engine so MJAPI sees links written by
  ORD-00 in another process, instead of reporting "No GL account is linked for role
  Accounts Receivable" against a company that already has the link.

- f4cce15: State the overdue rule once, in `overdue.ts`, and have `GetOverdueWorklist` read it. Three surfaces
  derived it independently and only one excluded a voided order — so a voided order with a stale
  balance appeared on collections lists as money owed.
- 65b60a9: Default price/tax/secret resolvers are intentionally registered with no ClassFactory key. Mark those registrations so Explorer/MJAPI stop warning at boot, and probe for a plugin key before CreateInstance so the walk does not fall back (and warn) on every Product/Category/Company miss.
- 75b331e: Stamp JournalEntryID on the Order Line parent and skip re-saving a clean IS-A line extension. Confirming an event order no longer fails with Field OrderHeader does not exist on Event Order Lines.
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
