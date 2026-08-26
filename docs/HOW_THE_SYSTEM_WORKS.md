# How BizApps Orders works

This is the current description of the running system. Historical design (decisions D1–D84, UX thesis, pricing/subscription drafts) lives in [`plans/archive/`](../plans/archive/). Those files are not the source of truth for what has shipped.

Companion docs:

- [`orders-api-and-ui-architecture.md`](orders-api-and-ui-architecture.md) — GraphQL / remote operations / Explorer sections
- [`ui-architecture.md`](ui-architecture.md) — bind to entities, not a service layer
- [`reviewing-the-data.md`](reviewing-the-data.md) — committed seed data you can inspect
- [`dependency-on-accounting.md`](dependency-on-accounting.md) — JE / GL contract
- [`ERD.md`](ERD.md) — schema picture

---

## 1. What it is

Orders is one MemberJunction Open App (`mj-bizapps-orders`, schema `__mj_BizAppsOrders`). A customer commits to pay; the app tracks **what they are getting** and **how they are paying**.

The substrate is **Products → Order Headers → Payments**. A confirmed order is both the commitment and the A/R document. There is no Invoice entity. Recurring cadence lives on Subscriptions, which spawn a new Order Header each billing cycle.

Orders is the orchestrator, not the ledger. Every event that needs accounting (line booked, payment captured, revenue recognized, refund issued) is a balanced journal entry in [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting). Customer master data lives in [BizApps Common](https://github.com/MemberJunction/bizapps-common). Human gates (discount authority, credit override) are Tasks in [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks).

| This is | This is not |
|---|---|
| Products, orders, payments, subscriptions | The general ledger |
| Order Header as the receivable | A separate invoicing system |
| Multi-company: each line books its own single-company JE | A tax engine (we snapshot a third-party result) |
| Provider-agnostic payments (Stripe + Manual today) | An e-commerce storefront |
| Reversal-disciplined (returns, refunds, chargebacks) | CRM, inventory, or contracts |

---

## 2. Entity names (do not invent these)

`Metadata.GetEntityObject` and `RunView` resolve names at runtime. A typo compiles, then returns empty results. Use the constants in `packages/IntegrationTests/src/entity-names.ts` (or the same strings).

| Constant | Runtime name |
|---|---|
| `ORDER_HEADER_ENTITY` | `MJ_BizApps_Orders: Order Headers` |
| `ORDER_LINE_ENTITY` | `MJ_BizApps_Orders: Order Lines` |
| `PAYMENT_HEADER_ENTITY` | `MJ_BizApps_Orders: Payment Headers` |
| `PAYMENT_LINE_ENTITY` | `MJ_BizApps_Orders: Payment Lines` |
| `PRODUCT_ENTITY` | `MJ_BizApps_Orders: Products` |
| `PRODUCT_TYPE_ENTITY` | `MJ_BizApps_Orders: Product Types` |
| `EVENT_PRODUCT_ENTITY` | `MJ_BizApps_Orders: Event Products` |
| `EVENT_ORDER_LINE_ENTITY` | `MJ_BizApps_Orders: Event Order Lines` |
| `SUBSCRIPTION_TERM_ENTITY` | `MJ_BizApps_Orders: Subscription Terms` |
| `PERSON_ENTITY` | `MJ_BizApps_Common: People` |
| `ORGANIZATION_ENTITY` | `MJ_BizApps_Common: Organizations` |
| `GL_ACCOUNT_ENTITY` | `MJ_BizApps_Accounting: GL Accounts` |

The prefix is `MJ_BizApps_Orders:` (underscores). Never `Orders` or `Payments` unprefixed — those names do not exist.

---

## 3. Packages

| Package | NPM | Job |
|---|---|---|
| Entities | `@mj-biz-apps/orders-entities` | Shared subclasses + Zod + `OrderPricingService`. Runs on **both** tiers. |
| Core Entities Server | `@mj-biz-apps/orders-core-entities-server` | `OrderEntityServer`, `PaymentHeaderEntityServer`, factories, remote-op bodies |
| Server | `@mj-biz-apps/orders-server` | GraphQL resolvers, webhook extension, loaders |
| Actions | `@mj-biz-apps/orders-actions` | Invoice / send-document / payment-intent actions |
| Angular | `@mj-biz-apps/orders-ng` | Explorer sections, custom Order Header form, form-panel contributions |
| Integration Tests | `@mj-biz-apps/orders-integration-tests` | Private. Registers IT bundles. Never published. |

`OrderHeaderEntity` (shared) owns every rule that can run from the record itself: payer, has-lines, section-for-field. `OrderEntityServer` extends it and adds persistence: expand bundles, price/promote/charge/tax, book one JE per line, grant entitlements, materialize subscriptions.

---

## 4. The path an order takes

```
BROWSER                                         SERVER
───────                                         ──────
OrderHeaderEntity                               OrderEntityServer.Save()
  order.Lines.Create()                            expand bundles
  order.Status = 'Confirmed'                      OrderPricingService
  order.Save()  ── MJ.SaveEntityGraph ─────────►  first Confirm → bookLines()
                                                    OrderJournalEntryFactory
                                                    Accounting.CreateJournalEntries
                                                    stamp OrderLine.JournalEntryID
                                                    entitlements / gift cards / subs
```

`Lines` is a related-record collection declared in metadata (`metadata/entity-relationships/lines-collection.json`). CodeGen emits the accessor. `order.Save()` writes header + lines in one transaction. There is no `Orders.ConfirmOrder` remote operation — Confirm **is** a save that first transitions `Status` to `Confirmed`.

Idempotency keys off `ConfirmedAt`. Re-saving a confirmed order updates the row and never re-books. `OrderLine.JournalEntryID` is NULL→value-once at the database (trigger), so a double-book is refused even if the subclass is bypassed.

Failure **blocks** Confirm. A confirmed order without its journal entries is invalid state; there is no partial-success path.

### 4.1 Order Lifecycle and 3-Way Orthogonal Status
The order state is decoupled into three independent dimensions:
1. **Commercial Status (`Status`)**: `'Draft' | 'Quoted' | 'Confirmed' | 'Voided'`.
   - `'Confirmed'` is the irreversible booking gate (books JEs).
2. **Operational Fulfillment (`FulfillmentStatus`)**: `'Pending' | 'PartiallyFulfilled' | 'Fulfilled' | 'NotApplicable' | 'Returned'`.
   - Trigger-maintained and rolled up across lines via `spRecalcOrderHeaderTotals`.
3. **Financial / Payment Progress**: Real-time numeric balance facts (`TotalGross`, `AmountPaid`, `Balance`, `DueDate`) plus layered `IsOverdue`. There is **no** stored `PaymentStatus` column (`V202608241300` dropped it). Widgets that still select `h.PaymentStatus` fail; derive Open/Overdue from `Balance` / `IsOverdue`.

Bill-to / ship-to: setting a **person** copies to the other side if that person is empty, then fills that side's organization from the longest-lasting active Employee relationship in Common. An org the user already chose is not overwritten.

**Party Auto-Population**: On a new unsaved order (`!order.IsSaved`), setting `ShipToPersonID` or `BillToPersonID` queries `__mj_BizAppsCommon.Relationship` for active employer affiliations. If exactly one active employer organization exists, `ShipToOrganizationID` (or `BillToOrganizationID`) is auto-populated. Setting `ShipTo` cascades to `BillTo` if `BillTo` is completely empty.

**Confirm Pre-Flight**: Confirm is a direct toolbar action and verb (`order.Confirm()`) that validates all conditions and books immediately in one transaction; no modal overlay is needed.

### What is still a remote operation

An operation is an **act** the entity cannot express: decide over a set, talk to a third party, or stay atomic with a write that is not "save this graph."

| Operation | Why it is not a save |
|---|---|
| `Orders.PriceOrder` | Price without writing. Same `OrderPricingService` the save path uses. |
| `Orders.PreviewPrice` | One product's advisory price. Promotions stack against totals, so this cannot be final. |
| `Orders.AdvanceOrderState` | Advances fulfillment progress on Confirmed orders. |
| `Orders.CapturePayment` | Settle with the provider, then record money. |
| `Orders.RefundPayment` | Reversal payment + un-apply, atomically. |
| `Orders.ApplyAccountCredit` | Spend a credit (zero-amount payment, two offsetting lines). |
| `Orders.FulfillOrderLines` | Mark lines fulfilled and update header `FulfillmentStatus`. |
| `Orders.GetFulfillmentQueue` | Computed backlog of unfulfilled confirmed order lines. |
| `Orders.GetOverdueWorklist` | Computed overdue receivables. |
| `Orders.CancelSubscription` | Policy in, reversal out. |
| `Orders.SpawnRenewals` | Long-running: place renewal orders at lead time. |

`Orders.SaveOrder` / `ConfirmOrder` / `PreviewOrder` / `PreviewConfirm` were retired when related-record collections landed.

**Unstated `UnitPrice` is omitted, never sent as `0`.** A stated `0` is a free line and suppresses resolution.

`ExpectedGrossTotal` on the header makes Confirm refuse if the total moved between preview and save, inside the same transaction that would have booked it.

---

## 5. Booking and the ledger

Every order line books **its own complete, single-company journal entry**. There is no order-level JE row; any "order JE" in the UI is an aggregation of line JEs.

- Linkage: `OrderLine.JournalEntryID` → Accounting `JournalEntry`. Reverse: `JournalEntry.LinkedEntityID` / `LinkedRecordID` → the line.
- JEs land **Pending**. Accounting batches them to the ERP. "Book" means create a Pending JE, never GL-post.
- GL accounts resolve by **role** (`GLAccountRole` / `GLAccountLink`): product link → product-company category tree → company default → **fail loudly**. No GL account columns live on the catalog.
- `Product.CompanyID` is the source of truth for line ownership. `Order.CompanyID` is the originating/owning company (document, visibility, sales rep). `OrderLine.CompanyID` is a stamp of the product's company at save.
- Intercompany legs are **not** booked at confirm. Each line's AR sits with the line's company. Cash received by one company and applied to another company's AR books due-to/due-from at **payment application** (`PaymentAllocationFactory`).

A fully-comped order can produce **no** JEs. Accounting refuses an empty draft set, so `bookLines` skips the call rather than failing the order.

---

## 6. Pricing, promotions, charges, tax

`OrderPricingService` (shared package) is the one walk. Confirm and `Orders.PriceOrder` call the same service.

1. **Resolve price** — price list / assignment / tier, or stated `UnitPrice` (direct entry wins).
2. **Promotions** — codes and targets, stacking rules, authorized manual discounts.
3. **Charges** — shipping, handling, and tax as one mechanism (`ChargeType` + `GLAccountLink`).
4. **Tax** — address + nexus + taxability + exemptions. Snapshot onto the line; we are not a tax engine.

Results persist as line price-component / charge / adjustment children so the booked number is reconstructable.

---

## 7. Payments and A/R

`Payment Header` + `Payment Line` apply cash to Order Headers. Split tender (one payment, many orders) and partial application (one order, many payments) are first-class.

- Header rollups (`TotalGross`, `AmountPaid`, `Balance`, `FulfillmentStatus`) are materialized from lines and payment lines. Do not author them.
- Capture books Dr Cash (net) / Dr Processing Fee / Cr A/R (gross).
- Refund / chargeback / bank-return is a **negative** payment (`ReversesPaymentID`). Use `Orders.RefundPayment`.
- Over-payment is a **negative Balance** — that *is* the account credit. Spend it with `Orders.ApplyAccountCredit`.
- Providers: `BasePaymentProvider` + `@RegisterClass`. **Manual** always works. **Stripe** (card + ACH) is the first gateway. **StoredValue** is the internal gift-card redemption provider. Webhooks hit an unauthenticated Express route; idempotency is `ProviderEventID`.

---

## 8. Subscriptions and events

- A subscription product on confirm materializes `Subscription` + `Subscription Term` via `SubscriptionBehavior`.
- Annual billed annually = one order, deferred, recognized ratably (forward-dated JEs at booking).
- Monthly billed monthly = one renewal Order Header per cycle (`Orders.SpawnRenewals` places Drafts at lead time; a human confirms).
- Cancel is `Orders.CancelSubscription` (policy → reversal).
- **Event products** (`EventProduct` IsA, shared UUID with Product) stamp `ServicePeriodStart`/`End` from the event unless the line already set them. `EventOrderLine` holds the attendee. Capacity is **not** enforced on confirm.

Revenue recognition is **real forward-dated JEs written at booking**. A 12-month $1,200 subscription writes 12 × $100 Dr Deferred / Cr Revenue dated on the monthly anniversaries. Accounting's batch sweep by date is what "fires" recognition. Staged entries are never edited; corrections are reversing orders.

---

## 9. Reversals

Locked history is never edited.

- Return / cancellation / credit memo = a **new** Order Header (`ReversesOrderHeaderID`) with negative-quantity lines.
- Refund = a new Payment Header (`ReversesPaymentID`).
- Entitlement grants created at booking are revoked on return (`EntitlementEngine`).

---

## 10. UI

Explorer mounts four `Application` nav items from `metadata/applications/.orders-application.json`. Each names a `DriverClass` that must stay imported from `public-api.ts` or the tab is blank.

| Tab | DriverClass | Job |
|---|---|---|
| Orders | `OrdersSectionResource` | Dashboard, all orders, fast entry, fulfillment, returns |
| Payments | `PaymentsSectionResource` | Dashboard, all payments, take payment, refunds, credits |
| Receivables | `ReceivablesSectionResource` | Customer A/R, overdue, subscriptions |
| Catalog | `CatalogSectionResource` | Products, pricing, promotions, charges |

Records open with `NavigationService.OpenEntityRecord` (or `OpenNewEntityRecord` for `/new`). Do not invent a workspace tab strip.

**Forms**

- **Order Header** is the one registered custom form (`ShowRelatedEntities: false`, leftover related blocked). Collapsible header persists in `UserInfoEngine` key `mj.orders.orderForm.headerExpanded` (`'0'`/`'1'`). New records always expand; the pref applies only when opening an existing record. Money trio (Total / Paid / Balance) shows cents on all three if any has cents.
- Payments, Subscriptions, Products, Price Lists, Promotions use the **generated** form plus slot contributions and `Layout: left-nav`. They are not ClassFactory-registered custom forms.
- Person / Organization **Orders** grids pass every filter join field as `NewRecordValues` so New opens an order already linked (`BillToPersonID` + `ShipToPersonID`, or org equivalents).

Form chrome (Overview as a lead, rail order, user drag overlay) is MJ form chrome + `MJ: Form Chrome Rules` (L3). Contribution last-wins by `contributionKey` and ClassFactory Priority.

Page chrome uses `<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>`. Lists use `mj-entity-data-grid`. Related grids in accordion mode size to toolbar + header + rows (see MJ `RelatedGridHeightPx`).

Zoneless: anything assigned to `this.*` after `await` needs `this.cdr.detectChanges()` in that body. `render-after-load.test.ts` enforces it.

---

## 11. Tests

| Tier | What | How |
|---|---|---|
| Unit | Entity rules, pricing math, IA, render guard | `pnpm test` in each package |
| Integration (server) | Booking, JEs, payments, subs — real `SQLServerDataProvider`, **always rolled back** | `node test-harnesses/integration.mjs` |
| Integration (client) | Catalog + party CRUD over GraphQL | `GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs` |
| Committed seed | Same engine, left on disk for inspection | `node test-harnesses/seed-review-data.mjs` |
| Mockup fidelity | Static screens | `node mockups/verify.mjs` |

Server ITs import `@mj-biz-apps/orders-server` so `OrderEntityServer` is registered. Without that, Confirm runs the generated entity and the suite measures nothing.

Client ITs must **not** import `*EntityServer` — those constructors throw on `GraphQLDataProvider`. Booking over the wire is `order.Save()` against MJAPI, which dispatches to the server subclass.

`RUN_MUTATION_TESTS=1` is required for `mj test`. Without it the driver reports zero checks and passes.

The check that matters most: **`advance-order-state.ADV8`** — an unbooked order is refused. A single UPDATE to `Fulfilled` produces a complete-looking order with no ledger.

---

## 12. Local run (this workspace)

This clone sits under `/Users/amith/Dropbox/develop/M5/`, a pnpm mega-workspace. **Install only at `M5/`**. Never hand-link packages, never `pnpm install` inside a member repo.

Typical local ports on this machine:

| Process | Port | Notes |
|---|---|---|
| MJAPI | `4103` | `GRAPHQL_PORT=4103`, `DB_DATABASE=bizapps_orders` |
| MJExplorer | `4303` | `pnpm exec ng serve --port 4303` (the `start` script already has `--port 4201`) |

`mj.config.cjs` `dynamicPackages` and MJAPI/MJExplorer `package.json` edits are **local wiring**. Do not commit them.

Rebuild a database from zero:

```bash
scripts/rebuild-db.sh
pnpm run mj:codegen
scripts/append-codegen.sh
pnpm exec mj sync push --dir metadata
```

---

## 13. What is not this app

- **Stripe / Bill.com / Business Central export live tests** — other team.
- **LXP packaging** (tiers, track bundles, hosted checkout as a product surface) — consumer work, not missing engine.
- **Approvals inbox** — sales rules can name an approver role; the Task exists; there is no Orders UI for it.
- **Contracts / Inventory** — future sibling apps. Do not put their columns here.
- **Event capacity enforcement** — not implemented; cannot be correct from these tables alone.
- **Multi-currency** — deferred (D24).
- **Graph view** — owned elsewhere (MJ `@memberjunction/ng-graph-view` + Common relationship graph). Do not edit those trees from this app's work.

---

## 14. Where to change what

| If you are changing… | Start here |
|---|---|
| Confirm / booking / JE stamp | `packages/CoreEntitiesServer/src/OrderEntityServer.ts` |
| Line JE shape | `OrderJournalEntryFactory.ts` |
| GL role walk | `GLAccountResolver.ts` |
| Price / promo / charge / tax | `packages/Entities/src/pricing/` |
| Capture / refund | `CapturePaymentOperation.ts`, `RefundPaymentOperation.ts` |
| Intercompany cash | `PaymentAllocationFactory.ts` |
| Subscriptions | `SubscriptionBehavior.ts`, `CancelSubscriptionOperation.ts`, `SpawnRenewalsOperation.ts` |
| Explorer sections | `packages/Angular/src/lib/sections/` |
| Order compose form | `packages/Angular/src/lib/custom/OrderHeader/` |
| Form contributions | `packages/Angular/src/lib/form-panels/` |
| IT fixture / builders | `packages/IntegrationTests/src/fixture.ts`, `order-builder.ts`, `payment-builder.ts` |
| Entity name strings | `packages/IntegrationTests/src/entity-names.ts` |
