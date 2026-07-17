# FEATURE-LIST — bizapps-orders

> Derived from the plan chain @ `09c7da5` (2026-07-17) · MODs through MOD-13 · UPDs through UPD-10
> Staleness check: git log 2aa2ea2.. -- plans/MASTER-PLAN.md plans/MASTER-PLAN-MODIFICATIONS.md plans/MASTER-PLAN-UPDATES.md
>
> DERIVED document — the plan chain (MASTER-PLAN + MODs + UPDs) is the authority; when they disagree,
> fix this file. Convention: `~/MJDev/shared-plans/feature-list-amendment.md` (PLANNING-SYSTEM FEATURE-LIST
> section). IDs stable, never reused. Cross-repo prefix: `ORD-`.
> Status vocab: `Shipped` · `Building` · `Planned` · `Deferred` · `Removed (MOD-x)`.
> ⚠ Statuses marked ◇ are taken from the feature agent's ledgers and are pending the **Task 65b
> feature-wave sign-off review** — treat as claimed-not-verified until that review closes.

## A. Product catalog

| ID | Feature | Status | Source |
|---|---|---|---|
| A.1 | ProductType with behavior defaults (rev-rec, taxability, fulfillment, cadence) | Shipped | §4.1, BO-D31; S1 |
| A.2 | Product + ProductCategory (hierarchical) + SKU/lifecycle/successor | Shipped | §4.1; S1 baseline |
| A.3 | Role-based GL mapping via accounting `GLAccountLink` (no GL columns on Product) | Shipped | MOD-2 |
| A.4 | Type-driven IsA extension entities (EventProduct/EventOrderLine etc.) | Shipped ◇ | BO-D37/D42; S5 |
| A.5 | Seeded out-of-the-box product types (Event, Membership, PhysicalGood, …) | Shipped ◇ | BO-D42; S5 |
| A.6 | ProductBundleItem schema (bundle line + fast-path, two modes) | Shipped ◇ | BO-D32/D41; S5 |
| A.7 | ProductBehavior plugin seam (ClassFactory, Before/After hook surface) | Deferred | BO-D38; DEFERRALS (F7 row) |
| A.8 | ASC-606 fields (SSP, ProductPerformanceObligation); allocation engine v2 | Shipped ◇ (fields) / Deferred (engine) | BO-D35; S5 + DEFERRALS |
| A.9 | Product variants (SKU matrix) | Deferred | BO-D32; DEFERRALS |
| A.10 | Usage/metered pricing model fields; metered billing engine v2 | Shipped ◇ (fields) / Deferred (engine) | BO-D36; DEFERRALS |

## B. Pricing

| ID | Feature | Status | Source |
|---|---|---|---|
| B.1 | PriceList / ProductPrice / PriceTier tables (effective-dated, models, fee types) | Shipped | MOD-6 rev.; S5 (built 2026-07-14) |
| B.2 | Pricing resolution engine (BO-D33 precedence; UnitPrice direct entry = base) | Planned | MOD-6; feature plan F9 |
| B.3 | Coupons: LAUNCH = `CouponProvider` model, Stripe first adapter + order-level & line-level (`DiscountAmount`) recording; Orders-native Coupon entity (S7) = fast-follow provider | Planned — recording schema freeze awaits 2 investigations + Sidecar answers; OS7 review BLOCKED until the action plan is shared with Robert | UPD-8 (Robert A2/OS7); MOD-6 ext.; coupon action plan (re-sequence) |

## C. Order lifecycle

