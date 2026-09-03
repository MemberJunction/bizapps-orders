# @mj-biz-apps/orders-server

## 5.6.0

### Patch Changes

- Updated dependencies [e48bc43]
  - @mj-biz-apps/orders-core-entities-server@5.6.0
  - @mj-biz-apps/orders-actions@5.6.0
  - @mj-biz-apps/orders-entities@5.6.0

## 5.5.0

### Patch Changes

- Updated dependencies [24f8625]
  - @mj-biz-apps/orders-entities@5.5.0
  - @mj-biz-apps/orders-core-entities-server@5.5.0
  - @mj-biz-apps/orders-actions@5.5.0

## 5.4.0

### Patch Changes

- Updated dependencies [d29cc6c]
  - @mj-biz-apps/orders-entities@5.4.0
  - @mj-biz-apps/orders-core-entities-server@5.4.0
  - @mj-biz-apps/orders-actions@5.4.0

## 5.3.0

### Patch Changes

- Updated dependencies [4fcc102]
- Updated dependencies [406bcaa]
  - @mj-biz-apps/orders-entities@5.3.0
  - @mj-biz-apps/orders-core-entities-server@5.3.0
  - @mj-biz-apps/orders-actions@5.3.0

## 5.2.1

### Patch Changes

- @mj-biz-apps/orders-actions@5.2.1
- @mj-biz-apps/orders-core-entities-server@5.2.1
- @mj-biz-apps/orders-entities@5.2.1

## 5.2.0

### Minor Changes

- 2daf9b9: Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
- 44944fd: Add the entitlement read contract: `Orders.CheckEntitlement` and `Orders.ListEntitlements` evaluate in-force access (status + window + subscription access-through) instead of polling `EntitlementGrant.Status`. Cancel now revokes standing grants when access-through has already passed.
- d0e5450: Scope CodeGen heal EXECs with authored excludeSchemas plus `@IncludedSchemaNames` for the Orders schema, instead of photographing sibling Open Apps. Strip Common Activity Types field inserts and the unscoped field-from-schema heal that broke from-scratch migrate.

### Patch Changes

- 8e42a02: Split the release into a version step and a publish step, so neither writes to a protected branch.

  `version.yml` (new, on `next`) turns pending changesets into a reviewable "Version Packages" PR —
  bumps, CHANGELOGs, the mj-app.json version and range, and a refreshed lockfile.
  `release-readiness.yml` (new) gates the version PR and any PR to `main`. `publish.yml` keeps only
  the publish half and refuses to run while changesets are pending.

  Ported from bizapps-accounting, where the old flow published 0.2.0 to npm and then failed to write
  the version bump back: `ci/commit_push.mjs` pushes straight to `main`, the `main-next-protect`
  ruleset requires a pull request, and `github-actions[bot]` cannot be granted a bypass. This repo
  carries the identical ruleset and would fail the same way on its first release.

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

- 844f85d: Public checkout URL is `GET /checkout/:slug` on the existing `OrdersCheckoutEdge` (vanilla HTML talking to the POST edge). The server package publishes `MJ_SERVER_EXTENSIONS` (and `package.json` `memberjunction.serverExtensions`) so a host that lists `@mj-biz-apps/orders-server` in `dynamicPackages.server[]` auto-loads the webhook and checkout edge. Initialize writes a SKU-resolved `productId` onto Configuration so that page can draft a line.
- c490929: Checkout follow-up from the #115/#116 security review: fail-closed open catalog without widget CompanyID; do not serve the element source map on the public payment route unless opted in; book CapturePayment from payment_intent.succeeded (including AlreadyApplied retries); require a CSP nonce on the host page renderer.
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
  - @mj-biz-apps/orders-core-entities-server@5.2.0
  - @mj-biz-apps/orders-entities@5.2.0
  - @mj-biz-apps/orders-actions@5.2.0

## 5.1.0

### Minor Changes

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

- c094b64: Enforce the order lifecycle: guard illegal status transitions in `OrderEntityServer.Save`

  `CK_OrderHeader_Status` enforced the legal SET of statuses and nothing enforced the legal MOVES.
  `Fulfilled → Draft` saved. `Voided → Confirmed` saved — a voided order could come back to life,
  keep the journal entries its reversal had already unwound, and be shipped, with every row valid and
  the constraint satisfied.

  New `OrderStatusBehavior` owns the transition table and the predicates six modules previously spelled
  out as ad-hoc string sets that had drifted apart (one of them guarded against `Cancelled`/`Canceled`,
  which are not legal order statuses at all). The guard runs in `Save`, the one path every write goes
  through, and refuses with a reason rather than a bare `false`.

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

- 5b379d1: Move the invoice, payment-intent and document-send actions into the server package

  They lived in `orders-actions` but depend on server-side entity behaviour, so the order → journal
  entry path could not be reached end to end from a running instance. Relocating them alongside the
  code they call makes that path reachable; the action bodies are unchanged.

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

- Updated dependencies [933075e]
- Updated dependencies [319f76e]
- Updated dependencies [c094b64]
- Updated dependencies [b32c32a]
- Updated dependencies [c094b64]
- Updated dependencies [4cbd90e]
- Updated dependencies [fad54cb]
- Updated dependencies [1d23637]
- Updated dependencies [e468e73]
- Updated dependencies [5b379d1]
- Updated dependencies [a09b96c]
- Updated dependencies [be5005a]
- Updated dependencies [0ff52d7]
- Updated dependencies [5b379d1]
- Updated dependencies [0db0276]
- Updated dependencies [79bb2b3]
- Updated dependencies [5b379d1]
- Updated dependencies [25c6b24]
- Updated dependencies [7d04b06]
- Updated dependencies [797303e]
- Updated dependencies [be5bcde]
- Updated dependencies [65ebe2c]
- Updated dependencies [c094b64]
- Updated dependencies [54b33f0]
- Updated dependencies [f4df491]
- Updated dependencies [f59a6fb]
- Updated dependencies [78ae16a]
- Updated dependencies [c094b64]
- Updated dependencies [f4cce15]
- Updated dependencies [3c2b404]
- Updated dependencies [6e50c38]
- Updated dependencies [6e6ec69]
- Updated dependencies [49d9ef3]
- Updated dependencies [6e8eba0]
- Updated dependencies [65b60a9]
- Updated dependencies [389a381]
- Updated dependencies [b6031e2]
- Updated dependencies [c094b64]
- Updated dependencies [75b331e]
- Updated dependencies [72e0e8e]
  - @mj-biz-apps/orders-entities@5.1.0
  - @mj-biz-apps/orders-core-entities-server@5.1.0
  - @mj-biz-apps/orders-actions@5.1.0
