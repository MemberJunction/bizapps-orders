<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/MemberJunction/MJ/raw/main/MJ_logo_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/MemberJunction/MJ/raw/main/MJ_logo.webp">
    <img alt="MemberJunction" src="https://github.com/MemberJunction/MJ/raw/main/MJ_logo.webp" width="220">
  </picture>
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
  <a href="#checkout-widget--session-engine">Checkout Widget</a> &middot;
  <a href="#entity-model">Entity Model</a> &middot;
  <a href="#using-bizapps-orders-in-your-code">Code</a> &middot;
  <a href="docs/HOW_THE_SYSTEM_WORKS.md">How it works</a> &middot;
  <a href="docs/checkout-widget-and-session-architecture.md">Widget Guide</a>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/Status-Engine%20shipped-green?style=flat-square" />
  <img alt="MJ Version" src="https://img.shields.io/badge/MemberJunction-6.1.6%2B-blue?style=flat-square" />
  <img alt="Angular" src="https://img.shields.io/badge/Angular-21-DD0031?style=flat-square&logo=angular&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="SQL Server" src="https://img.shields.io/badge/SQL%20Server-2019%2B-CC2927?style=flat-square&logo=microsoftsqlserver&logoColor=white" />
  <a href="./LICENSE"><img alt="License: BUSL-1.1" src="https://img.shields.io/badge/License-BUSL--1.1-green?style=flat-square" /></a>
</p>

---

> **How the system works today:** [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md). This README is a tour. Historical design (D1–D84) is in [`plans/archive/`](plans/archive/). Do not treat the archive as the current schema or API.

A customer commits to pay; the system tracks both **what they're getting** and **how they're paying**. BizApps Orders treats orders, payments, and subscriptions as **aspects of the same business event** and ships them as one **MemberJunction Open App** — so an MJ adopter installs a single dependency and has working order management in days, rather than stitching together separate payments and subscriptions packages.

The model is deliberately lean: **the substrate is Products → Orders → Payments.** A confirmed **Order is both the customer's commitment and the A/R document** (its own bill) — there is no separate Invoice entity *(D2)*. Recurring cadence lives one level up, in Subscriptions that spawn a fresh Order each billing cycle *(D20)*.

Orders is the **orchestrator**; it does not keep the ledger. Every business event that requires accounting (order line booked, payment captured, revenue recognized, refund issued) is emitted as a balanced journal entry into [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting), which batches the subledger to the ERP. Tax is computed from Accounting's jurisdiction and rate tables, and the address-to-jurisdiction step is a replaceable `BaseTaxJurisdictionResolver` plugin *(D71–D73)*; contract terms belong to a future BizApps Contracts; the customer master lives in [BizApps Common](https://github.com/MemberJunction/bizapps-common); workflow/approvals run on [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks).

---

## What This Is — and Is Not

| ✅ This is | ❌ This is not |
|---|---|
| The transactional substrate: products, orders, payments, subscriptions | The general ledger (calls into BizApps Accounting) |
| **Order as the A/R primitive** — the confirmed order *is* the receivable & the bill | A separate invoicing system (no Invoice entity; bills/statements are reports) |
| Multi-company native — one order can carry lines owned by different subsidiaries; **each line books its own single-company JE** | A tax engine (rates and jurisdictions come from BizApps Accounting; the address lookup is a replaceable seam) |
| Payment-provider agnostic (Stripe first; others pluggable via `RegisterClass`; Manual always available) | The contract layer (terms / escalators / renewals are future BizApps Contracts territory) |
| Subscription-aware — a continuity record spawning a per-cycle renewal Order | An e-commerce storefront / customer portal |
| Reversal-disciplined — returns, refunds, bank returns, credit-memo orders, cancellations at every layer, each emitting reversal JEs | A CRM (customer master lives in BizApps Common) — nor inventory/COGS (future BizApps Inventory bolt-on) |

See [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md) for the current surface and the explicit out-of-scope list.

---

## Installation