| ID | Feature | Status | Source |
|---|---|---|---|
| C.1 | Order/OrderLine entities; per-line company via resolved account + `Order.CompanyID` OWNING-company header (+ `Product`/`Subscription` company-column renames; company-default resolution rung) | Shipped / Building — Q2 schema amendment pending | §4.2, MOD-3 (rev. 2026-07-16); S1 |
| C.2 | Status flow Draft→Quoted→Confirmed→Posted→Fulfilled; transition matrix + validation | Shipped ◇ | BO-D8 + MOD-1; F1 |
| C.3 | Forward status skipping (Quoted optional; effects still enforced) | Shipped ◇ | MOD-10; F1.1 |
| C.4 | Void only from Draft/Quoted; after Confirm → reversing/credit order | Shipped ◇ | MOD-7; F1/F2 |
| C.5 | Totals computation + validation (LineTotalNet/Gross, order rollups) | Shipped ◇ | §4.2; F1 |
| C.6 | Backdating allowed (OrderDate carried; NO closed-period guard — final) | Shipped | MOD-9b, CA-3 |
| C.7 | Auto-advance Posted→Fulfilled when no line requires fulfillment | Shipped ◇ | UPD-3; F1.6 |
| C.8 | Per-line fulfillment queue (Fulfiller flip Pending→Fulfilled, last-line auto-advance) | Deferred | DEFERRALS (F1 row) — needs F6/A2 roles |
| C.9 | Order naming (`Order.Description`) + moving-window filter presets (Order History) | Shipped | MOD-9c |
| C.10 | `ExternalDocumentNumber` (bill.com identity) | Shipped ◇ | UPD-1; S1 |
| C.11 | Service period on OrderLine (`ServicePeriodStart/End`) | Shipped ◇ | UPD-2; S1/S3 |
| C.12 | Order numbering format (single vs dual sequence) | Planned — decision needed (Jeremy) | §15 Q1; BACKLOG |

## D. Order as the A/R primitive

| ID | Feature | Status | Source |
|---|---|---|---|
| D.1 | No Invoice entity — posted Order IS the receivable (number, tax point, due date) | Shipped | BO-D45/D15, CA-2 |
| D.2 | A/R fields: TotalGross / AmountPaid / Balance / DueDate / PaymentStatus | Shipped | §4.3; S1 |
| D.3 | `IsOverdue` computed/virtual surface (`Balance > 0 AND DueDate < now`, never stored) | Shipped ◇ | UPD-6.2 (LXP D15); F1.3 |
| D.4 | Credit memo = negative-balance Order (Return/CreditMemoOrder + ReversesOrderID) | Shipped ◇ | BO-D15; F2 |
| D.5 | Credit settlement paths: refund payment · apply-to-order · write-off | Building ◇ (write-off deferred per plan Q4) | §4.3; F2.3 |
| D.6 | Statements / consolidated bills as packaged reports | Deferred | BO-D45, §15 Q13; DEFERRALS |
| D.7 | Customer-facing rendered order/invoice document + delivery (email / bill.com) | Deferred — Q-D decision gated | §15 Q8; DEFERRALS |

## E. JE booking (accounting integration)

| ID | Feature | Status | Source |
|---|---|---|---|
| E.1 | Book JEs on FIRST transition to Confirmed (idempotent; failure blocks Confirm) | Shipped | MOD-1; OrderEntityServer |
| E.2 | One JE PER COMPANY at booking (split by resolved `GLAccount.CompanyID`) | Shipped ◇ | MOD-11; F1/F0 |
| E.3 | Atomic all-or-none booking via `Accounting.CreateJournalEntries` (one TransactionGroup) | Shipped | MOD-5 + F1.2b (proven E5 rollback) |
| E.4 | Lineage: soft refs (`JournalEntry.OrderID` etc.) + polymorphic `JournalEntryLink` | Shipped | §7 |
| E.8 | `OrderJournalEntry` junction entity (OrderID + JournalEntryID, real FKs) replaces the single `Order.JournalEntryID` | Planned — with the MOD-11/F1 rework | UPD-7 |
| E.5 | Reversal JEs booked from reversing/credit orders (mirror JE, net-zero) | Shipped ◇ | §6; F2 |
| E.6 | Formal JE→JE reversal linkage (EntryType='Reversal' + ReversesJournalEntryID) | Deferred | DEFERRALS (F2b row) |
| E.7 | JE pattern selection from product metadata (rev-rec type × order type × reversal) | Shipped ◇ | §7; orderJournalDraft |

## F. Payments

