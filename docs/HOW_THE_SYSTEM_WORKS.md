# How BizApps Orders works

This is the current description of the running system. Historical design (decisions D1–D84, UX thesis, pricing/subscription drafts) lives in [`plans/archive/`](../plans/archive/). Those files are not the source of truth for what has shipped.

Companion docs (all of them are indexed in [`README.md`](README.md)):

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
| Multi-company: each line books its own single-company JE | A tax engine (rates and jurisdictions come from BizApps Accounting; the address lookup is a replaceable seam) |
| Provider-agnostic payments (Manual, Stripe cards and ACH, stored value, Bill.com) | An e-commerce storefront |
| Reversal-disciplined (returns, refunds, bank returns) | CRM, inventory, or contracts |

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
| Entities | `@mj-biz-apps/orders-entities` | Shared subclasses, Zod schemas, the pricing engine (`OrderPricingService` and its price, promotion, charge and tax steps, in `src/pricing/`) and the `OrdersEngine` lookup cache. Runs on **both** tiers. |
| Core Entities Server | `@mj-biz-apps/orders-core-entities-server` | `OrderEntityServer`, `PaymentHeaderEntityServer`, journal-entry factories, remote-op bodies, payment drivers |
| Server | `@mj-biz-apps/orders-server` | The bootstrap (`LoadBizAppsOrdersServer`), generated GraphQL resolvers, the server extensions (payment webhook, checkout edge, Bill.com webhook) and the hand-written actions (`src/custom/*.action.ts`) |
| Actions | `@mj-biz-apps/orders-actions` | Generated action subclasses only. It also ships to the browser, so hand-written actions live in `orders-server`. |
| Angular | `@mj-biz-apps/orders-ng` | Explorer sections, custom forms, form-panel contributions, the checkout widget |
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

**Lines at $0**: on an order a person entered (`Origin = 'Direct'`), no line confirms at a unit price of 0. Products sold at a negotiated price sit in the catalog at 0, so the person entering the order types the price; a line given away carries its price and a 100% discount, which goes through concession approval. The confirm gate (`ConcessionGate`) classes a line charged nothing once its concession is taken off as a Scope concession worth its list price times quantity. A manual discount above the rep's Sales Authority is saved held, with no authority and no approver on its adjustment row, rather than refused; the gate counts it until an approved Price or Scope concession covers the line. A confirming save that brings a new held discount is refused, since the gate has already run; the rep saves first. Because the gate reads the adjustment row, the row cannot be edited or deleted by hand: `OrderAdjustmentEntityServer` refuses a change to a saved row's authority, approver, amount, line or promotion, and refuses a delete except from an order's own save (removing a draft line, or replacing its promotion rows). The order-lines editor marks such a discount "Needs approval", and suggests a 100% discount beside a price typed as 0. `OrderHeaderEntity.UnpricedLinesRefusal()` gives the one message both the order form's "Before this can be confirmed" list (`ConfirmEligibility`) and the confirm save (`Validate`) show. Checkout and payment-created orders, bundle components and return lines are exempt. When accounting refuses an order's booking, the message gives each distinct error once as a plain sentence naming the order lines and products it applies to and what to change; accounting's pipeline codes (`MALFORMED_DRAFT`, `ACCOUNT_INACTIVE`, ...) go to the server log only (`booking-errors.ts`).

### 4.2 Order review by trigger (golive #320 §5)

A Direct order (hand-entered or deal-created) that hits a review trigger cannot confirm until a reviewer approves it. Every trigger is off until the host lists it in the `OrderReviewTriggers` setting, so an install that never configures review confirms as before.

| Trigger | Fires when |
|---|---|
| `NoDeal` | No deal created the order. The deal comes from whatever app registers `RegisterOrderDealLink` (sales); with nothing registered every order counts as having no deal. |
| `PriceVariance` | On an order with no deal, a line's stated price differs from the catalog's with no Approved Price or Scope concession on the line (a discount approved on the rep's own authority counts as covered); or a renewal line's carried-forward price is edited. |
| `ChangedAfterDealOrReview` | Before confirm, a save changes the bill-to, company, or a line's price, discount, quantity, product, company or service dates, or adds or removes a line, on a deal-created order. Decided when the change is saved. Fires on nothing until the sales app registers `RegisterOrderDealLink` (bizapps-sales#462), so leave it off until then, as with `NoDeal`. A change after an approved review voids the approval whether or not this trigger is on (below). |
| `OverThreshold` | The net total (lines after discounts, before tax and charges) is above `OrderReviewTotalThreshold`. |
| `ServicePeriod` | A line's service starts more than `OrderReviewServiceStartMonths` (13) months after today, or covers more than `OrderReviewLineTermMonths` (12). |

The review is an `ORDERS_ORDER_REVIEW` task linked to the order and assigned, by the Person linked to each user, to the active holders of `OrderReviewerRole`, or of `OrderReviewEscalationRole` when a holder of the reviewer role created the order (the creator is read from `MJ: Record Changes`). The creator is never assigned. A review nobody could receive is refused, not raised; one whose link or assignments fail part-way is closed as Cancelled and replaced at the next confirm, and an open review assigned to nobody is likewise replaced rather than waited on. The confirm that finds a trigger raises the task and is refused. Once an order has a review, every later confirm waits on it: an open review blocks the confirm whatever newer closed task is linked; a rejected or cancelled review is replaced at the next confirm.

**What counts as an approval.** The order's creator can write tasks, links, assignments and decisions through the ordinary tasks surface, so the gate believes none of what those rows say about who decided. An approval counts only when the user who *wrote* the decision row, read from `MJ: Record Changes` on Task Decisions (not the row's `DecidedByPersonID`), is an active holder of the routed role and is not the order's creator; the task was linked to this order, and no other, before the decision was written (a link's `__mj_UpdatedAt` is the database's own); and nothing reviewed on the order (a line added, a reviewed line or header field changed) was written after the decision, again from `MJ: Record Changes`, which catches a line saved on its own as well as the order's save. A reviewed change saved through the order after approval also raises a fresh review at once. An approved order is not re-run against the triggers at confirm, since an order over the threshold would match again and never confirm.

