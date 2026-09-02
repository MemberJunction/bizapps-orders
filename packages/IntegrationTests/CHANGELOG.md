# @mj-biz-apps/orders-integration-tests

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