| ID | Feature | Status | Source |
|---|---|---|---|
| F.1 | Payment / PaymentIntent / PaymentLine entities (fee/net settlement fields) | Shipped | §4.5, BO-D46/D47; S2 |
| F.2 | ManualPaymentProvider (Wire/ACH/Check/Cash) | Shipped ◇ | Phase E; F3 |
| F.3 | Stripe success-STUB provider (default test provider; no committed credentials) | Shipped ◇ | F3.5; Marcelo 2026-07-14 |
| F.4 | Stripe REAL — LXP-checkout subset (PaymentIntent lifecycle + hosted checkout + webhook→capture) | Planned — un-deferred for LH4I launch | DEFERRALS (Stripe row); F3.5b |
| F.5 | Stripe REAL — recon + forensics log + idempotency stress (the deep half) | Deferred | DEFERRALS |
| F.6 | Payment capture JE (Dr Cash net / Dr Processing Fee / Cr A/R gross) | Shipped ◇ (fee leg dormant: role/account unseeded) | BO-D47; F3 + DEFERRALS row |
| F.7 | Payment application (PaymentLine cash application; auto-apply suggestion later) | Shipped ◇ (manual) / Planned (suggestion) | BO-D16; F3.3 |
| F.8 | Refund / chargeback / bank-return as reversal Payments | Shipped ◇ | BO-D9/D14; F3 |
| F.9 | CustomerPaymentMethod token vault (charge-on-file) | Shipped ◇ (schema) | BO-D46; S2 |
| F.10 | Webhook receiver (unauthenticated route + HMAC verify + idempotency) | Planned — lands with F.4 | BO-D13 |
| F.11 | Gift card / stored value (issuance liability + redemption provider + ledger) | Deferred | BO-D44; DEFERRALS (F7 row) |
| F.12 | Provider expansion (PayPal / Square / Authorize / Adyen) | Deferred | BO-D23/D29; DEFERRALS |
| F.13 | Payment dispute case management | Deferred | BO-D47; DEFERRALS |

## G. Subscriptions & revenue recognition

| ID | Feature | Status | Source |
|---|---|---|---|
| G.1 | Subscription / SubscriptionPlan / SubscriptionEvent entities | Shipped | §4.4; S3 |
| G.2 | Rev-rec waterfall computation (RevenueRecognitionSchedule + lines; two shapes: single-date + period) | Shipped ◇ | BO-D11, UPD-2; F4 |
| G.3 | ScheduledJournalEntry bridge (dated entries created up-front at booking-lock) | Removed (MOD-12) — as-built bridge retires with accounting MOD-17 rework | UPD-2 → MOD-12 |
| G.4 | Materialization of due scheduled entries | Removed (MOD-12) — no materializer/daily job by design | B3.2 → MOD-12 |
| G.11 | Rev-rec staged as REAL forward-dated JEs at booking (waterfall math per G.2 stands); correcting-Order netting on change/cancel | Planned — rework from as-built G.3/G.4 | MOD-12 (P5); accounting MOD-17 |
| G.5 | Subscription lifecycle: find-or-extend-or-create on first Confirm | Deferred | BO-D40; DEFERRALS (F4 row) |
| G.6 | Renewal-order spawning — spawn as Draft at launch; `RenewalSpawnStatus` per type/plan (Draft/Quoted/Confirmed); exceptions via SalesRule; no per-order accounting gate by default | Deferred (shape now RULED) | BO-D40 + UPD-9 |
| G.7 | Overdue detection + dunning worklist (`Orders.GetOverdueWorklist`) | Shipped ◇ | F3.6 |
| G.8 | Dunning grace policy — configurable `DunningGracePeriodDays` (default 7), notify-CS-not-auto-cancel | Planned | UPD-6.3 (LXP D16); F3.6 |
| G.9 | Dunning reminder delivery channel + provider retry policy | Deferred — Q-D gated | DEFERRALS (F3.6 row) |
| G.10 | Fulfillment ↔ rev-rec DISCONNECTED (no JE on Posted→Fulfilled) | Shipped | MOD-8 |

## H. Sales rules & approvals

