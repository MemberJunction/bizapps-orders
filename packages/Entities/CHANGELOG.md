# @mj-biz-apps/orders-entities

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