BizApps Orders is a [MemberJunction Open App](https://github.com/MemberJunction/MJ/tree/main/packages/OpenApp). Install it into any MJ environment using the [MJ CLI](https://github.com/MemberJunction/MJ/tree/main/packages/MJCLI):

```bash
mj app install https://github.com/MemberJunction/bizapps-orders
```

The CLI resolves dependencies automatically — installing this app pulls in [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) (GL accounts + roles/links, JournalEntry primitives, Currency, dimensions), [BizApps Common](https://github.com/MemberJunction/bizapps-common) (Person, Organization, Address), and [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks) (the workflow/approval substrate).

### Managing an installed app

```bash
mj app info mj-bizapps-orders     # Show details and version
mj app upgrade mj-bizapps-orders --version <X.Y.Z>  # Upgrade to the v<X.Y.Z> release tag
mj app disable mj-bizapps-orders  # Temporarily disable
mj app enable mj-bizapps-orders   # Re-enable
mj app remove mj-bizapps-orders   # Uninstall (--keep-data to preserve schema)
```

Pass `--version` to `mj app upgrade`. Without it the CLI takes the newest GitHub Release as the
latest version, and this repo's only Release is the checkout widget assets (`v5.1.0-assets`), which
it refuses as older than any install at 5.1.0 or later. Versions are the repo's `v*` tags.

---

## What You Get

### Database (`__mj_BizAppsOrders` schema)

The tables fall into these areas. [`docs/ERD.md`](docs/ERD.md) has every table, column and relationship.

- **Catalog** — product types, products, categories, bundles, what a purchase grants, and per-type IsA extensions (`EventProduct` / `EventOrderLine`). No GL account columns: accounts resolve by role through Accounting *(D5)*.
- **Pricing, promotions, charges and tax** — price lists, prices and tiers, promotions and their codes, charge types, customer tax exemptions.
- **Orders and receivables** — `OrderHeader` (the commitment and the receivable) and `OrderLine`, with price components, charges, adjustments, concessions, accounting dimensions, payment schedules and progress measurements.
- **Payments** — `PaymentHeader` and `PaymentLine`, payment types, providers and intents, saved instruments, gift cards and stored value.
- **Subscriptions and entitlements** — subscription types and families, subscriptions with their terms and events, entitlement grants and access overrides.
- **Sales governance** — sales rules, sales authorities, payment terms.
- **Checkout** — widgets, their public distributions, sessions and session steps.
- **Integrations** — external customers, invoices and payments for the Bill.com rail; outbound events and their deliveries ([docs/outbound-events.md](docs/outbound-events.md)).

### TypeScript Packages

| Package | NPM Name | Role |
|---|---|---|
| **Entities** | `@mj-biz-apps/orders-entities` | Strongly-typed entity classes with Zod validation, the shared order and payment subclasses, the pricing engine, the `OrdersEngine` lookup cache, and the typed remote-operation contracts. Browser-safe. |
| **Actions** | `@mj-biz-apps/orders-actions` | Generated action subclasses only. It also ships to the browser, so the hand-written actions live in `orders-server`. |
| **Server** | `@mj-biz-apps/orders-server` | The server bootstrap (`LoadBizAppsOrdersServer`), generated GraphQL resolvers, the server extensions (payment webhook, checkout edge, Bill.com webhook) and the hand-written actions (invoices and documents, renewals, the Bill.com sweeps, nightly checks) |
| **Angular** | `@mj-biz-apps/orders-ng` | UI components, form overrides, custom widgets (forms-first, D33). The Order Header form puts **Ship To** on the left (starts expanded) and **Bill To** as a slim rail that takes the width when selected. Person and Organization **Orders** grids pass every filter join field as `NewRecordValues` so **New** opens an order already linked to that party (`BillToPersonID` + `ShipToPersonID`, or the org equivalents). For new orders, selecting a Person with a singular active employer relationship auto-populates the Organization. |
| **Core Entities Server** | `@mj-biz-apps/orders-core-entities-server` | Server-only entity subclasses — the Order `Save()` override that books on confirm, numbering, totals, fulfillment rollup & balance maintenance — plus the `OrderJournalEntryFactory`, the remote-operation bodies and the payment drivers |

---

## Core Principles

### Order is the substrate *and* the A/R primitive
The `Order` is the customer's commitment **and the bill**. Subscriptions are born from order lines; payments apply to orders; rev-rec hangs off lines. There is **no Invoice entity** — a confirmed Order *is* the receivable, with `Balance = TotalGross − AmountPaid` (the order's lines on captured, refunded and disputed payments) and trigger-maintained `FulfillmentStatus`. Payment progress is dynamically derived from real-time balances. A **credit memo is a negative-balance Order** (`ReversesOrderHeaderID` set). The customer-facing "invoice" and any consolidated statement are **rendered reports**, not entities *(D1, D2)*.

### One JE per order line — always
Every order line books its **own complete, single-company journal entry** — even multiple lines of the same company. The "order-level JE" is a **UI aggregation concept**, never a row; batching nets the line JEs later anyway. Linkage is `OrderLine.JournalEntryID` (the Order header carries no JE ref; no junction table) *(D10)*.

### Booking fires once, atomically, on first Confirm
Booking fires exactly once, on the **first transition to `Confirmed`** — failure **blocks** the Confirm, never leaving a silently-unbooked locked order. The `OrderJournalEntryFactory` iterates the lines and books each JE via the accounting engine, inside the server-only Order `Save()` override: outer transaction → save → book per-line JEs → stamp each `OrderLine.JournalEntryID` → all-or-none commit *(D8, D12)*.

### Type-driven products, role-based GL
`ProductType` is the keystone: behavior defaults (rev-rec type, taxability, fulfillment, recurrence), the **IsA extension entities** per type, subscription semantics, and pluggable driver classes (a pricing driver, plus the rev-rec and subscription type drivers). GL routing carries **no account columns in the catalog** — accounts resolve by **role** through Accounting's `GLAccountRole`/`GLAccountLink`: product → its category and the category's ancestors → product type → the company default → **fail loudly** *(D4, D5)*.

### Company model: the product owns the line
`Product.CompanyID` (NOT NULL) is the **source of truth for line ownership** — revenue accrues to the product's company. `Order.CompanyID` is the **originating/owning company**: the document/visibility/sales-attribution anchor (it pairs with `SalesRepUserID`) — **never GL resolution**. `OrderLine.CompanyID` is a denormalized stamp of the product's company at save (perf/reporting + temporal integrity). Product categories are per-company rows *(D6, D7)*.

### Emit JEs; Accounting batches them
Orders books through Accounting's **`Accounting.CreateJournalEntries` remote operation** — one transaction, all-or-none, typed errors — and resolves accounts through Accounting's `AccountingEngineBase`, which `AccountingBridge.ts` wires into `GLAccountResolver`. JEs land **`Pending`**; Accounting batches and ships the subledger to the ERP. **"Book"/"post" means create a Pending JE — never GL-post.** Accounting-side provenance is one polymorphic origin pair, `JournalEntry.LinkedEntityID`/`LinkedRecordID` → the OrderLine; Orders-side, `OrderLine.JournalEntryID` completes the round trip *(D12; plan §6)*.

### Reversal discipline at every layer
Every business event has a reversal at its own layer — return/cancellation/amendment/credit-memo **Orders** with negative-quantity lines, refund and bank-return **Payments** (`Status = 'Refunded'`, negative lines, `ReversesPaymentHeaderID`), **Subscription** cancellations with proration — each emitting its own reversal JE. Locked history is never edited; the audit chain is the source of truth *(D9, D16)*.

### Atomic units of work are remote operations
An order confirm plus its bookings, a refund plus its reversal JE — each is **one transactional server call** (the order's own confirm `Save()`, `Orders.RefundPayment`), never client-side multi-save choreography. Plain BaseEntity saves are fine for one-record edits *(D17; plan §1)*.

### Workflow runs on BizApps Tasks
Human gates are approval tasks in [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks), linked to the subject record. A price concession (a stated price below the engine price, or a `DiscountPct` on the line) needs an approved `OrderConcession`. A pending concession raises a task for the holders of the role the `ConcessionLimit` sales rule names, and the order cannot be confirmed, nor its documents sent, until every concession on it is decided. Entitlement access overrides are approved through a task the same way.

---

## Product Management

Product is the root of the app: it defines **how an item is billed** (one-time / subscription / usage), **how revenue is recognized**, **how it's taxed**, **what the purchase grants**, **which company owns the revenue**, and **how it's priced**. Nail the catalog and orders / booking / subscriptions / rev-rec / tax all inherit correct behavior *(D4)*.

- **`ProductType`** — a first-class kind with behavior defaults. The seeded types (Event, Membership, Subscription, Gift Card, Bundle and more) are in [`metadata/product-types/`](metadata/product-types/) *(D4)*.
- **Type-driven IsA extensions** — each type can name a Product-level and an OrderLine-level subtype (shared-UUID disjoint child). The shipped pair is `EventProduct` (date/venue/capacity) + `EventOrderLine` (attendee). Adopters register their own *(D4)*.
- **Driver seams** — a product that cannot price from metadata names a `PricingDriverClass`, resolved most-specific-wins (product → category → type → company policy) to a server-side `BasePriceResolver` plugin. Revenue-recognition and subscription types name driver classes the same way. All register through `@RegisterClass`.
- **Pricing** — `PriceList` / `ProductPrice` / `PriceTier`: pricing models (flat / per-unit / tiered / volume / package / usage), fee types, effective-dated — **built**. `OrderLine.UnitPrice` direct entry stays valid as the base of the precedence chain; the `ResolvePrice` engine suggests/resolves on top, so pricing never blocks baseline flows *(D21)*.
- **Bundles** — `ProductBundleItem` powers two order modes: a single **bundle line** or a **fast-path expansion** into individual lines (`OrderLine.SourceBundleProductID`).
- **Entitlements** — `ProductEntitlement` defines *what a purchase grants*; `EntitlementGrant` is the instance created at booking, with a **beneficiary** defaulting to the buyer (a line may designate an attendee, gift-card recipient, honoree). Downstream apps **ask** `Orders.CheckEntitlement` / `Orders.ListEntitlements` rather than polling grant status ([plans/entitlement-read-contract.md](plans/entitlement-read-contract.md)), or register an outbound consumer that is told when a sale confirms or a grant's status changes ([docs/outbound-events.md](docs/outbound-events.md)).

*PhysicalGood* is inventory-aware via seams only (`FulfillmentStatus`, `ProductType.RequiresFulfillment`) — inventory, costing (FIFO/LIFO/Average), and COGS live in a future bolt-on **BizApps Inventory** app *(plan §21)*.

---

## Entity Model

An `OrderHeader` (the deal and the receivable) has `OrderLine`s. Each line's `Product` decides which
company owns its revenue, and each line books its own journal entry (`OrderLine.JournalEntryID`, D10).
`PaymentHeader`s apply cash to orders through `PaymentLine`s. The customer is a BizApps Common
`Person` or `Organization` (`BillTo*` / `ShipTo*` on the order), companies are MJ core's `Company`, and
journal entries, GL accounts and dimensions are BizApps Accounting's.

The full picture, including every foreign key that leaves the schema, is in
[`docs/ERD.md`](docs/ERD.md) (§3 is the cross-app register).

An `Order.ContractID` column used to exist and was **removed** *(D44)*. `bizapps-contracts` sits
DOWNSTREAM of orders, so a reference to it — hard or soft — inverts the dependency graph and encodes
a contracts concern in an orders table. When that app exists it will join to orders from its own
schema. The same rule retired `ProductPerformanceObligation`: allocating one transaction price across
distinct performance obligations is an agreement-envelope concern, not an order-entry one. Revenue
recognition itself stays here, because deferring revenue over a subscription term is genuinely ours.

No currency/FX columns on Order/OrderLine — multi-currency is deferred *(D24)*. Entity names and the current graph are in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md).

---

## Order Lifecycle

An order's state is three separate facts; [`docs/HOW_THE_SYSTEM_WORKS.md` §4.1](docs/HOW_THE_SYSTEM_WORKS.md#41-order-lifecycle-and-3-way-orthogonal-status) has the detail, and `OrderStatusBehavior.ts` the legal moves.

- **`Status`** — `Draft` ⇄ `Quoted` → `Confirmed`. Draft → Confirmed without Quoted is legal *(D9)*. A Draft or Quoted order can be `Voided` and reopened; nothing leaves `Confirmed`, so after Confirm corrections are reversing or credit-memo orders.
- **`FulfillmentStatus`** — `Pending`, `PartiallyFulfilled`, `Fulfilled`, `NotApplicable` or `Returned`, rolled up from the lines. Fulfillment books no JE *(D15)*.
- **Payment progress** — `TotalGross`, `AmountPaid`, `Balance` and `DueDate`. There is no stored payment status.
- **Confirm is the first `Save()` to `Confirmed`**: order row + per-line JEs in one transaction, and a booking failure blocks the Confirm *(D8, D12)*. There is no `Orders.ConfirmOrder` operation.
- **Reversal pattern**: a return / cancellation / amendment — and a **credit memo** — is a **new** `Order` (`ReversesOrderHeaderID` set) with negative-quantity lines for the slice being reversed. A credit-memo Order has a **negative `Balance`**, settled by a refund Payment, applied to another Order, or written off. Both orders and both JE sets persist; net is zero *(D16)*.
- Orders get **number + memo, not names**: `ORD-{seq}` via `OrderSequence` plus `ExternalDocumentNumber`, with `Order.Description` as the searchable memo — no `Order.Name` *(D29, D30)*. `IsOverdue` is computed in `vwOrderHeaders` (a positive balance past its next due date, from `packages/Entities/src/overdue.ts`), never stored *(D32)*. All persisted timestamps are UTC *(D34)*.

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

"You don't know about intercompany anything until you get cash": each line's AR sits with the **line's** company. When cash received by one entity is later applied across companies' AR, the **payment-application step** books the intercompany balancing entries (`PaymentAllocationFactory`, *D13, D66*). Accounts in each JE resolve by **role** (AR, Sales, Deferred Revenue, Sales Discounts, …) through the `GLAccountLink` walk, and the resolved account must belong to the line's company — cross-company mapping is refused outright *(D5, D6)*.

The customer-facing invoice still presents as one document — the order-level JE is a **virtual aggregation** of the line JEs, a UI concept only *(D10)*.

---

## Revenue Recognition

Revenue recognition is **real forward-dated JEs written at booking-lock** *(D14)*. A 12-month $1,200 subscription books its waterfall immediately: 12 × $100 Dr Deferred Revenue / Cr Revenue entries dated on the monthly anniversaries across the line's `ServicePeriodStart/End`; an event product books **one** entry dated the event date. There is **no schedule bridge, no materializer, no daily job** — recognition "fires" by date, and Accounting's batches sweep entries by date window (default cutoff = today). **Changes and cancellations are correcting Orders** whose new entries net against what's staged — staged entries are never edited or deleted.

There is no schedule table: `RevenueRecognitionSchedule` and `RevRecScheduleLine` were retired *(D84)* because the dated entries already are the schedule. Fulfillment never recognizes revenue *(D15)*.

A year subscription **billed annually** = one Order, deferred and recognized ratably. The same sub **billed monthly** = twelve per-cycle renewal Orders (spawned as `Draft` at launch — a human confirms; Confirm books) — the billing cadence *is* the order cadence *(D20)*.

---

## Payments & A/R

Payments apply to **Orders** (the A/R primitive) via `PaymentLine` — supporting split tender (one Payment clears many Orders; one Order cleared by many Payments) and partial application. Refunds and bank returns are reversal Payments (`Status = 'Refunded'`, positive `Amount`, negative lines) pointing back via `ReversesPaymentHeaderID`. `Orders.RefundPayment` writes a refund atomically, and the ACH webhook writes a bank return *(D16, D17)*. Capture books Dr Cash (net) / Dr Processing Fee / Cr A/R (gross) *(D18)*. Overdue is computed, never stored, and worked from `Orders.GetOverdueWorklist` *(D32)*.

Payment drivers register by `PaymentProviderType.Code`, so a new provider needs no schema change: **Manual**, **Stripe** (cards), **StripeACH** (US bank debits), **StoredValue** (gift cards and account credit) and **BillCom**, the outbound invoice rail described in [`docs/billcom-invoice-rail.md`](docs/billcom-invoice-rail.md). Gateway webhooks arrive on an unauthenticated route that verifies the provider's signature *(D19)*. A saved instrument (`CustomerPaymentMethod` and its `PaymentDetail`) keeps provider tokens and display details such as brand and last four digits, never the card number.

Capture, account credit and the provider seam in more detail: [`docs/HOW_THE_SYSTEM_WORKS.md` §7](docs/HOW_THE_SYSTEM_WORKS.md#7-payments-and-ar).

---

## Checkout Widget & Session Engine

BizApps Orders includes an embeddable checkout and registration widget backed by a server-side session engine. A widget is a Checkout Widget record with one or more public distributions, served from the anonymous `/checkout` edge. It renders a product type's IsA line fields (for example `EventOrderLine`'s attendee fields), can expand one form per unit (`unitMode: 'perUnit'`), prices drafts in memory with the same `OrderPricingService` the order save uses, and takes theming and lifecycle hooks through `customUI`. Guest claiming, which would link an anonymous order to an account later, is wired but dormant until MemberJunction publishes its identity-claim engine.

The [Checkout Widget & Session Architecture Guide](docs/checkout-widget-and-session-architecture.md) covers configuration, the API and embedding.

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
order.BillToOrganizationID = acmeOrgId;  // the payer; a Draft may omit it, Confirm needs a bill-to person or organization
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

GL accounts are never supplied by the caller: they resolve by **role** in `GLAccountResolver` (server side, `orders-core-entities-server`), walking product → category and its ancestors → product type → company default, failing loudly if nothing resolves *(D5)*.

### Applying a payment to an order

```typescript
import { Metadata } from '@memberjunction/core';
import type { PaymentHeaderEntity } from '@mj-biz-apps/orders-entities';

const md = new Metadata();
const payment = await md.GetEntityObject<PaymentHeaderEntity>('MJ_BizApps_Orders: Payment Headers', contextUser);
payment.NewRecord();
payment.ReceivingCompanyID = bchqCompanyId;  // where the cash hits (D18)
payment.BillToOrganizationID = acmeOrgId;    // who paid
payment.PaymentTypeID = checkPaymentTypeId;  // the 'Check' Payment Types row: a recorded payment, no gateway
payment.PaymentDate = new Date();
payment.Amount = 99.0;

// Allocations are the payment's Lines collection, saved with the header in one transaction.
// One payment can clear several orders (split tender).
const allocation = await payment.Lines.Create();
allocation.OrderHeaderID = order.ID;
allocation.Amount = 99.0;

if (!(await payment.SaveStatus('Captured'))) {  // capture books Dr Cash / Cr A/R
    throw new Error(payment.LatestResult?.CompleteMessage ?? 'capture failed');
}
```

`Orders.CapturePayment` takes the same payment as one remote call and adds a preview mode and a retry-safe `IdempotencyKey`; its input type is in `packages/Entities/src/generated/remote_operations.ts`. Refunds go through the atomic `Orders.RefundPayment` remote operation (reversal Payment + reversing JE in one transaction — guards against double-refund and over-refund) *(D17)*. An order with an undecided price concession cannot be confirmed (see [Workflow runs on BizApps Tasks](#workflow-runs-on-bizapps-tasks)).

---

## Database Support

SQL Server is the **source of truth** for migrations and the only database this repo can build today. PostgreSQL counterparts are converted from them with MJ's [`@memberjunction/sql-converter`](https://github.com/MemberJunction/MJ/tree/main/packages/SQLConverter) (`pnpm run mj:migrate:convert`); see below for how far that has gone.

The baseline is deliberately **two** files. Migrations run as one transaction per file, and a
trigger that declares a variable of a user-defined table type cannot be compiled inside the
transaction that created the type — so `B…__Schema_and_Types.sql` commits the schema and the table
type, and `V…__Tables_and_Objects.sql` carries everything else. Merging them back deadlocks the
migration; the header of the first file explains it in full.

```
migrations/                       ←  T-SQL, hand-written
  V<TS>__v<X.Y.x>__Foo.sql

migrations-pg/                    ←  PG, produced by `pnpm run mj:migrate:convert`
  V<TS>__v<X.Y.x>__Foo.pg.sql        (converter output)
  V<TS>__v<X.Y.x>__Bar.pg-only.sql   (PG-only patches when needed)
```

`migrations-pg/` holds PostgreSQL counterparts for the later migrations but no baseline, so it cannot build a database yet. `pnpm run mj:migrate` with `DB_PLATFORM=postgresql` reads `migrations-pg/`; that swap happens only because the script passes no `--dir`, so a hand-run `mj migrate --dir ./migrations` runs the T-SQL set on either platform. `pg-migrations.yml`, which applies them to a fresh `postgres:17` container, runs only when started by hand. Schema changes are new migrations, never edits to the baseline: [`docs/database-migrations.md`](docs/database-migrations.md).

To build a new empty database from zero:

```bash
scripts/rebuild-db.sh   # drop → MJ core → common → tasks → accounting → orders → seed metadata
```

The migrations are applied as committed, with their CodeGen output, so no CodeGen run is needed
afterwards. The script reads `.env` (start from [`.env.example`](.env.example)) and needs sibling
checkouts of bizapps-common, bizapps-tasks and bizapps-accounting;
[`docs/HOW_THE_SYSTEM_WORKS.md` §12](docs/HOW_THE_SYSTEM_WORKS.md#12-local-run) lists its settings.

---

## Testing

**Unit** — `pnpm run build`, then `pnpm run test:unit` from the repo root (Vitest over every
package's `src/**/*.test.ts`; tests load the other packages from `dist/`). Pure logic, no database.
CI runs these on every pull request.

**Integration** — check bundles that drive a live database through the real stack: entity
subclasses, DB triggers, remote operations, and accounting's ledger all participate. Nothing is
mocked. The bundles are registered in
[`packages/IntegrationTests/src/index.ts`](packages/IntegrationTests/src/index.ts), and
[`registry-parity.test.ts`](packages/IntegrationTests/src/__tests__/registry-parity.test.ts) holds
each bundle's expected check count. CI does not run them (they need a database and the sibling
checkouts; `.github/workflows/ci.yml` explains), so run them before merging:

```bash
pnpm run build                                        # the harness loads the built packages
pnpm run test:integration                             # every bundle
node test-harnesses/integration.mjs subscriptions     # one bundle
IT_VERBOSE=1 node test-harnesses/integration.mjs subscriptions.SB5  # one check; IT_VERBOSE=1 prints each failure's stack
pnpm run verify   # unit tests, build, integration, then fail if any check failed or fewer ran than declared

# through MJ's test driver, recording results against the metadata Test records
RUN_MUTATION_TESTS=1 MJ_INTEGRATION_TEST=1 \
  pnpm exec mj test suite --name "BizApps Orders Integration"
```

`RUN_MUTATION_TESTS=1` is **required** for `mj test`: every check is mutation-class by nature, so a
run without it reports zero checks and passes vacuously.

### Demo data you can click through

The suite leaves no orders of its own behind — every check rolls back, which is what makes it
re-runnable. The committed ORD-WORLD catalog carries only two sample orders. For hands-on review
there is a seed that **commits**:

```bash
node test-harnesses/seed-demo-data.mjs --reset
```

It drives the same engine paths and leaves two companies (`DEMO Publishing Co` and
`DEMO Partner Press`) with orders in deliberately different states — unpaid, paid at confirm,
partially paid, an event deferral, a rolling membership, a prorated calendar membership, one
cancelled and refunded, one renewed, and a two-company order paid with one cheque — then prints a
trial balance so you can see the ledger reconciles. Safe to re-run; `--reset` clears the previous
set first.

Checks are safe to run repeatedly against a working database. Each one owns a transaction that
always rolls back, so orders, journal entries, payments and subscription terms never reach disk.
Only the shared ORD-WORLD catalog and the catalog rows a bundle's Setup adds are committed, and
teardown leaves them in place for the next run and for Explorer
([`packages/IntegrationTests/README.md`](packages/IntegrationTests/README.md), "Isolation") *(D48 —
the design, and the Phase 0 spike behind it, are in
[`plans/archive/integration-testing-plan.md`](plans/archive/integration-testing-plan.md) §0)*.

---

## Repository Structure

```
bizapps-orders/
├── mj-app.json                    # MJ Open App manifest (schema __mj_BizAppsOrders)
├── mj.config.cjs                  # CodeGen config + SQL → PG placeholder rules
├── .env.example                   # settings the MJ CLI, scripts and harnesses read; copy to .env
├── packages/
│   ├── Entities/                  # @mj-biz-apps/orders-entities (shared subclasses, pricing engine, OrdersEngine)
│   ├── Actions/                   # @mj-biz-apps/orders-actions (generated action subclasses)
│   ├── Server/                    # @mj-biz-apps/orders-server (bootstrap, server extensions, hand-written actions)
│   ├── CoreEntitiesServer/        # @mj-biz-apps/orders-core-entities-server (Save overrides, JE factories, operations, payment drivers)
│   ├── IntegrationTests/          # @mj-biz-apps/orders-integration-tests (check bundles for `mj test`)
│   └── Angular/                   # @mj-biz-apps/orders-ng
├── migrations/                    # T-SQL migrations (source of truth)
├── migrations-pg/                 # PostgreSQL counterparts so far (converter output); not a buildable set
├── metadata/                      # Seed data + entity metadata (synced via mj-sync)
├── metadata-tests/                # MJ: Tests + Test Suite records (pushed separately, not production seed)
├── scripts/                       # rebuild-db.sh, append-codegen.sh, db-snapshot.sh, assert-check-count.mjs
├── test-harnesses/                # standalone dispatchers (integration.mjs, integration-client.mjs, seed scripts)
├── docs/                          # how the running system works; start at docs/README.md
└── plans/
    ├── README.md                  # Pointer: current docs vs archive
    ├── entitlement-read-contract.md  # the entitlement read contract (shipped; code cites this path)
    └── archive/                   # Historical D1–D84 design docs
```

This repo has no MJAPI or MJ Explorer of its own; to run the API or the UI, host the app in an MJ
instance ([`docs/HOW_THE_SYSTEM_WORKS.md` §12](docs/HOW_THE_SYSTEM_WORKS.md#12-local-run)). Docs and
harness examples use port 4103 for MJAPI and 4303 for Explorer.

---

## What is still open

The engine slices in the old build sequence (per-line booking, company model, rev-rec, payments, subscriptions, tax, promotions) have landed, and so has the Bill.com invoice rail. What is outside this app or still open is in [`docs/HOW_THE_SYSTEM_WORKS.md`](docs/HOW_THE_SYSTEM_WORKS.md) §13: LXP packaging, live Stripe and Business Central export tests (other team), an approvals inbox, event capacity, multi-currency, and sibling apps (Contracts, Inventory).

---

## Cross-Repo Coordination

The consolidated master plan absorbed the prior issue-tracked coordination chain — **git is the history**. The one live companion document is the sibling plan, [`bizapps-accounting/plans/bizapps-accounting-master.md`](https://github.com/MemberJunction/bizapps-accounting), the accounting side of every boundary contract here (JE remote operations, GL role links, provenance, batching).

Future bolt-on apps layer on via seams Orders already ships (`FulfillmentStatus`, pricing-precedence top slot): **BizApps Contracts** and **BizApps Inventory**. Do not add their columns here.

---

## Documentation

| Document | Description |
|---|---|
| [Docs index](docs/README.md) | Every doc, grouped |
| [How the system works](docs/HOW_THE_SYSTEM_WORKS.md) | Current engine, API, UI, tests, and local run — start here |
| [API and UI architecture](docs/orders-api-and-ui-architecture.md) | Remote operations, Explorer sections, form binding |
| [UI architecture](docs/ui-architecture.md) | Binding rule: bind to entities and operations, no data-access service layer |
| [Database migrations](docs/database-migrations.md) | Binding rule: new migrations only; how metadata reaches a host |
| [ERD](docs/ERD.md) | The schema, generated from a database built by the migrations |
| [Checkout widget and sessions](docs/checkout-widget-and-session-architecture.md) | The embeddable checkout, its session engine and API |
| [Bill.com invoice rail](docs/billcom-invoice-rail.md) | The outbound invoice rail and payment poll |
| [Outbound events](docs/outbound-events.md) | Telling registered consumers about confirmed sales and grant changes |
| [Dependency on accounting](docs/dependency-on-accounting.md) | Why BizApps Accounting is required, and how it is configured |
| [Overdue and layered base views](docs/overdue-and-layered-base-views.md) | How `IsOverdue` is computed in the view layer |
| [Reviewing the data](docs/reviewing-the-data.md) | Committed seed you can inspect |
| [Adversarial order cases](docs/adversarial-order-cases.md) | Edge-case orders to build by hand, and what each should do |
| [Entitlement read contract](plans/entitlement-read-contract.md) | `Orders.CheckEntitlement` / `Orders.ListEntitlements` for downstream apps |
| [Archived design](plans/archive/) | Historical decision log (D1–D84) — not the running schema |
| [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) | The ledger primitives Orders emits into |
| [BizApps Common](https://github.com/MemberJunction/bizapps-common) | Person / Organization / Address master data |
| [BizApps Tasks](https://github.com/MemberJunction/bizapps-tasks) | The workflow / approval substrate |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Platform** | [MemberJunction](https://github.com/MemberJunction/MJ) | 6.1.6+ (below 7) |
| **Runtime** | Node.js | 18+ |
| **Language** | TypeScript | 5.9 (strict) |
| **Database (primary)** | SQL Server / Azure SQL | 2019+ |
| **Database (secondary)** | PostgreSQL | not buildable yet (see Database Support) |
| **API** | GraphQL (Apollo Server) | -- |
| **UI Framework** | Angular | 21 |
| **Build** | Turborepo | 2.7 |
| **Validation** | Zod | 3.25 |
| **SQL Conversion** | [`@memberjunction/sql-converter`](https://github.com/MemberJunction/MJ/tree/main/packages/SQLConverter) | with the MJ CLI, 6.1.6+ |

---

## License

Business Source License 1.1 — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built on <a href="https://github.com/MemberJunction/MJ">MemberJunction</a> — the metadata-driven application platform.
</p>