| ID | Feature | Status | Source |
|---|---|---|---|
| H.1 | SalesRule + SalesAuthority schema (S6) | Shipped ◇ | BO-D17/D18; S6 |
| H.2 | Rule evaluation engine at Order Confirm | Planned — unblocked (tasks #8 verified satisfied 2026-07-15) | F8 |
| H.3 | Approval Request Task integration (route to role; approve→proceed, reject→Draft) | Planned | BO-D27; F8 (reuse accounting TasksAppApprovalGate pattern) |
| H.4 | Rule editor UI | Planned | Phase F |

## I. Entitlements

| ID | Feature | Status | Source |
|---|---|---|---|
| I.1 | ProductEntitlement definitions + EntitlementGrant instances w/ beneficiary | Shipped ◇ | BO-D34/D39; S5 + F7 |
| I.2 | Entitlement change notification for consumers (poll via Scheduled Job + RSP — no webhook system) | Planned | UPD-6.4 (LXP D14) |
| I.3 | Provisioning/enforcement engine | Deferred | BO-D39 (later per master) |

## J. Multi-company & intercompany

| ID | Feature | Status | Source |
|---|---|---|---|
| J.1 | Multi-company orders (per-line company via resolved account; receiving company on Payment) | Shipped | BO-D5 intent + MOD-3/MOD-11 |
| J.2 | IntercompanyFlow records + Due-From/Due-To leg generation | Deferred — Payments maturity + accounting `IntercompanyRelationship` | BO-D6; feature plan Deferred |

## K. Tax

| ID | Feature | Status | Source |
|---|---|---|---|
| K.1 | Order tax structure — RULED: Option B durable shape (ProductTaxCategory + OrderLineTaxLine snapshots + provider seam); calculation delegated to a third-party engine | Planned — structure ruled (Q21 ANSWERED); launch-tax + engine selection = Q22 finance calls | Q21 answer; accounting MOD-18 |
| K.2 | OrderLineTaxLine per-jurisdiction breakdown + provider invocation at line time | Planned — structure unblocked; behind the Q22 launch-tax call + engine selection | BO-D20; Q21 answer |

## L. FX / multi-currency

| ID | Feature | Status | Source |
|---|---|---|---|
| L.1 | Currency/FX columns + realized-FX emission | Deferred | MOD-4; DEFERRALS |

## M. Roles & permissions (orders-side)

| ID | Feature | Status | Source |
|---|---|---|---|
| M.1 | Orders-seeded roles (order entry, Order Fulfiller) + RLS enforcement | Planned — mechanism now RULED (accounting `UserCompanyRole` grant table, acct Q22/Q24 answers); A2 co-design executes | MOD-9a; F6; acct Q22 answer |

## N. Consumers & integrations

| ID | Feature | Status | Source |
|---|---|---|---|
| N.1 | LXP (Sidecar) launch surface: LH4I individual checkout (tiers + coupons + Stripe upfront), wired **LXP→Orders DIRECT** (BCSaaS wrap = fast-follow; Teams-first contingency if BAO slips) | Planned — composite: B.3 + F.4 + I.2 (+K per Q22 tax call); date = Q22/A7 | UPD-6.1 + MOD-13; ROADMAP-lxp-launch.md |
| N.2 | CDP data migration — cutover RULED: transfer open invoices WITHOUT existing GL JEs only (normal pipeline books them); Jeremy identifies the set | Deferred — aidp Stage 4 | §13; UPD-10 |
| N.3 | Customer portal / storefront | Deferred | §15 Q9; DEFERRALS |
| N.4 | Lightweight browser catalog config (lazy/paged) for OrdersEngineBase | Deferred | DEFERRALS (F0 row) |

## O. Engine architecture

| ID | Feature | Status | Source |
|---|---|---|---|
| O.1 | OrdersEngineBase (client-safe) + server-only OrdersEngine split | Shipped ◇ | UPD-5; F0 |
| O.2 | Account resolution (product → category tree → company default) via accounting engine | Shipped | MOD-2; OrdersEngine.ResolveAccount |