**Which orders.** Every order is reviewed except a checkout order (`Origin` = `Widget`), a provider-payment order (`ProviderPayment`), a reversal, and an order of renewals only (reviewed only once its carried-forward price is edited). `Origin` is free text, so the exemption is an exact allow-list (`SYSTEM_ORDER_ORIGINS`) and any other value is reviewed; and `OrderEntityServer.Save` refuses any write of `Origin` (a new order claiming anything but `Direct`, or a change to a saved order's) that the creating process did not make through `SetSystemOrderOrigin`. That guard applies whether or not review is on. Code: `packages/Entities/src/order-review.ts` (rules), `packages/CoreEntitiesServer/src/OrderReview.ts` (reads, the task, and the two hooks in `OrderEntityServer.Save`), `packages/CoreEntitiesServer/src/SystemOrderOrigin.ts` (the Origin guard).

### What is still a remote operation

An operation is an **act** the entity cannot express: decide over a set, talk to a third party, or stay atomic with a write that is not "save this graph."

The table lists the main ones. The full list, by area, is in [`orders-api-and-ui-architecture.md`, "Remote operations"](orders-api-and-ui-architecture.md#remote-operations); the rows themselves are in `metadata/remote-operations/`.

| Operation | Why it is not a save |
|---|---|
| `Orders.PriceOrder` | Price without writing. Same `OrderPricingService` the save path uses. |
| `Orders.PreviewPrice` | One product's advisory price. Promotions stack against totals, so this cannot be final. |
| `Orders.AdvanceOrderState` | Moves a confirmed order to `FulfillmentStatus = 'Fulfilled'`, marking its fulfillable lines first. Books nothing; refuses an unbooked order. |
| `Orders.CapturePayment` | Settle with the provider, then record money. A read it cannot complete is a retryable refusal (`OrderReadFailed`, `TenderReadFailed`, `PaymentReadFailed`), never a missing record (#967). |
| `Orders.RefundPayment` | Reversal payment + un-apply, atomically. |
| `Orders.ApplyAccountCredit` | Spend a credit (zero-amount payment, two offsetting lines). |
| `Orders.FulfillOrderLines` | Mark lines fulfilled and update header `FulfillmentStatus`. |
| `Orders.GetFulfillmentQueue` | Computed backlog of unfulfilled confirmed order lines. |
| `Orders.GetOverdueWorklist` | Computed overdue receivables. |
| `Orders.CancelSubscription` | Policy in, reversal out. |
| `Orders.SpawnRenewals` | Long-running: place renewal orders at lead time. The lead time is the subscription's `RenewalLeadDays`, else its subscription type's, so products that need a different lead time go on a type carrying it; `scripts/move-subscription-types.mjs` moves a product and its open subscriptions to that type. |

`Orders.ChargeRenewals` is a scheduled Action rather than a remote operation: it charges renewal cards daily and has no browser caller (`packages/Server/src/custom/charge-renewals.action.ts`).

`Orders.SaveOrder` / `ConfirmOrder` / `PreviewOrder` / `PreviewConfirm` were retired when related-record collections landed ([why the old pattern existed](ui-architecture.md#what-changed-in-mj-61-and-why-the-old-pattern-existed-at-all)).

**Unstated `UnitPrice` is omitted, never sent as `0`.** A stated `0` is a free line and suppresses resolution ([the price rule](orders-api-and-ui-architecture.md#the-one-rule-about-prices-that-carries-real-risk)).

`ExpectedGrossTotal` on the header makes Confirm refuse if the total moved between preview and save, inside the same transaction that would have booked it ([the guard](orders-api-and-ui-architecture.md#the-expectedgrosstotal-guard)).

---

## 5. Booking and the ledger

Every order line books **its own complete, single-company journal entry**. There is no order-level JE row; any "order JE" in the UI is an aggregation of line JEs.

- Linkage: `OrderLine.JournalEntryID` → Accounting `JournalEntry`. Reverse: `JournalEntry.LinkedEntityID` / `LinkedRecordID` → the line.
- JEs land **Pending**. Accounting batches them to the ERP. "Book" means create a Pending JE, never GL-post.
- GL accounts resolve by **role** (`GLAccountRole` / `GLAccountLink`) in `GLAccountResolver`: product → its category and that category's ancestors → product type → the line's company → **fail loudly**. No GL account columns live on the catalog.
- `Product.CompanyID` is the source of truth for line ownership. `Order.CompanyID` is the originating/owning company (document, visibility, sales rep). `OrderLine.CompanyID` is a stamp of the product's company at save.
- Intercompany legs are **not** booked at confirm. Each line's AR sits with the line's company. Cash received by one company and applied to another company's AR books due-to/due-from at **payment application** (`PaymentAllocationFactory`).

A deferred line books its discount as it earns, not at booking. Booking credits Deferred Revenue with the net. Each revenue release, or progress catch-up on a percentage-of-completion line, debits Deferred for its slice, debits Sales Discounts for its share of the discount and credits Sales for both, so Deferred clears to zero. With no Sales Discounts account linked, the discount nets into the revenue (plan D11). The instalment invoice follows the same rule.

A fully-comped order can produce **no** JEs. Accounting refuses an empty draft set, so `bookLines` skips the call rather than failing the order. A fully discounted deferred line books nothing: its booking credit is zero, and its schedule would be built from a zero net, so no releases are staged either (golive #328).

---

## 6. Pricing, promotions, charges, tax

`OrderPricingService` (shared package) is the one walk. Confirm and `Orders.PriceOrder` call the same service.

1. **Resolve price** — price list / assignment / tier, or stated `UnitPrice` (direct entry wins).
2. **Promotions** — codes and targets, stacking rules, authorized manual discounts. A typed code that applied nowhere comes back in `UnusablePromotionCodes` with the reason: unknown, inactive or out of dates, a spent limit, below a minimum, beaten by a better offer (named), blocked by the company's no-stacking policy, or aimed at nothing on the order. A promotion flagged `AppliesToRenewals` is presented again on automatic renewals (§8).
3. **Charges** — shipping, handling, and tax as one mechanism (`ChargeType` + `GLAccountLink`).
4. **Tax** — address + nexus + taxability + exemptions. Snapshot onto the line; we are not a tax engine.

Results persist as line price-component / charge / adjustment children so the booked number is reconstructable.

---

## 7. Payments and A/R

`Payment Header` + `Payment Line` apply cash to Order Headers. Split tender (one payment, many orders) and partial application (one order, many payments) are first-class.

- Header rollups (`TotalGross`, `AmountPaid`, `Balance`, `FulfillmentStatus`) are materialized from lines and payment lines. Do not author them.
- Capture books Dr Cash (net) / Dr Processing Fee / Cr A/R (gross).
- Refund and bank return are reversal payments: `Status = 'Refunded'`, positive `Amount`, negative lines, `ReversesPaymentHeaderID` set. Refund with `Orders.RefundPayment`; the ACH webhook writes bank returns. Nothing writes chargebacks yet.
- **A refund does not end access.** Refunding is the seller's decision, so a refund on its own, even a full one, leaves the customer's entitlement grants Active. To end access, book a return of the lines or cancel the subscription (`Orders.CancelSubscription`). Only returns, cancellations and bank returns take access away (`EntitlementBehavior.ts`).
- Over-payment is a **negative Balance** — that *is* the account credit. Spend it with `Orders.ApplyAccountCredit`. So is the negative balance of a return or cancellation (a credit memo): an order's applied total may go below zero by the credit the order itself carries (`Balance + AmountPaid` when negative; `PaymentLineEntityServer`), never by cash it was not paid. A credit settles only its own customer's orders (the organization's, or a person's own person-billed ones), and only between **Confirmed** orders: a Draft or Quoted order's negative balance is no money anyone paid, and a Voided one never will be (`CreditOrderStatusRefusal`; the same exclusion as the overdue worklist and the `unpaid` preset). The operation locks both orders (in id order) and re-reads them, so one credit is never spent twice. The Account Credit page, the `credits` preset and the dashboard's credits tile list only such orders (`credit-statuses.ts`, a deliberate mirror of the server rule).
- Providers: `BasePaymentProvider` + `@RegisterClass`, keyed by `PaymentProviderType.Code`. **Manual** always works. **Stripe** takes cards; **StripeACH** takes US bank debits, which settle late, so the webhook books the cash. **StoredValue** spends gift cards and account credit. **BillCom** is the outbound invoice rail and refuses checkout verbs ([`billcom-invoice-rail.md`](billcom-invoice-rail.md)). **HubSpotPayments** reads the payments a company's HubSpot portal collects through the same poll, and also refuses checkout verbs ([`hubspot-payments.md`](hubspot-payments.md)). Webhooks hit an unauthenticated Express route. A delivery is a duplicate when the intent's `ProviderEventID` names its event **or** its `PaymentWebhookDelivery` row says Applied (#474). Both records must survive the page finishing the same purchase (#939): the page re-reads the intent after each gateway call before it writes, and the delivery row is written on its own provider.

---

## 8. Subscriptions and events

- A subscription product on confirm materializes `Subscription` + `Subscription Term` via `SubscriptionBehavior`.
- **Term start**: `OrderLine.ServicePeriodStart` states when coverage begins and wins over `StartMode`; absent, the start is derived from `OrderHeader.OrderDate` through the type's rules. Absent a stated end, the type computes the **end** (term length, anchor, proration). A stated end, `OrderLine.ServicePeriodEnd`, is honored (golive #338): a shorter period is one short term, and a longer one is one term per type term length (a year on an annual type) with a final partial term, all on the same subscription. Their amounts split the line by months, so recognition runs evenly over every stated month, and a stated period is never prorated: the price is the line's. The line ends up holding the settled coverage, first term start to last term end. A length other than the type's term is not refused or repriced; confirm raises it for finance review as finance exception `SUBSCRIPTION_TERM_LENGTH`, saying whether the line carries the one-term list price and what the length comes to at the list rate (nothing is raised until accounting has an active type of that code). `OrderDate` stays the booking date and still dates the booking JE, so an order booked 8/27 can sell a term running 8/1–7/31. An extension continues existing coverage the day after it ends, keeps a stated period's length from there, and reports a stated start only when the term begins somewhere else. The order line editor exposes this as "Term start" on subscription lines, defaulting to the order date — read-only on a line renewing live coverage, where it shows the continuation date instead of asking for one — and on a bundle line whose bundle contains a subscription product, where the start reaches those components. Subscription lines also show "Term end", read-only: the stated end, or the end the type computes. The editor offers no way to type one, because a stated length changes the coverage without changing the price and nothing gates or approves that yet; the finance exception is recorded only where accounting has seeded its type (bizapps-accounting#454). The extend-or-new choice names the end an extension would keep. The confirm checklist lists, without blocking, each line whose stated length differs from its type's term, and the after-confirm notice names the end a moved line kept. Both tiers read the date arithmetic from `subscription-term-length.ts` in the shared entities package.
- **Seats**: a subscription line's quantity is a seat count, recorded on the term as `SubscriptionTerm.Quantity` before proration scales the line's quantity to price a short first period. Entitlement grants and renewals read the term's count, never the line's. The quantity must be a whole number of at least 1, for every `BenefitModel`; ten staff can still be ten lines, each naming its person. An approved Seats concession adds its seats to the term: on approval when the term is booked (its `PerUnit` grants follow, and the renewal buys them at full price), or at confirm when it was approved on a draft. It is refused once the term's renewal is placed.
- Annual billed annually = one order, deferred, recognized ratably (forward-dated JEs at booking).
- Monthly billed monthly = one renewal Order Header per cycle (`Orders.SpawnRenewals` places Drafts at lead time; a human confirms).
- **Renewal pricing** (`Orders.SpawnRenewals`): the prior term's undiscounted unit price, or a successor product's list price, plus any `RenewalIncreasePercent` when the new term crosses an anniversary. A first-term discount lapses unless `Subscription.CarryDiscountOnRenewal` is set.
- **Promotions on renewal**: a promotion with `AppliesToRenewals` set carries into automatic renewals. The pass reads the codes recorded on the line that bought the expiring term and presents the flagged ones on the renewal order, where the ordinary promotion engine decides: the promotion must be Active, inside its `EffectiveFrom`/`EffectiveTo` dates on the renewal's order date, and pass its targets, minimums, limits and qualifier. A code that no longer applies is reported on the candidate (`UnusableRenewalPromotionCodes`), in the order notes and on the `RenewalOrderSpawned` event, and the renewal is placed at the undiscounted price. Preview runs the same engine without saving. Unflagged promotions apply to the purchase only.
- **Charging the renewal card** (#289). A checkout that sells an auto-renewing product keeps the card (`Subscription.DefaultCustomerPaymentMethodID`, a wallet entry). That subscription's renewal order is due on the new term's first day, and the daily `Orders.ChargeRenewals` job (`RenewalCharging.ts`, ships disabled and set to preview) charges the card off-session that day. A decline, or a demand that the absent customer authenticate (SCA), is retried on the days in the `RenewalChargeRetryDays` setting (default 3, 7 and 11 after the due day) until the access cutoff suspends the renewal. Each attempt is its own `PaymentIntent` and a `PaymentSucceeded` / `PaymentFailed` subscription event; a success is captured through `Orders.CapturePayment`, dated the business day the gateway took the money. Money the gateway took that no payment booked (a failed capture) is booked by the next pass on any day, even after the last retry day or with automatic renewal turned off; those conditions stop new charges, not the booking (#683). A subscription without a renewal card stays invoice-only. The first failed charge, once its `PaymentFailed` event is saved, e-mails the payer (the renewal card's owner; on a gift, the buyer) a signed link that opens the checkout in a pay-renewal mode: it pays the open renewal order with a new card and makes that card the renewal card ([the update-card link](checkout-widget-and-session-architecture.md#paying-a-renewal-through-the-checkout-the-update-card-link)).
- **Subscriptions a gateway bills itself** (option E).
  - **The marker.** A subscription with `ProviderSubscriptionID` set (Stripe's `sub_...`) is billed by the gateway named in its `PaymentProviderID`: the gateway charges each renewal and sends its receipt. Neither renewal job touches it: `Orders.SpawnRenewals` places no renewal order and `Orders.ChargeRenewals` neither charges nor captures, on either of its branches. The rule is that marker alone (`NotProviderBilledSql` / `IsProviderBilled`, `ProviderBilledSubscriptions.ts`), never the account's switch, so turning `PaymentProvider.BillsSubscriptions` off later cannot make Orders charge a subscription the gateway still bills. `UQ_Subscription_ProviderSubscriptionID` keeps one Orders subscription per (provider, gateway id); `CK_Subscription_ProviderSubscriptionHasProvider` keeps an id with its provider and refuses an empty one (`''` or only spaces).
  - **Creating it after checkout.** `PaymentProviderType.SupportsSubscriptionBilling` (the gateway can; set for Stripe) and `BillsSubscriptions` (this account does; off by default) decide whether Orders creates one (`ProviderBillsNewSubscriptions`, `ProviderSubscriptions.ts`; both must be set; read into `PaymentProviderConfig` by `LoadPaymentProviderConfig`). When they are, a checkout whose payment is booked and whose card is kept hands each new auto-renewing subscription to the gateway (`EnsureProviderSubscriptionsOnOwnProvider`, on a provider of its own so the recorded id cannot be rolled back with another request's transaction; never on an update-card renewal). The driver's `CreateProviderSubscription` creates a gateway subscription on the price flagged `PaymentProviderPrice.UseForNewSubscriptions` for the product, whose billing period must match the subscription type's term (`DescribeProviderPrice`; otherwise `PriceMismatch`), that charges nothing now and first charges at **00:00 business time (`BusinessTimeZoneEngine.Zone`) on the last day of the latest term**, so the gateway charges a few hours before Orders' term ends rather than after. The gateway id and the account are then written while `ProviderSubscriptionID` is still unset (NULL). The gateway is searched first by the `OrdersSubscriptionID` in its metadata, and the idempotency key names every parameter and the business day of the attempt, so racing runs on one day share a key, a retry days later finds the first by search, and a refusal staff fixed is asked again the next day rather than replayed from Stripe's 24-hour cache. A live gateway subscription found that bills another price or quantity is still recorded (it bills either way; leaving it unrecorded would add Orders' renewal to it) and raised (`FoundMismatch`). A charge at creation is read from the first invoice's amounts, so a $0 invoice raises nothing. A first charge further out than the gateway accepts today (Stripe: one billing period from creation; a term that starts after the purchase day) is deferred. On an account that does not bill subscriptions the checkout pays one read of the account and nothing more; Stripe's subscription calls time out after 15 seconds.
  - **Never while Orders still has a term to collect.** The latest term's order must be paid (`vwOrderHeaders.Balance`, a real order). Spawn Renewals books term N+1 at the start of its lead window and Charge Renewals collects it on the term's first day; a subscription handed over in between would leave term N+1 unpaid and first charge a year later. So it stays with Orders (`TermUnpaid`, quiet), and the pass after Charge Renewals collected it hands over the term after. A pass reads that state once for all its rows, so just before creating it reads the subscription again through the same query: a term booked in between is seen then.
  - **Problems.** Never fails the sale. Anything a person must act on (no flagged price, no kept card, a stub account (`IsLiveMode = 0`, which refuses rather than invent an id), a price whose period is not the term's, a gateway refusal, fault (`GatewayFault`: it threw while creating, so its state is unknown) or failed read, a failure in Orders before anything was sent to create (`FailedBeforeCreate`: nothing exists at the gateway), an id that could not be recorded, a different id already recorded, a first charge, price or quantity not the planned one, a charge at creation) raises one OPEN alert Task per subscription and problem; once staff close it, the problem raises a new one if it comes back. A problem only a person can clear at the gateway (two live gateway subscriptions, only ended ones, a refused create, a mismatched price) is not retried by the daily pass while its Task is open.
  - **The retry and backfill job.** A replayed checkout never reaches this step again once its payment is booked, so `Orders.CreateProviderSubscriptions` (action; daily job at 02:45 UTC, before Spawn Renewals; ships Disabled, set to Preview and capped at 25 creations a pass, like Spawn Renewals; a preview searches the gateway read-only and reports what a run would create, record (`WouldRecordFound`) or leave for a person (`WouldNeedPerson`), writing nothing, and its search finds only gateway subscriptions Orders created) runs the same code over every eligible unlinked subscription: checkout failures, deferred terms and buyers from before the switch. The run fails only for a newly raised problem. **A host that turns `BillsSubscriptions` on for an account must enable this job**: set it Active, read one preview run's Outcomes, then set Preview to false. Nothing in Orders checks that it did. Until then the checkout's own call is the only attempt: a subscription it could not hand over (`GatewayFault`, `NotRecorded`, or any other problem) has no gateway id, so Orders keeps renewing it, and after a `GatewayFault` or `NotRecorded` the gateway may also hold a live subscription for it that nothing records, so the customer is charged twice. Each such alert Task says so. There is no Remote Operation or screen for it: an operator runs the action, with `SubscriptionID` for one subscription.
  - **A returning buyer.** The checkout refuses another subscription purchase from a buyer who holds an Active, Trialing or Paused subscription the gateway bills in the widget's company (`ProviderBilledSubscription`, [Pre-Purchase Checks](checkout-widget-and-session-architecture.md#pre-purchase-checks)): Orders would extend or add a term the gateway never hears of. A purchase with no subscription product (a ticket) is not refused. A buyer who cancelled in the gateway's portal is still refused until the cancel takes effect: the sync (below) turns automatic renewal off, but the subscription stays Active to its term end.
  - **Once the gateway bills it, no Orders door changes it unseen** (E2b). Every change that would make the gateway's next charge wrong is either carried to the gateway or refused with a message that says where to make it:
    - **Cancel** (`Orders.CancelSubscription`) **reads the gateway first** (`ReadGatewaySubscription` → the driver's `DescribeProviderSubscription`; `GateGatewayCancel`, `ProviderSubscriptionCancel.ts`), because the gateway, not Orders, knows whether it already charged a period Orders has not booked or has already stopped. A period the gateway started at or after 00:00 business time on the latest open term's last day is one Orders has not booked: the gateway charges the renewal then (E2's anchor, so access never gaps), and E4 books it later. Such a cancel is refused with nothing changed and nothing asked of the gateway, because stopping it would keep the renewal it charged that morning: the person cancels and refunds at the gateway, then cancels here. A subscription the gateway has ended (or set to end, with nothing unbooked charged) is **finished**: Orders records the cancel, after the coverage too (effective at the latest term's last day, nothing refunded), which is how support completes a cancel made at the gateway and how a `CanceledAtGatewayOnly` alert is cleared. Otherwise Orders asks the gateway to stop, before its transaction (`CancelAtGateway`; the driver's `CancelProviderSubscription`): the gateway must charge nothing after the end of the effective day in the business zone, now when coverage ends today or earlier, else at its period end (end of term: E2's anchor makes the two the same day) or at that instant. If the gateway cannot be read or does not confirm (refused, unreachable, a stub or inactive account), nothing is written. Inside the transaction the subscription row is locked and its status read again (`UPDLOCK, ROWLOCK`), so two simultaneous cancels cannot book two credit memos: the second sees it cancelled. The gateway id stays on the cancelled subscription; the `Canceled` event records what the gateway did. If the gateway confirmed but Orders' write fails, the cancel rolls back and raises `CanceledAtGatewayOnly`; running it again finishes it. A cancel is refused while an E2 alert says a gateway subscription may be billing unrecorded or twice (`CANCEL_BLOCKING_ALERT_CODES`), and, for a gateway-billed subscription, when those alert Tasks cannot be read (support needs read access to Tasks); and when no open term covers the request day of a subscription the gateway still bills (the gateway renewed it but Orders has not booked that renewal yet, E4). The panel says the gateway bills it, and its preview shows what the gateway will do, named by the coverage end. **End of term on a subscription the gateway still bills (D19)** ends with the latest booked term the gateway had charged by the request day and has not refunded in full, because E4 books a gateway term only once it was paid: cancelled on 31 Dec after the gateway charged and E4 booked term 2, coverage runs to the end of term 2 and the gateway is told to charge nothing after it. A request dated before that renewal (recorded later) keeps the term covering it and the type's refund rule; a renewal the gateway refunded in full is skipped (the message says so) and is cancelled reversing what the gateway refunded and Orders has not already credited. The terms ridden past are stamped `Completed` at their own end. Not for a subscription Orders bills, not when the gateway already ended it, and never for the sync's own cancel.
    - **Every other write** to its billing columns (`PROVIDER_BILLED_FIELDS`: Status, AutoRenew, dates, product, type, the migration links, the provider and its id) is refused by the shared `SubscriptionEntity` on every tier, the edit form and API included. The writes that told the gateway are sanctioned server-side (`SanctionProviderBilledChange`, `SubscriptionEntityServer.ts`). **Linking** (an existing subscription gaining its first id) is sanctioned too: it is the write that makes the gateway bill a subscription and Orders stop renewing it, and it cannot be undone, so a typed id would be a guess (a typo renews free forever; another customer's id points this subscription's Cancel at their gateway subscription). Creating a subscription that already carries an id is the same write and the same guess, so it is linking too. Only server doors link, with the sanction: the checkout hand-over (which created the gateway subscription itself), `LinkProviderSubscription` (below), which checks the gateway subscription first, and the importer (which lets Orders create the subscription at confirm, then links it under the exported sanction).
    - **Another order** for the same product cannot extend, renew or reactivate it (`ProviderBilledPurchaseVerdict`); a **cancelled** one bought again is a fresh start: its gateway id is retired (kept on the `Activated` event) and the hand-over creates a new gateway subscription once paid. The hand-over never records a gateway subscription this subscription already cancelled or retired (`RetiredGatewayIDsFromEvents`): not one its search finds, and not one a create answers with (a replayed request raises `NotRecorded`). A checkout's hand-over finds the re-bought subscription through its new term's order (the subscription keeps its original `OrderLineID`), and its create's idempotency key carries a generation (the number of retired gateway ids), so buying, cancelling and buying again on one day is a new request rather than the cancelled one replayed.
    - **A return** of the line that sold it is refused, except the cancel's own reversal order; **a Duration, Shift, Seats or amount-change concession** on its term is refused when recorded and when approved.
    - **The hand-over** stops (cancels at the gateway) a subscription it created for one that was cancelled or switched off meanwhile (`UnwantedAtGateway`, urgent, if that fails), and searches the gateway again after every create: two live for one subscription (runs straddling business midnight) raise an urgent `AmbiguousAtGateway`.
  - **Hearing the gateway (E3) and booking what it did (E4).** Once the gateway bills a subscription it renews it, fails to collect, retries and ends it; Orders follows. **The gateway's records are the truth, and an event only triggers a re-read**: `SyncProviderSubscription` (`ProviderSubscriptionSync.ts`) reads the gateway subscription (`DescribeProviderSubscription`, with its price, quantity, customer and when it ended) and its invoices since the latest term began (`ListProviderSubscriptionInvoices`), reads Orders' record, asks the pure planner `PlanProviderSubscriptionSync` (`ProviderSubscriptionSyncPlan.ts`) what to do, and does it, on a provider of its own (`WithIsolatedProvider`). It reports every difference it found and what it did; nothing is fixed silently. Planned in this order:
    - **Money first.** A paid renewal invoice (`billing_reason = subscription_cycle`) is a renewal to book only when the period it bills starts a period Orders has not booked: at or after 00:00 business time on the latest term's last day (`StartsUnbookedPeriod`, the same rule as the cancel gate; the period is the subscription's own invoice line, never a proration line). The invoice that paid the period Orders already covers is never booked again: an imported subscriber's current year (the importer records it as a captured payment with the charge and no intent), or a renewal booked earlier. A charge this subscription's payments already record is booked too (`BookedChargeFilter`: `PaymentHeader.ProviderChargeID`, any key, not `Failed`, on an order with a line buying one of its terms or renewing it; the same charge on another subscription's payment, or on a Failed one, is not). Otherwise it is booked by `BookProviderRenewal` (`ProviderRenewalBooking.ts`), the unmatched-charge path's order of steps (`CreateOrderFromProviderPaymentOperation`): with the subscription row locked (`UPDLOCK, ROWLOCK`) and the intent, any payment of the charge, or the $0 renewal's event looked up again under the lock, so two deliveries on two workers book once (SR92-OT), a Succeeded `PaymentIntent` for the gateway's intent, then a renewal order (Origin `ProviderPayment`, the system mark) with one line on the **subscription's own product** (never the gateway price's: imported Professional buyers pay the $399 Foundation price) naming it in `RenewsSubscriptionID`, at **what the gateway charged** (`MarkRenewalPriced`, so neither the concession gate nor order review holds it; choices copied from the latest term's line), Draft then Confirmed, the intent stamped with the order, and `PaymentSucceeded` + `RenewalOrderSpawned` events (`Source: 'Gateway'`, naming the invoice, intent and charge); committed; then the capture through `Orders.CapturePayment`, to the subscription's own company, keyed `provider-charge:<account>:<charge>` (the same key as the unmatched-charge path, so one charge is never booked twice), then any refund the gateway already made on that charge (`RetrieveCharge` → `BookProviderRefunds`). The order may renew a gateway-billed subscription because it carries the server-only mark `SanctionGatewayRenewal`: an active subscription is extended (its term starts the day after the last one ended, whatever day the charge was collected); a **cancelled** one is reactivated, the same subscription, keeping its gateway id, with a `ReactivatedByGateway` Task for support (Q5: a payment already taken is never refused); never a second subscription. Every other order is still refused. A $0 renewal (a 100% coupon) is booked at the last term's unit price, 100% off (`DiscountPct = 1`), because pricing reads a bare 0 on a new line as "no price given". A renewal paid outside the gateway, in another currency, with no intent, naming no billing period, for a subscription with no term, or **carrying tax** is not booked (`RenewalNotBooked`, urgent; tax because the line would be booked net while the capture takes the gross, leaving the tax as spendable credit). Notices on a booked renewal: an amount below the last term's unit price with no coupon on the invoice (`RenewalAmountUnusual`), a different gateway price or quantity than the last gateway renewal (`GatewayPlanChanged`; the product is not switched). A paid invoice that is not a renewal is never booked, and its charge is checked first (the same booked-charge rule). A creation invoice (`subscription_create`) whose charge is booked is in line: an imported subscriber in its first year, whose term-1 payment the importer recorded with that charge, reports nothing; unbooked, it is reported as a difference (E2 raises `ChargedAtCreation` for it; its period is not a test, since an E2 creation invoice's period starts with the term). A plan change's proration (`subscription_update`) always raises `GatewayPlanChanged`, since booking the money does not reconcile the product: booked, it says the charge is booked but the plan changed (old price → new); unbooked, that Orders booked nothing for it. Any other paid invoice raises `GatewayChargeNotBooked` only when its charge is not booked.
    - **Failures.** Each failed collection attempt on an open renewal invoice is a `PaymentFailed` event (once per attempt), and **no order is placed until the gateway is paid** (Q4). While the gateway retries (`Collecting`), the latest term's live grants are kept to the end of the business day of its next attempt, capped at 45 days past the coverage sold (`RETRY_ACCESS_CAP_DAYS`), never shortened. A retry that succeeds books the renewal as above. The retry window is the gateway's own (`next_payment_attempt` on each read), never a number Orders assumes. A gateway that stops retrying without ending the subscription raises `GatewayStoppedRetrying`.
    - **The end state.** Cancelled at period end in the portal: `AutoRenew` off with a `CancellationRequested` event `{Source: 'Gateway', EndsAt}` (sanctioned); withdrawn: back on with `{Withdrawn: true}`. Set to end before the last covered day begins: `GatewayEndsBeforeCoverage` (Orders keeps access to its term end). Ended (a dashboard cancel, or the gateway gave up after its last retry): `Orders.CancelSubscription` records it (it reads the gateway itself and finishes a cancel the gateway completed; a gateway that has ENDED the subscription bills nothing more, so recording that is never blocked by an open gateway alert), `Immediate` on the day it ended when that was before the last covered day began, else `EndOfTerm`. Still renewing a subscription Orders shows cancelled, with nothing charged yet: `RenewingAtGateway`, nothing changed. If Orders' cancel refuses, the run raises `GatewayCancelNotRecorded`, which does not block a later cancel, and the next sync tries again; a refusal because another delivery already recorded it is success.
    - **Three callers.** The payment webhook: an event whose kind the driver lists in `HandledSubscriptionEventKinds` (Stripe: `invoice.paid`, `.payment_failed`, `.payment_action_required`, `.marked_uncollectible`, `.voided`; `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`) and that names a gateway subscription runs the sync for the Orders subscription recording it, matched by (account, gateway id) only; a failed sync answers 500 so the gateway redelivers (the third failed delivery for one subscription raises an urgent `GatewaySyncFailed` Task), and a delivery already Applied is `AlreadyApplied`. The nightly `Orders.SyncProviderSubscriptions` (action; job ships Disabled and in Preview) syncs every gateway-billed subscription that is Active, Trialing, Paused, or cancelled within 400 days, one at a time (~2 gateway reads each), and catches a missed event; every subscription it cannot sync raises an urgent `GatewaySyncFailed` Task, in Preview too. And `LinkProviderSubscription`.
    - **A gateway subscription no Orders subscription records.** Created by Orders' own hand-over (its metadata names an Orders subscription) and not recorded yet: nothing (the hand-over records it). On a price this account does not sell (`PaymentProviderPrice`): `not_ours`, nothing (a legacy subscriber). On a price it sells: `unknown_subscription`, and one open `UnknownGatewaySubscription` Task when the gateway starts billing it (`invoice.paid`, `customer.subscription.created`); nothing booked until a person links it.
    - **Linking** an existing subscription to a gateway subscription (`LinkProviderSubscription`; action `Orders.LinkProviderSubscription`, Preview by default) checks first, refusing before anything is locked or written: the account's gateway can bill subscriptions and is the subscription's company's; the gateway has it and has not ended it; no other Orders subscription records it, and Orders' own hand-over did not create it for another one (its `OrdersSubscriptionID` metadata); this one records no gateway id and no other payment provider yet; the gateway customer's e-mail is the beneficiary's (a mismatch always refuses; with nothing to compare, a person must confirm the customer, `CustomerConfirmed`); and the price it bills maps to the subscription's product (or a person confirms an older price, `AllowPriceOfAnotherProduct`). Then it links (sanctioned) and syncs, which books everything the gateway charged since the latest term began.
    - **The account's switch** (`BillsSubscriptions`) gates handing NEW subscriptions to the gateway (E2) only. A subscription the gateway already bills is followed whatever the switch says: the gateway charges its renewals either way, and the marker alone decides who renews it (as for the renewal jobs above).
    - **A refund the gateway makes of a renewal it charged** (D20) is a credit APPLIED to that renewal, the credit-note way: a money-only reversal order of the renewal line (no grant reduced, no term changed: only a cancel ends access) whose credit `Orders.ApplyAccountCredit` applies to the renewal, so once `Orders.RefundPayment` has un-applied the refunded cash the renewal owes nothing, full refund or partial. One per-term computation (`GatewayRenewalCreditFor`: refunded − already credited, net of tax) serves the refund door (`BookProviderRefunds`, on an isolated provider; the cash booking under the intent's row lock) and the cancel door: on any cancel, a renewal the gateway charged reverses exactly that, never the type's refund rule, when the gateway has ended the subscription or has refunded any of that renewal's charge (the term D19 skips, an `Immediate` cancel, a request dated before the renewal); a renewal it refunded nothing of while it still bills, and every term Orders billed, follow the type's rule. Its sentence in the message is the term's coverage plus the gateway's refund, never the type's refund sentence beside it. Both doors decide under the subscription row's lock and re-read Orders' side after it. A refund too small to split off what is left of the line is held (a Task) until the refund that finishes it; the nightly sync applies any such credit still on account (`SettleGatewayRenewalCredits`). A Task per credit (`GatewayRenewalRefunded`, keyed by the credit order).
    - **Not covered:** disputes (out of scope); a plan changed at the gateway is reported, never mirrored; the grant end while the gateway retries reaches the Learning Hub through the entitlement end-date event (a separate change).
- Cancel is `Orders.CancelSubscription` (policy → reversal). The type's `CancellationMode` decides when coverage ends unless the caller passes `Timing`: `Immediate` ends coverage and access on the request day, `EndOfTerm` on the term's last day; a chosen timing drops the type's grace. The refund mode comes from the type, except for a renewal a payment gateway charged and refunded (D20, above). The subscription form's Cancel subscription control defaults to the type's rule, offers the two timings as overrides, previews the decision and then performs it, offered to a viewer who may update subscriptions, on an Active, Trialing or Paused subscription. A subscription a gateway bills is cancelled at the gateway first (above).
- **Event products** (`EventProduct` IsA, shared UUID with Product) stamp `ServicePeriodStart`/`End` from the event unless the line already set them. `EventOrderLine` holds the attendee, one per line. When `EventProduct.RequiresAttendeeInfo` is set, the order refuses to book unless each line of that event is quantity 1 with an attendee row, and checkout refuses to open a payment intent until each ticket has an attendee with an e-mail (`AttendeeRequirement.ts`). Reversals and bundle components are exempt. Capacity is **not** enforced on confirm.

Revenue recognition is **real forward-dated JEs written at booking**. A 12-month $1,200 subscription writes 12 × $100 Dr Deferred / Cr Revenue dated on the monthly anniversaries. Accounting's batch sweep by date is what "fires" recognition. Staged entries are never edited; corrections are reversing orders.

---

## 9. Reversals

Locked history is never edited.

- Return / cancellation = a **new** Order Header (`ReversesOrderHeaderID`) with negative-quantity lines, and so is the credit memo a return or cancellation books. An amount change's credit memo is not an order; see below.
- A return against an order billed by instalment books a credit memo for the returned units' share of what was invoiced and not yet earned. The returned units' share of what is not yet invoiced is the returning line's `ScheduleReduction`: a partial return lowers the origin's uninvoiced instalments by it, pro rata, and a whole-order return cancels them. The origin's balance, its schedule check and each later instalment invoice read the origin's lines less these reductions, as they do for approved amount changes.
- An approved amount change that needs a credit memo is that memo; no order carries it. `Orders.GenerateInvoice` and `Orders.SendDocument` render it from what the approval logged on the `AmountChanged` subscription event when given its `OrderConcessionID`; the memo goes by email even when the order's company invoices through Bill.com, which carries no credit memos. A re-rendered instalment invoice shows what memos credited it and asks for its balance; a whole-order document subtracts each approved change's memo and schedule reduction, as the order's balance does. Sending is not automatic: the acknowledgment task tells accounting to send it.
- Refund = a new Payment Header (`ReversesPaymentHeaderID`).
- Entitlement grants created at booking are revoked on return (`EntitlementEngine`). Downstream apps **ask** `Orders.CheckEntitlement` (by `ProductEntitlement.Code`); they do not poll `EntitlementGrant.Status`. Status is a recorded decision, not current truth — the evaluator also honours the window and, after cancel, `subscription.EndDate` (grace). `Orders.ListEntitlements` is the person's library, same evaluator. v1 is person grants only. Contract: [`plans/entitlement-read-contract.md`](../plans/entitlement-read-contract.md).
- **A term's days are business days, each covered in full.** A grant that follows a subscription term runs from 00:00 business time (`BusinessTimeZoneEngine.Zone`) on the term's first day to 00:00 business time on the day after its last (`TermGrantWindow`, `TermGrantWindow.ts`): a term ending 31 Dec 2026 in Chicago grants until `2027-01-01T06:00Z`, not `2026-12-31T00:00Z` (6 pm Central on 30 Dec), which cut the last day short and, with a gateway that charges the renewal at 00:00 business time on the last day (E2), locked a renewing customer out for hours. Booking, term extensions and term shifts write that window; the evaluator reads a term's dates and a cancelled subscription's `EndDate` the same way (`TermDayStart` / `TermDayEnd`), so a stored grant and `CheckEntitlement` agree. Grants written before this keep their stored end until next written (no backfill).
- **A cancel writes the end of access onto its grants.** An `Immediate` cancel with no grace, made for today (or before the term has started), ends access at once (`SubscriptionBehavior.EndsAccessOnCancel`, decided by the cancel operation, which alone knows the mode it applied). Every other cancel keeps its access-through day in full, to 00:00 business time after it (`TermDayEnd`), the instant `EvaluateGrantAccess` reads from the cancelled subscription's `EndDate`. Access ended already: the grants are revoked, as before. Access ends later (end of term, a grace period, a cancel cut short at a billing boundary): the standing term grants keep `Active` and their `ValidTo` moves to that instant (`RevokeGrantsForCanceledSubscription`), so a copy of access that follows the grant ends when Orders does. Example (Chicago, term ends 31 Dec): an end-of-term cancel made at 7 pm Central on 31 Dec keeps access to 00:00 Central on 1 Jan; made `Immediate`, it revokes at once. A grant with its own window (not `SubscriptionTerm`) is left alone. A later term's grant, which would start at or after that end (a renewal already confirmed), can never come into force, so it is revoked: a copy of access that provisions on the grant without reading `ValidFrom` (the Learning Hub does) would otherwise give the whole later term.
- **Grant changes reach consumers, dates included.** A grant created, or a save changing its `Status`, `ValidFrom` or `ValidTo`, records a `GrantStatusChanged` outbound event naming what changed ([outbound-events.md](outbound-events.md)).
- **Every alert Task is assigned.** The alert Tasks Orders raises (a checkout payment not booked, a settled payment with no order, a dead-lettered outbound delivery) are assigned to the active holders of the role the `AlertTaskRole` setting names (`AssignAlertTask`), so the tasks app notifies a person. Unset, they stay unassigned. An assignment that fails is logged; the alert stands, and the scheduled outbound pass assigns open alerts that have no assignee, every 15 minutes (`AssignUnassignedAlertTasks`), so a failure or a role set later is caught up. An alert someone closed is never assigned or notified again; one left Open with every assignee removed is assigned again.

---

## 10. UI

Explorer mounts four `Application` nav items from `metadata/applications/.orders-application.json`. Each names a `DriverClass` that must stay imported from `public-api.ts` or the tab is blank.

| Tab | DriverClass | Job |
|---|---|---|
| Orders | `OrdersSectionResource` | Dashboard, all orders, fulfillment queue, returns |
| Payments | `PaymentsSectionResource` | Dashboard, all payments, refunds, account credits |
| Receivables | `ReceivablesSectionResource` | Customer A/R, overdue worklist, billing worklist, invoicing queue, progress attestation, subscriptions |
| Catalog | `CatalogSectionResource` | Products and categories, pricing, promotions, charges and tax |

The rails are defined in `packages/Angular/src/lib/sections/section-nav.model.ts`; [`orders-api-and-ui-architecture.md`, "Tabs and section rails"](orders-api-and-ui-architecture.md#tabs-and-section-rails) has them with the reasoning. Records open with `NavigationService.OpenEntityRecord` (or `OpenNewEntityRecord` for `/new`). Do not invent a workspace tab strip.

**Forms**

- **Order Headers**, **Payment Headers** and **Event Order Lines** have custom forms registered over the generated ones (`packages/Angular/src/lib/custom/`). **Products** renders the generated template through a registered save guard (`product-save-guard-form.component.ts`) that adds a save-time confirmation.
- **Order Header** form: `ShowRelatedEntities: false`, leftover related blocked. Collapsible header persists in `UserInfoEngine` key `mj.orders.orderForm.headerExpanded` (`'0'`/`'1'`). New records always expand; the pref applies only when opening an existing record. Money trio (Total / Paid / Balance) shows cents on all three if any has cents.
- Subscriptions, Subscription Terms, Price Lists and Promotions use the **generated** form plus slot contributions and `Layout: left-nav`.
- Person / Organization **Orders** grids pass every filter join field as `NewRecordValues` so New opens an order already linked (`BillToPersonID` + `ShipToPersonID`, or org equivalents).

Form chrome (Overview as a lead, rail order, user drag overlay) is MJ form chrome + `MJ: Form Chrome Rules` (L3). Contribution last-wins by `contributionKey` and ClassFactory Priority.

Page chrome uses `<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>`. Lists use `mj-entity-data-grid`. Related grids in accordion mode size to toolbar + header + rows (see MJ `RelatedGridHeightPx`).

Zoneless: anything assigned to `this.*` after `await` needs `this.cdr.detectChanges()` in that body. `render-after-load.test.ts` enforces it.

---

## 11. Tests

| Tier | What | How |
|---|---|---|
| Unit | Entity rules, pricing math, IA, render guard | `pnpm run build`, then `pnpm run test:unit` (repo root) |
| Integration (server) | Booking, JEs, payments, subs — real `SQLServerDataProvider`, **always rolled back** | `pnpm run test:integration` (`node test-harnesses/integration.mjs`), after `pnpm run build` |
| Integration (client) | Catalog + party CRUD over GraphQL | `GRAPHQL_PORT=4103 node test-harnesses/integration-client.mjs` |
| Committed seed | Same engine, left on disk for inspection | `node test-harnesses/seed-review-data.mjs` |
| Mockup fidelity | Static screens | `node mockups/verify.mjs` |

`pnpm run verify` runs the unit tests, the build and the integration suite, then fails if any check failed or fewer ran than `packages/IntegrationTests/src/__tests__/registry-parity.test.ts` declares.

Server ITs import `@mj-biz-apps/orders-server` and call `LoadBizAppsOrdersServer()`, which registers `OrderEntityServer` from `orders-core-entities-server`. Without that, Confirm runs the generated entity and the suite measures nothing.

Client ITs must **not** import `*EntityServer` — those constructors throw on `GraphQLDataProvider`. Booking over the wire is `order.Save()` against MJAPI, which dispatches to the server subclass.

`RUN_MUTATION_TESTS=1` is required for `mj test`. Without it the driver reports zero checks and passes.

The check that matters most: **`advance-order-state.ADV8`** — an unbooked order is refused. A single UPDATE setting `FulfillmentStatus = 'Fulfilled'` produces a complete-looking order with no ledger.

---

## 12. Local run

This repo holds the app's packages, migrations and metadata. It has no MJAPI or MJ Explorer of its own (the `apps/` harness was removed in the move to pnpm), so running the API or the UI means hosting the app in an MJ instance. The build needs only `pnpm install`; the unit tests need the build (they load the other packages from `dist/`). Neither needs a database; the server integration suite does.

### Settings

Copy [`.env.example`](../.env.example) to `.env` (gitignored). `mj.config.cjs`, the MJ CLI, `scripts/` and `test-harnesses/` read it.

| Keys | Read by |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | `mj sync`, `mj test`, the scripts and the harnesses. `mj migrate` and `mj codegen` use the same host, port and database. |
| `DB_TRUST_SERVER_CERTIFICATE` | The MJ CLI (`mj migrate`, `mj codegen`, `mj sync`, `mj test`) `scripts/backfill-checkout-answers.mjs` and `scripts/move-subscription-types.mjs`. The harnesses and the shell scripts always trust the certificate. |
| `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD` | The login `mj migrate` and `mj codegen` connect with; `seed-demo-data.mjs --reset` also uses it to stand down the immutability triggers |
| `MJ_CORE_SCHEMA` | MJ core schema name; default `__mj` |
| `MJ_CORE_VERSION`, `BIZAPPS_COMMON_REPO`, `BIZAPPS_TASKS_REPO`, `BIZAPPS_ACCOUNTING_REPO`, `INTEGRATION_USER_EMAIL` | `scripts/rebuild-db.sh` only |

CodeGen also needs an AI key in `.env`; [`CLAUDE.md`](../CLAUDE.md) names it.

### A database from zero

After `pnpm install`, `scripts/rebuild-db.sh` drops the database `.env` names and rebuilds it:

1. MJ core migrations from the MJ git tag `MJ_CORE_VERSION`. Keep it equal to the `@memberjunction/core` version `pnpm-lock.yaml` resolves, as `.env.example` does; the script's built-in default is older.
2. bizapps-common, applied with `sqlcmd` from `BIZAPPS_COMMON_REPO` (default `../bizapps-common`).
3. bizapps-tasks and bizapps-accounting with `mj migrate --schema`, from `BIZAPPS_TASKS_REPO` and `BIZAPPS_ACCOUNTING_REPO` (defaults `../bizapps-tasks`, `../bizapps-accounting`).
4. This repo's migrations as committed, with their CodeGen output, so no CodeGen run follows.
5. Seed metadata: common's query categories, accounting's currencies and GL account roles, then this repo's `metadata/`.
6. A human user (`INTEGRATION_USER_EMAIL`) and the Account Director role for the Owner, which the integration suite needs.

So it needs checkouts of bizapps-common, bizapps-tasks and bizapps-accounting, and `sqlcmd` on the path. It is for a new, empty database only; schema changes are new migrations ([`database-migrations.md`](database-migrations.md)). Then `pnpm run build` and `pnpm run test:integration`.

### Hosting the app in an MJ instance

What the repo establishes:

- `mj-app.json` names what a host loads: the server bootstrap `@mj-biz-apps/orders-server` (startup export `LoadBizAppsOrdersServer`) with `@mj-biz-apps/orders-core-entities-server`, the client bootstrap `@mj-biz-apps/orders-ng` (`LoadBizAppsOrdersClient`), and the shared `@mj-biz-apps/orders-entities` and `@mj-biz-apps/orders-actions`.
- A published release installs with `mj app install` (see the [README](../README.md#installation)).
- MJAPI loads the server bootstrap from the host `mj.config.cjs` `dynamicPackages.server[]` and collects the app's server extensions (payment webhook, checkout edge, Bill.com webhook) from `MJ_SERVER_EXTENSIONS`; the host's `serverExtensions[]` overrides them by `DriverClass` ([`packages/Server/README.md`](../packages/Server/README.md)). This repo's own `mj.config.cjs` has no `dynamicPackages`: it configures CodeGen for the app under development.
- The MJ CLI pinned here has `mj dev workspace`, which joins sibling clones (MJ and the BizApps repos) into one pnpm workspace at their common parent directory. It links packages only; it does not register the app in a running host. In such a workspace, run `pnpm install` at the parent, never inside a member repo.
- Docs and harness examples use port `4103` for MJAPI (`GRAPHQL_PORT`; MJ's default is 4000) and `4303` for Explorer. Nothing in this repo sets either.

Not documented here yet: the steps that register a local checkout in a running MJAPI and MJ Explorer (the host's `dynamicPackages` entries, how Explorer picks up `@mj-biz-apps/orders-ng`, and any host `package.json` changes). Those host edits are local wiring: do not commit them.

---

## 13. What is not this app

- **Stripe / Business Central export live tests** — other team. Bill.com is part of this app: the invoice rail, its operations and its webhook ship here ([`billcom-invoice-rail.md`](billcom-invoice-rail.md)), and `test-harnesses/billcom-live.mjs` probes a Bill.com sandbox by hand. `test-harnesses/stripe-live.mjs` runs `Orders.CreateOrderFromProviderPayment` (#575) and renewal charging with the update-card link (#894) against Stripe's test mode by hand, one group at a time with `--only`: the integration suite's Stripe stub has no charges to read and answers a saved-card charge from the test card's name.
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
| Subscriptions | `SubscriptionBehavior.ts`, `CancelSubscriptionOperation.ts`, `SpawnRenewalsOperation.ts`, `RenewalCharging.ts` |
| Explorer sections | `packages/Angular/src/lib/sections/` |
| Order compose form | `packages/Angular/src/lib/custom/OrderHeader/` |
| Form contributions | `packages/Angular/src/lib/form-panels/` |
| IT fixture / builders | `packages/IntegrationTests/src/fixture.ts`, `order-builder.ts`, `payment-builder.ts` |
| Entity name strings | `packages/IntegrationTests/src/entity-names.ts` |
