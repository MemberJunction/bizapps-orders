# @mj-biz-apps/orders-ng

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
