<p align="center">
  <img src="https://raw.githubusercontent.com/MemberJunction/MJ/main/logo.png" alt="MemberJunction" width="120" />
</p>

<h1 align="center">BizApps Orders</h1>

<p align="center">
  <strong>Unified order-management substrate — products, orders, payments, and subscriptions — for the <a href="https://github.com/MemberJunction/MJ">MemberJunction</a> platform</strong>
</p>

<p align="center">
  <a href="#what-this-is--and-is-not">What this is</a> &middot;
  <a href="#installation">Install</a> &middot;
  <a href="#what-you-get">What you get</a> &middot;
  <a href="#product-management">Products</a> &middot;
  <a href="#entity-model">Entity Model</a> &middot;
  <a href="#using-bizapps-orders-in-your-code">Code</a> &middot;
  <a href="docs/HOW_THE_SYSTEM_WORKS.md">How it works</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/Status-Engine%20shipped-green?style=flat-square" />
  <img alt="MJ Version" src="https://img.shields.io/badge/MemberJunction-5.40%2B-blue?style=flat-square" />
  <img alt="Angular" src="https://img.shields.io/badge/Angular-21-DD0031?style=flat-square&logo=angular&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="SQL Server" src="https://img.shields.io/badge/SQL%20Server-2019%2B-CC2927?style=flat-square&logo=microsoftsqlserver&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-ISC-green?style=flat-square" />
</p>

---

> **How the system works today:** [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md). This README is a tour. Historical design (D1–D84) is in [`plans/archive/`](plans/archive/). Do not treat the archive as the current schema or API.

A customer commits to pay; the system tracks both **what they're getting** and **how they're paying**. BizApps Orders treats orders, payments, and subscriptions as **aspects of the same business event** and ships them as one **MemberJunction Open App** — so an MJ adopter installs a single dependency and has working order management in days, rather than stitching together separate payments and subscriptions packages.

The model is deliberately lean: **the substrate is Products → Orders → Payments.** A confirmed/posted **Order is both the customer's commitment and the A/R document** (its own bill) — there is no separate Invoice entity *(D2)*. Recurring cadence lives one level up, in Subscriptions that spawn a fresh Order each billing cycle *(D20)*.

Orders is the **orchestrator**; it does not keep the ledger. Every business event that requires accounting (order line booked, payment captured, revenue recognized, refund issued) is emitted as a balanced journal entry into [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting), which batches the subledger to the ERP. Tax calculation delegates to a third-party engine (Stripe Tax / Avalara class) behind Accounting's provider seam *(D23)*; contract terms belong to a future BizApps Contracts; the customer master lives in [BizApps Common](https://github.com/MemberJunction/bizapps-common); workflow/approvals run on [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks).

---

## What This Is — and Is Not

| ✅ This is | ❌ This is not |
|---|---|
| The transactional substrate: products, orders, payments, subscriptions | The general ledger (calls into BizApps Accounting) |
| **Order as the A/R primitive** — the confirmed/posted order *is* the receivable & the bill | A separate invoicing system (no Invoice entity; bills/statements are reports) |
| Multi-company native — one order can carry lines owned by different subsidiaries; **each line books its own single-company JE** | A tax engine (a third-party engine calculates; we send inputs and snapshot results) |
| Payment-provider agnostic (Stripe first; others pluggable via `RegisterClass`; Manual always available) | The contract layer (terms / escalators / renewals are future BizApps Contracts territory) |
| Subscription-aware — a continuity record spawning a per-cycle renewal Order | An e-commerce storefront / customer portal |
| Reversal-disciplined — returns, refunds, chargebacks, credit-memo orders, cancellations at every layer, each emitting reversal JEs | A CRM (customer master lives in BizApps Common) — nor inventory/COGS (future BizApps Inventory bolt-on) |

See [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md) for the current surface and the explicit out-of-scope list.

---

## Installation

