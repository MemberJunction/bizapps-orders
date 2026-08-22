# @mj-biz-apps/orders-entities

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
