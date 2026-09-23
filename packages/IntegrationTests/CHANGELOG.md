# @mj-biz-apps/orders-integration-tests

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