BizApps Orders is a [MemberJunction Open App](https://github.com/MemberJunction/MJ/tree/main/packages/OpenApp). Once published, install it into any MJ environment using the [MJ CLI](https://github.com/MemberJunction/MJ/tree/main/packages/MJCLI):

```bash
mj app install https://github.com/MemberJunction/bizapps-orders
```

The CLI resolves dependencies automatically — installing this app pulls in [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) (GL accounts + roles/links, JournalEntry primitives, Currency, dimensions), [BizApps Common](https://github.com/MemberJunction/bizapps-common) (Person, Organization, Address), and [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks) (the workflow/approval substrate).

### Managing an installed app

```bash
mj app info mj-bizapps-orders     # Show details and version
mj app upgrade mj-bizapps-orders  # Upgrade to latest release
mj app disable mj-bizapps-orders  # Temporarily disable
mj app enable mj-bizapps-orders   # Re-enable
mj app remove mj-bizapps-orders   # Uninstall (--keep-data to preserve schema)
```

---

## What You Get

### Database (`__mj_BizAppsOrders` schema)

| Area | Tables | Purpose |
|---|---|---|
| **Catalog** | `ProductType`, `Product`, `ProductCategory`, `ProductPrice`, `PriceList`, `PriceTier` | Sellable items with type-driven behavior, per-company categories, segmented & tiered pricing, rev-rec policy. **No GL account columns anywhere** — routing is role-based via Accounting (D5) |
| **Composite & policy** | `ProductBundleItem`, `ProductPerformanceObligation`, `ProductEntitlement` | Bundles/kits, ASC-606 performance obligations (SSP fields now, allocation engine later), and *what a purchase grants* |
| **Type extensions (IsA)** | `EventProduct` / `EventOrderLine` | Per-type attributes via MJ IsA disjoint subtypes (shared UUID) at Product *and* OrderLine level — Event ships as the first pair; `ProductType` names the extension entities so new types add their own |
| **Orders & A/R** | `Order`, `OrderLine`, `OrderLineDimension`, `OrderSequence` | The commitment **and the receivable** (Order carries `TotalGross` / `Balance` / `PaymentStatus` / `DueDate`); one JE per line via `OrderLine.JournalEntryID`; accounting dimension tags per line; `ORD-{seq}` numbering |
| **Payments** | `Payment`, `PaymentProvider`, `PaymentIntent`, `PaymentLine`, `CustomerPaymentMethod`, `PaymentSequence` | Provider-agnostic capture / refund / chargeback; `PaymentLine` applies cash to Orders; saved-instrument token vault (charge-on-file) |
| **Stored value** | `StoredValueAccount`, `StoredValueTransaction` | Gift cards / stored value — schema ships now; issuance/redemption flows are a later named item (§21) |
| **Subscriptions** | `SubscriptionPlan`, `Subscription`, `SubscriptionEvent` | Continuity record that spawns a renewal Order each cycle (Draft at launch, D20); lifecycle + immutable event log |
| **Revenue recognition** | `RevenueRecognitionSchedule`, `RevRecScheduleLine` | The **computed envelope** for MRR/ARR display and computation — the ledger truth is real forward-dated JEs written at booking (D14) |
| **Entitlement grants** | `EntitlementGrant` | The provisioned instance of an entitlement, with a **beneficiary** (may differ from the buyer); consumers poll — no webhook system |
| **Sales governance** | `SalesRule`, `SalesAuthority`, `PaymentTermsType` | Metadata-driven discount/credit/authorization rules; per-rep limits; payment terms (owned here — Accounting delegates to it) |

Tax tables (`ProductTaxCategory`, `OrderLineTaxLine`) land with the tax build (D23). Coupon recording columns land with the D22 schema freeze.

### TypeScript Packages

| Package | NPM Name | Role |
|---|---|---|
| **Entities** | `@mj-biz-apps/orders-entities` | Strongly-typed entity classes with Zod validation |
| **Actions** | `@mj-biz-apps/orders-actions` | Server-side action handlers (webhook processing, scheduled work) |
| **Server** | `@mj-biz-apps/orders-server` | GraphQL resolvers, remote operations (`Orders.ConfirmOrder`, `Orders.RefundPayment`), the server `OrdersEngine`, the `OrderJournalEntryFactory`, and pluggable `PaymentProvider` implementations |
| **Angular** | `@mj-biz-apps/orders-ng` | UI components, form overrides, custom widgets (forms-first, D33). The Order Header form puts **Ship To** on the left (starts expanded) and **Bill To** as a slim rail that takes the width when selected. Person and Organization **Orders** grids pass every filter join field as `NewRecordValues` so **New** opens an order already linked to that party (`BillToPersonID` + `ShipToPersonID`, or the org equivalents). |
| **Core Entities Server** | `@mj-biz-apps/orders-core-entities-server` | Server-only entity subclasses — the Order `Save()` override that books on lock, numbering, totals & balance maintenance |

---

## Core Principles

### Order is the substrate *and* the A/R primitive
The `Order` is the customer's commitment **and the bill**. Subscriptions are born from order lines; payments apply to orders; rev-rec hangs off lines. There is **no Invoice entity** — a confirmed/posted Order *is* the receivable, with `Balance = TotalGross − SUM(posted PaymentLine.Amount)` and a `PaymentStatus`. A **credit memo is a negative-balance Order** (`ReversesOrderID` set). The customer-facing "invoice" and any consolidated statement are **rendered reports**, not entities *(D1, D2)*.

### One JE per order line — always
Every order line books its **own complete, single-company journal entry** — even multiple lines of the same company. The "order-level JE" is a **UI aggregation concept**, never a row; batching nets the line JEs later anyway. Linkage is `OrderLine.JournalEntryID` (the Order header carries no JE ref; no junction table) *(D10)*.

### Booking fires once, atomically, on first Confirm
Booking fires exactly once, on the **first transition to `Confirmed`** — failure **blocks** the Confirm, never leaving a silently-unbooked locked order. The `OrderJournalEntryFactory` iterates the lines and books each JE via the accounting engine, inside the server-only Order `Save()` override: outer transaction → save → book per-line JEs → stamp each `OrderLine.JournalEntryID` → all-or-none commit. `Posted` just means "the JEs are in the subledger" *(D8, D12)*.

### Type-driven products, role-based GL
`ProductType` is the keystone: behavior defaults (rev-rec type, taxability, fulfillment, recurrence), the **IsA extension entities** per type, subscription semantics, and a pluggable `ProductBehavior` seam (schema ready, seam deferred). GL routing carries **no account columns in the catalog** — accounts resolve by **role** through Accounting's `GLAccountRole`/`GLAccountLink`: product link → up the product-company's category tree → the company-default link → **fail loudly** *(D4, D5)*.

### Company model: the product owns the line
`Product.CompanyID` (NOT NULL) is the **source of truth for line ownership** — revenue accrues to the product's company. `Order.CompanyID` is the **originating/owning company**: the document/visibility/sales-attribution anchor (it pairs with `SalesRepUserID`) — **never GL resolution**. `OrderLine.CompanyID` is a denormalized stamp of the product's company at save (perf/reporting + temporal integrity). Product categories are per-company rows *(D6, D7)*.

### Emit JEs; Accounting batches them
Orders books through the **`Accounting.CreateJournalEntry` / `CreateJournalEntries` remote operations** — one transaction, all-or-none, typed errors — with the engine pair `OrdersEngine` ↔ `AccountingEngine` server-side (Accounting ships `JournalEntryServerExtended` — a `Lines` getter + scoped transactions — which the factory composes with). JEs land **`Pending`**; Accounting batches and ships the subledger to the ERP. **"Book"/"post" means create a Pending JE — never GL-post.** Accounting-side provenance is one polymorphic origin pair, `JournalEntry.LinkedEntityID`/`LinkedRecordID` → the OrderLine; Orders-side, `OrderLine.JournalEntryID` completes the round trip *(D12; plan §6)*.

### Reversal discipline at every layer
Every business event has a reversal at its own layer — return/cancellation/amendment/credit-memo **Orders** with negative-quantity lines, refund/chargeback/bank-return **Payments** (negative `Amount`, `ReversesPaymentID`), **Subscription** cancellations with proration — each emitting its own reversal JE. Locked history is never edited; the audit chain is the source of truth *(D9, D16)*.

### Atomic units of work are remote operations
An order confirm plus its bookings, a refund plus its reversal JE — each is **one transactional server call** (`Orders.ConfirmOrder`, `Orders.RefundPayment`), never client-side multi-save choreography. Plain BaseEntity saves are fine for one-record edits *(D17; plan §1)*.

### Workflow runs on BizApps Tasks
Any human gate — a discount beyond a rep's authority, a credit-limit override, a refund authorization — is raised as an **"Approval Request" Task** in [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks), linked to the subject record and routed to an approver role. Approve → Confirm proceeds; reject → back to Draft with notes *(D26)*.

---

## Product Management

Product is the root of the app: it defines **how an item is billed** (one-time / subscription / usage), **how revenue is recognized**, **how it's taxed**, **what the purchase grants**, **which company owns the revenue**, and **how it's priced**. Nail the catalog and orders / booking / subscriptions / rev-rec / tax all inherit correct behavior *(D4)*.

- **`ProductType`** — a first-class kind with behavior defaults. Seeded types: *Event, Membership, PhysicalGood, DigitalGood, Service, Donation, GiftCard, Bundle, AddOn/Fee, Subscription, Usage* *(D4)*.
- **Type-driven IsA extensions** — each type can name a Product-level and an OrderLine-level subtype (shared-UUID disjoint child). The shipped pair is `EventProduct` (date/venue/capacity) + `EventOrderLine` (attendee). Adopters register their own *(D4)*.
- **`ProductBehavior` seam** — a pluggable class resolved most-specific-wins (`Product → ProductType → default`) via `ClassFactory` is the escape hatch for custom behavior. Schema ready; seam activation deferred *(D4)*.
- **Pricing** — `PriceList` / `ProductPrice` / `PriceTier`: pricing models (flat / per-unit / tiered / volume / package / usage), fee types, effective-dated — **built**. `OrderLine.UnitPrice` direct entry stays valid as the base of the precedence chain; the `ResolvePrice` engine suggests/resolves on top, so pricing never blocks baseline flows *(D21)*.
- **Bundles** — `ProductBundleItem` powers two order modes: a single **bundle line** or a **fast-path expansion** into individual lines (`OrderLine.SourceBundleProductID`).
- **Entitlements** — `ProductEntitlement` defines *what a purchase grants*; `EntitlementGrant` is the instance created at booking, with a **beneficiary** defaulting to the buyer (a line may designate an attendee, gift-card recipient, honoree). Downstream apps **poll** grants — no bespoke webhook system *(D27)*.
- **ASC 606** — `ProductPerformanceObligation` + standalone selling price (SSP) fields ship now; the bundle allocation engine is future *(D21)*.

*PhysicalGood* is inventory-aware via seams only (`FulfillmentStatus`, stock-tracking flags) — inventory, costing (FIFO/LIFO/Average), and COGS live in a future bolt-on **BizApps Inventory** app *(plan §21)*.

---

## Entity Model

```
 BizAppsCommon          __mj.Company                BizAppsAccounting
 Org / Person       owning (Order) · product        GLAccountRole/Link · JournalEntry
      │ customer    owner (Product) · stamp (Line)  Dimension · Currency
      ▼                      │                            ▲ soft refs (→ hard FKs
 ┌──────────────┐ 1 → N ┌──────────────┐                  │  when include-mode lands)
 │    Order     │──────►│  OrderLine   │────────────────► │
 │ the deal AND │       │ Product, Qty │  JournalEntryID  │
 │ the A/R doc  │       │ CompanyID    │  (ONE JE PER     ┌───────────────────────────────┐
 │ Balance,     │       │ ServicePeriod│   LINE — D10)    │ Product ◄─IsA─ EventProduct …  │
 │ PaymentStat  │       └──────┬───────┘─────────────────►│  ProductType · ProductCategory │
 └──────┬───────┘              │          ProductID       │  ProductPrice · PriceList/Tier │
        │           ┌──────────┼──────────────┐           │  BundleItem · Entitlement      │
        │           ▼          ▼              ▼           └───────────────────────────────┘
        │  OrderLineDimension Subscription  RevRecSchedule (+lines)
        │ PaymentLine          │ (spawns      = computed envelope; ledger truth is
        │ (clears Orders)      │  renewal     REAL forward-dated JEs written at
        ▼                      │  Orders)     booking-lock (D14)
 ┌──────────────┐             ▼
 │   Payment    │      SubscriptionEvent · EntitlementGrant (beneficiary)
 │ capture /    │── PaymentIntent ◄── PaymentProvider (Stripe / Manual / StoredValue)
 │ refund /     │── PaymentMethodID ─► CustomerPaymentMethod (token vault)
 │ chargeback   │── StoredValueAccount → StoredValueTransaction (schema; flows later)
 └──────┬───────┘
        │ JournalEntryID (soft ref); JE origin = LinkedEntityID/LinkedRecordID
        ▼
 BizAppsAccounting.JournalEntry   (Pending → batched to the ERP)
```

### Cross-app references

| Reference on an Orders entity | Refers to | Lives in |
|---|---|---|
| `Order.CustomerOrganizationID` | `Organization.ID` | `bizapps-common` |
| `Order.CustomerPersonID`, `SalesRepUserID` | `Person.ID`, `__mj.User` | `bizapps-common`, `__mj` |
| `Order.CompanyID`, `OrderLine.CompanyID`, `Product.CompanyID` | `Company.ID` | `__mj` |
| `OrderLine.JournalEntryID` | `JournalEntry.ID` — **soft ref** until CodeGen include-mode FK hardening lands (§2 FK standard) | `bizapps-accounting` |
| `Payment.JournalEntryID` | `JournalEntry.ID` (soft ref, same standard) | `bizapps-accounting` |
| `OrderLineDimension` | `Dimension` / `DimensionValue` | `bizapps-accounting` |
| `OrderLineTaxLine` tax refs *(lands with the tax build, D23)* | tax snapshot entities | `bizapps-accounting` |
| `PaymentProvider.CredentialsRef` | `MJ: Credentials` | `__mj` |
| `Order` approval (via `Task Links`) | `Task` ("Approval Request") | `bizapps-tasks` |

`Order.ContractID` used to appear here and was **removed** *(D44)*. `bizapps-contracts` sits
DOWNSTREAM of orders, so a reference to it — hard or soft — inverts the dependency graph and encodes
a contracts concern in an orders table. When that app exists it will join to orders from its own
schema. The same rule retired `ProductPerformanceObligation`: allocating one transaction price across
distinct performance obligations is an agreement-envelope concern, not an order-entry one. Revenue
recognition itself stays here, because deferring revenue over a subscription term is genuinely ours.

No currency/FX columns on Order/OrderLine — multi-currency is deferred *(D24)*. Entity names and the current graph are in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md).

---

## Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Quoted: optional stage
    Draft --> Confirmed: skip allowed (D9)
    Quoted --> Confirmed: sales rules pass (or approved)
    Confirmed --> Posted: JEs in the subledger (near-instant)
    Posted --> Fulfilled: logistics fact only — no JE (D15);\nauto-advance when no line needs fulfillment
    Draft --> Voided
    Quoted --> Voided

    note right of Confirmed
      FIRST transition to Confirmed books
      one JE per line (D8/D10);
      failure BLOCKS the Confirm.
    end note

    note right of Fulfilled
      Pen, not pencil. After Confirm,
      corrections are reversing / credit-memo
      Orders — Voided is only reachable
      from Draft/Quoted.
    end note
```

- **Stage order is fixed; skipping forward is allowed** — Draft → Confirmed without Quoted is legal, but a later stage always gets its prerequisites' effects (booking on first Confirmed; can't Fulfill before Posted) *(D9)*.
- **Confirm is the first `Save()` to `Confirmed`**: order row + per-line JEs in one transaction *(D8, D12)*. There is no `Orders.ConfirmOrder` operation.
- **Fulfillment is disconnected from revenue** — no JE fires on Posted → Fulfilled; orders with no fulfillment-requiring lines auto-advance *(D15)*.
- **Reversal pattern**: a return / cancellation / amendment — and a **credit memo** — is a **new** `Order` (`ReversesOrderID` set) with negative-quantity lines for the slice being reversed. A credit-memo Order has a **negative `Balance`**, settled by a refund Payment, applied to another Order, or written off. Both orders and both JE sets persist; net is zero *(D16)*.
- Orders get **number + memo, not names**: `ORD-{seq}` via `OrderSequence` plus `ExternalDocumentNumber`, with `Order.Description` as the searchable memo — no `Order.Name` *(D29, D30)*. `IsOverdue` is computed (`Balance > 0 AND DueDate < now`), never stored *(D32)*. All persisted timestamps are UTC *(D34)*.

---

## Multi-Company Orders

The canonical scenario: a customer buys from three subsidiaries on one order. Each line's product decides who owns the revenue, and **each line books its own complete single-company JE** — there are no intercompany legs at booking *(D6, D10, D13)*.

```
Order (owning company = BCHQ, the document/sales-attribution anchor) for "Acme Corp":
  Line 1: Sidecar Pro subscription   $99      (Product.CompanyID = Sidecar)
  Line 2: Cimatri analytics          $5,000   (Product.CompanyID = Cimatri)
  Line 3: BCHQ consulting            $10,000  (Product.CompanyID = BCHQ)

At first Confirm, three Pending JEs — one per line, single-company by construction:
  JE (Sidecar):  Dr Accounts Receivable    $99     Cr Deferred Revenue   $99
                 (subscription product → staged rev-rec, D14)
  JE (Cimatri):  Dr Accounts Receivable  $5,000    Cr Sales Revenue    $5,000
  JE (BCHQ):     Dr Accounts Receivable $10,000    Cr Sales Revenue   $10,000
```

"You don't know about intercompany anything until you get cash": each line's AR sits with the **line's** company. When cash received by one entity is later applied across companies' AR, the **payment-application step** books the intercompany balancing entries — that machinery lands with the payments slice *(D13; plan §9)*. Accounts in each JE resolve by **role** (AR, Sales, Deferred Revenue, Sales Discounts, …) through the product-company's `GLAccountLink` walk, and the resolved account must belong to the line's company — cross-company mapping is refused outright *(D5, D6)*.

The customer-facing invoice still presents as one document — the order-level JE is a **virtual aggregation** of the line JEs, a UI concept only *(D10)*.

---

## Revenue Recognition

Revenue recognition is **real forward-dated JEs written at booking-lock** *(D14)*. A 12-month $1,200 subscription books its waterfall immediately: 12 × $100 Dr Deferred Revenue / Cr Revenue entries dated on the monthly anniversaries across the line's `ServicePeriodStart/End`; an event product books **one** entry dated the event date. There is **no schedule bridge, no materializer, no daily job** — recognition "fires" by date, and Accounting's batches sweep entries by date window (default cutoff = today). **Changes and cancellations are correcting Orders** whose new entries net against what's staged — staged entries are never edited or deleted.

`RevenueRecognitionSchedule` (+ lines) remains as the **computed envelope** for MRR/ARR display and as the computation source — never the ledger truth. Fulfillment never recognizes revenue *(D15)*.

A year subscription **billed annually** = one Order, deferred and recognized ratably. The same sub **billed monthly** = twelve per-cycle renewal Orders (spawned as `Draft` at launch — a human confirms; Confirm books) — the billing cadence *is* the order cadence *(D20)*.

---

## Payments & A/R

Payments apply to **Orders** (the A/R primitive) via `PaymentLine` — supporting split tender (one Payment clears many Orders; one Order cleared by many Payments) and partial application. Refunds/chargebacks/bank-returns are negative Payments pointing back via `ReversesPaymentID`. `Payment` carries `ProcessingFeeAmount` / `NetAmount`, and capture books Dr Cash (net) / Dr Processing Fee / Cr A/R (gross) *(D16, D18)*.

- **Refund is one atomic remote operation** (`Orders.RefundPayment`): reversal Payment + reversing JE commit together or not at all. Not blocked on Stripe — a Manual-provider refund is fully expressible today *(D17)*.
- **Saved instruments**: `CustomerPaymentMethod` is a token vault (provider tokens + display metadata; **never the PAN**) for subscriptions and charge-on-file *(D18)*.
- **Coupons are in the launch scope** via the payment provider: Stripe hosted checkout + **promotion codes** own configuration/application, and Orders records the outcome — order-level discount structure *and* line-level `DiscountAmount`. An Orders-native `Coupon` entity is the fast-follow, slotting in as just another provider *(D22)*.
- **Dunning**: overdue detection + worklist (`Orders.GetOverdueWorklist`), a configurable `DunningGracePeriodDays` (default 7), and CS notification rather than auto-cancel *(D32)*.
- **Gift cards / stored value**: `StoredValueAccount` / `StoredValueTransaction` schema ships now; the issuance/redemption flows (liability pattern) are a later named item *(plan §21)*.

### Payment providers (pluggable)

Providers register against an abstract `PaymentProvider` base via `@RegisterClass` / `ClassFactory` — new providers ship without a schema change. Inbound webhooks are received by an **unauthenticated Express route** (mirroring MJ's `SignatureWebhookHandler`) that captures the raw body and verifies the provider HMAC signature; idempotency via `ProviderEventID` uniqueness *(D19)*.

| Provider | Status |
|---|---|
| **Stripe** — stub-first (committed success-stub is the default test provider); the LXP-checkout subset (PaymentIntent lifecycle + hosted checkout + webhook → capture) is pulled forward for launch | v1 |
| **Manual** (Wire / ACH / Check / Cash recorded by finance) | v1 |
| **StoredValue** (internal — gift-card redemption) | when gift cards activate |
| PayPal / Square / Authorize.Net / Adyen | deferred (§21) |

---

## Using BizApps Orders in Your Code

> These follow the surface in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md). Confirm is a `Save()`, not a remote operation.

### Creating an order draft with lines

```typescript
import { Metadata } from '@memberjunction/core';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';

const md = new Metadata();
const order = await md.GetEntityObject<OrderHeaderEntity>('MJ_BizApps_Orders: Order Headers', contextUser);
order.NewRecord();
order.CompanyID = bchqCompanyId;     // OWNING company — document/visibility anchor, never GL (D6)
order.OrderType = 'Sale';
order.Status = 'Draft';
order.OrderDate = new Date();        // backdating allowed, unguarded (D25)

const line = await order.Lines.Create();
line.ProductID = sidecarProProductId;  // the product's company owns this line's revenue (D6)
line.Quantity = 1;
// omit UnitPrice to let ResolvePrice run — never assign 0 for "unset"
if (!(await order.Save())) {           // header + lines, one graph
    throw new Error(order.LatestResult?.CompleteMessage ?? 'save failed');
}
```

### Booking — you don't build JEs, Confirm does

```typescript
// Confirm is the first Status → Confirmed save. Client and server use the same
// graph Save(); the server subclass (OrderEntityServer) books inside that Save.

order.Status = 'Confirmed';
if (!(await order.Save())) {
    throw new Error(order.LatestResult?.CompleteMessage ?? 'confirm failed');
}
// → outer transaction → save → OrderJournalEntryFactory books each line's JE via
//   Accounting.CreateJournalEntries (JEs land 'Pending')
//   → stamps each OrderLine.JournalEntryID → commit. ANY failure rolls back
//   everything — a locked order without its JEs is invalid state.
// Deferred-revenue lines also stage their forward-dated recognition JEs here (D14).
```

GL accounts are never supplied by the caller: they resolve by **role** in `OrdersEngineBase` (browser-safe — the UI can preview "accounts this product will use"), walking product link → category tree → company default, failing loudly if nothing resolves *(D5)*.

### Applying a payment to an order

```typescript
import { Metadata } from '@memberjunction/core';
import type { PaymentEntity, PaymentLineEntity } from '@mj-biz-apps/orders-entities';

const md = new Metadata();
const payment = await md.GetEntityObject<PaymentEntity>('MJ_BizApps_Orders: Payment Headers', contextUser);
payment.NewRecord();
payment.ReceivingCompanyID = bchqCompanyId;  // where the cash hits (D18)
payment.Method = 'CreditCard';
payment.Amount = 99.0;
payment.Status = 'Captured';                 // capture books Dr Cash / Cr A/R
await payment.Save();

// PaymentLine applies cash to the Order (the A/R primitive) — supports split tender
const pl = await md.GetEntityObject<PaymentLineEntity>('MJ_BizApps_Orders: Payment Lines', contextUser);
pl.NewRecord();
pl.PaymentID = payment.ID;
pl.OrderID = order.ID;               // Order.Balance = TotalGross - SUM(posted PaymentLine.Amount)
pl.Amount = 99.0;
await pl.Save();
```

Refunds go through the atomic `Orders.RefundPayment` remote operation (reversal Payment + reversing JE in one transaction — guards against double-refund and over-refund) *(D17)*. Sales-rule violations at Confirm raise an **"Approval Request" Task** in BizApps Tasks routed to the approver role — the evaluation engine is a pending build *(D26)*.

---

## Database Support

SQL Server is the **source of truth** for migrations. PostgreSQL is supported via automatic conversion using [`@memberjunction/sql-converter`](https://github.com/MemberJunction/MJ/tree/main/packages/SQLConverter) — we consume MJ's toolchain directly.

The baseline is deliberately **two** files. Migrations run as one transaction per file, and a
trigger that declares a variable of a user-defined table type cannot be compiled inside the
transaction that created the type — so `B…__Schema_and_Types.sql` commits the schema and the table
type, and `V…__Tables_and_Objects.sql` carries everything else. Merging them back deadlocks the
migration; the header of the first file explains it in full.

```
migrations/                       ←  T-SQL, hand-written
  V<TS>__v<X.Y.x>__Foo.sql

migrations-pg/                    ←  PG, produced by `npx mj sql-convert`
  V<TS>__v<X.Y.x>__Foo.pg.sql        (converter output)
  V<TS>__v<X.Y.x>__Bar.pg-only.sql   (PG-only patches when needed)
```

At runtime `mj migrate` reads `DB_PLATFORM` and picks the right directory (`sqlserver` → `migrations/`, `postgresql` → `migrations-pg/`). CI applies the PG set to a fresh `postgres:17` container on every PR that touches migrations. Note the standing pre-production practice: schema changes **edit the original baseline migration in place** (clean rebuild + CodeGen re-run) — no incremental fix-up migrations until publish *(plan §2)*.

Editing the baseline in place is only safe because rebuilding from zero is routine:

```bash
scripts/rebuild-db.sh                      # drop → MJ core → common → accounting → orders → seed metadata
pnpm run mj:codegen                        # regenerate entity metadata + SQL objects
scripts/append-codegen.sh                  # fold that output back BELOW the migration's banner
pnpm exec mj sync push --dir metadata      # this app's lookup tables
```

> The `append-codegen.sh` step is not optional. The generated half of the baseline — entity/field
> metadata, base views, CRUD procs, permissions — is what makes a fresh `mj migrate` produce a
> **working** database rather than bare tables. Skipping it after a CodeGen run silently discards it.

---

## Testing

Two layers, both green as of the current build.

**Unit** — `pnpm test` per package. Pure logic only (`SubscriptionBehavior`'s term arithmetic, the
rev-rec allocators), no database.

**Integration** — 82 checks across 8 bundles, driving a live database through the real stack:
entity subclasses, DB triggers, remote operations, and accounting's ledger all participate. Nothing
is mocked.

| Bundle | Checks | Proves |
|---|---|---|
| `order-booking` | OB1–OB9 | confirm books one balanced JE per line, single-company, atomically *(D10/D12/D25)* |
| `revenue-recognition` | RR1–RR7 | forward-dated release schedules that sum exactly to the line *(D14/D43)* |
| `subscriptions` | SB1–SB12 | `SubscriptionType` rules → Subscription + terms, anchoring, proration, concurrency *(D45/D46)* |
| `subscription-cancellation` | SC1–SC10 | `Orders.CancelSubscription`: policy → mirrored reversal, atomically *(D52/D53)* |
| `subscription-renewal` | SR1–SR11 | `Orders.SpawnRenewals`: the scheduled continuation, and everything it must **not** do *(D55)* |
| `payments-rollups` | PR1–PR9 | rollup triggers, document numbering, instrument copy-on-use *(D30/D39/D42)* |
| `payment-ledger` | PL1–PL12 | the **cash leg** — capture/refund journal entries, AR reconciliation, application guards *(D17/D18/D57–D59)* |
| `intercompany` | IC1–IC12 | whose books each amount lands on when one company collects for another *(D66)* |
| `account-credit` | AC1–AC11 | the allocation invariant, over-payment, and credit as tender *(D68)* |
| `events` | EV1–EV10 | an event's own dates drive its line's service period and recognition *(D67)* |
| `line-subscriber` | LS1–LS12 | per-line ship-to and the benefit model's dedupe scope *(D61/D62)* |

```bash
# fast inner loop — one bundle, or one check, with a stack trace on failure
node test-harnesses/integration.mjs subscriptions
node test-harnesses/integration.mjs subscriptions.SB5

# the CI path — same registry, same checks, results recorded against the metadata Test records
RUN_MUTATION_TESTS=1 MJ_INTEGRATION_TEST=1 \
  pnpm exec mj test suite --name "BizApps Orders Integration"
```

`RUN_MUTATION_TESTS=1` is **required**: every check is mutation-class by nature, so a run without it
reports zero checks and passes vacuously.

### Demo data you can click through

The suite leaves nothing behind by design — every check rolls back, which is what makes it
re-runnable and also why the database looks empty after a green run. For hands-on review there is a
seed that **commits**:

```bash
node test-harnesses/seed-demo-data.mjs --reset
```

It drives the same engine paths and leaves one company (`DEMO Publishing Co`) with orders in
deliberately different states — unpaid, paid at confirm, partially paid, an event deferral, a rolling
membership, a prorated calendar membership, one cancelled, one renewed, one refunded — then prints a
trial balance so you can see the ledger reconciles. Safe to re-run; `--reset` clears the previous
set first.

Checks are safe to run repeatedly against a working database. Each one owns a transaction that
always rolls back, so orders, journal entries, payments and subscription terms never reach disk;
only the inert catalog fixture is committed, and teardown sweeps it in FK order *(D48 — the design,
and the Phase 0 spike behind it, are in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md) §11)*.

---

## Repository Structure

```
bizapps-orders/
├── mj-app.json                    # MJ Open App manifest (schema __mj_BizAppsOrders)
├── mj.config.cjs                  # CodeGen config + SQL → PG placeholder rules
├── apps/
│   ├── MJAPI/                     # GraphQL API server (port 4103)
│   └── MJExplorer/                # Angular UI application (port 4303)
├── packages/
│   ├── Entities/                  # @mj-biz-apps/orders-entities
│   ├── Actions/                   # @mj-biz-apps/orders-actions
│   ├── Server/                    # @mj-biz-apps/orders-server (OrdersEngine + factory + providers + remote ops)
│   ├── CoreEntitiesServer/        # @mj-biz-apps/orders-core-entities-server (Save-override + lifecycle hooks)
│   ├── IntegrationTests/          # @mj-biz-apps/orders-integration-tests (check bundles for `mj test`)
│   └── Angular/                   # @mj-biz-apps/orders-ng
├── migrations/                    # T-SQL migrations (source of truth)
├── migrations-pg/                 # PG migrations (converter output + .pg-only patches)
├── metadata/                      # Seed data + entity metadata (synced via mj-sync)
├── metadata-tests/                # MJ: Tests + Test Suite records (pushed separately, not production seed)
├── scripts/                       # rebuild-db.sh, append-codegen.sh, link-local-apps.mjs
├── test-harnesses/                # standalone dispatchers (integration.mjs, booking-live.mjs)
├── docs/
│   └── HOW_THE_SYSTEM_WORKS.md    # How the running system works — start here
└── plans/
    ├── README.md                  # Pointer: current docs vs archive
    ├── orders-plan-gap-report.html
    └── archive/                   # Historical D1–D84 design docs
```

Ports follow the BizApps convention (MJ core 4001/4201, common 4101/4301, accounting 4102/4302); Orders uses **4103 / 4303**.

---

## What is still open

The engine slices in the old build sequence (per-line booking, company model, rev-rec, payments, subscriptions, tax, promotions) have landed. Remaining product work is in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md) §13 and the [gap report](plans/orders-plan-gap-report.html): LXP packaging, live Stripe/Bill.com/BC export tests (other team), an approvals inbox, event capacity, multi-currency, and sibling apps (Contracts, Inventory).

---

## Cross-Repo Coordination

The consolidated master plan absorbed the prior issue-tracked coordination chain — **git is the history**. The one live companion document is the sibling plan, [`bizapps-accounting/plans/bizapps-accounting-master.md`](https://github.com/MemberJunction/bizapps-accounting), the accounting side of every boundary contract here (JE remote operations, GL role links, provenance, batching).

Future bolt-on apps layer on via seams Orders already ships (`FulfillmentStatus`, pricing-precedence top slot): **BizApps Contracts** and **BizApps Inventory**. Do not add their columns here.

---

## Documentation

| Document | Description |
|---|---|
| [How the system works](docs/HOW_THE_SYSTEM_WORKS.md) | Current engine, API, UI, tests, and local run |
| [API and UI architecture](docs/orders-api-and-ui-architecture.md) | Remote operations, Explorer sections, form binding |
| [Reviewing the data](docs/reviewing-the-data.md) | Committed seed you can inspect |
| [Archived design](plans/archive/) | Historical decision log (D1–D84) — not the running schema |
| [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) | The ledger primitives Orders emits into |
| [BizApps Common](https://github.com/MemberJunction/bizapps-common) | Person / Organization / Address master data |
| [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks) | The workflow / approval substrate |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Platform** | [MemberJunction](https://github.com/MemberJunction/MJ) | 5.40+ |
| **Runtime** | Node.js | 18+ |
| **Language** | TypeScript | 5.9 (strict) |
| **Database (primary)** | SQL Server / Azure SQL | 2019+ |
| **Database (secondary)** | PostgreSQL | 17 |
| **API** | GraphQL (Apollo Server) | -- |
| **UI Framework** | Angular | 21 |
| **Build** | Turborepo | 2.7 |
| **Validation** | Zod | 3.24 |
| **SQL Conversion** | [`@memberjunction/sql-converter`](https://github.com/MemberJunction/MJ/tree/main/packages/SQLConverter) | 5.40+ |

---

## License

Business Source License 1.1 — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built on <a href="https://github.com/MemberJunction/MJ">MemberJunction</a> — the metadata-driven application platform.
</p>
