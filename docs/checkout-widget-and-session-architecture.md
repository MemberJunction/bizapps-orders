# MemberJunction Checkout Widget & Session Architecture

The **MemberJunction Checkout Engine** provides an adaptive, metadata-driven, embeddable checkout and registration substrate. It allows any product in your MemberJunction catalog—from simple physical items and digital subscriptions to multi-attendee conference registrations and enterprise software seats—to be sold or registered online with zero boilerplate.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ANY WEB CLIENT                                        │
│  Angular (<mj-checkout-widget>) · Host App Routing · Headless API / Webhooks             │
└─────────────────────────────────────────┬────────────────────────────────────────────────┘
                                          │  Slug + Session Key
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             CheckoutSessionService                                       │
│                                                                                          │
│  1. InitializeSession(slug, clientKey)                                                   │
│     ├── Resolve Distribution & Widget Config                                            │
│     ├── Auto-Discover ProductType.OrderLineExtensionEntity via Metadata                 │
│     └── Merge customUI (Theming + Custom CSS + Lifecycle JS Hooks)                       │
│                                                                                          │
│  2. UpdateDraft(sessionId, clientKey, email, lines)                                      │
│     └── In-Memory Pricing Engine (OrderPricingService) — No DB clutter                  │
│                                                                                          │
│  2b. OpenPaymentIntentForSession(sessionId, clientKey)   [paid orders]                   │
│     └── Server-priced amount + widget-configured provider → ClientSecret                 │
│                                                                                          │
│  3. CompleteCheckout(sessionId, clientKey)                                               │
│     ├── Resolve / Create Person Records                                                  │
│     ├── Multi-Unit Line Splitting (unitMode: 'perUnit' vs 'perLine')                      │
│     ├── Atomic Companion Persistence (OrderLine.Extension BaseEntity)                    │
│     ├── Full Lifecycle Booking: await order.Confirm()                                    │
│     │   ├── Emits Double-Entry Journal Entries to BizApps Accounting                     │
│     │   └── Generates Rev-Rec Waterfall Schedules                                       │
│     └── Mints Cryptographic Guest Claim Token (IdentityClaimEngineServer)                │
└─────────────────────────────────────────┬────────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                  MEMBERJUNCTION DB                                       │
│  OrderHeader · OrderLine · EventOrderLine (IS-A) · JournalEntry · IdentityClaim          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Key Features](#key-features)
2. [How It Works](#how-it-works)
3. [Creating a Checkout Widget for Any Product (Tutorial)](#creating-a-checkout-widget-for-any-product-tutorial)
4. [Metadata Reflection & Auto-Discovery](#metadata-reflection--auto-discovery)
5. [The `Configuration` JSONType & `customUI` Engine](#the-configuration-jsontype--customui-engine)
6. [Multi-Unit Discrete Expansion (`unitMode`)](#multi-unit-discrete-expansion-unitmode)
7. [Zero-DB-Draft In-Memory Pricing & Atomic Booking](#zero-db-draft-in-memory-pricing--atomic-booking)
8. [Guest Record Claiming Workflow](#guest-record-claiming-workflow)
9. [Embedding the Widget in Your Applications](#embedding-the-widget-in-your-applications)
10. [Server API & Service Reference](#server-api--service-reference)

---

## Key Features

- 🪄 **Zero-Code Auto-Discovery**: Point a widget at a product. The engine automatically inspects the entity schema of the product type's companion extension entity (e.g. `EventOrderLine`, `CourseOrderLine`, `MembershipOrderLine`) and generates the UI form inputs (`text`, `textarea`, `select`, `date`, `number`, `boolean`).
- 🎨 **Extensible `customUI` Theming**: Complete control over brand styling, CSS token overrides, custom CSS stylesheets, and client-side lifecycle JavaScript hooks (`onInit`, `onValidate`, `onQuantityChange`, `onBeforeSubmit`, `onDestroy`).
- 🎟️ **Multi-Attendee / Discrete Unit Expansion**: When buying multiple tickets or seats (`unitMode: 'perUnit'`), the widget dynamically expands discrete attendee cards and creates individual, fully-associated order lines in the database.
- ⚡ **Zero Database Clutter During Shopping**: Real-time line calculations and discount pricing execute 100% in-memory via `OrderPricingService`. No temporary draft rows pollute `OrderHeader`.
- 📒 **Double-Entry Accounting on Confirm**: Paid and free ($0) orders immediately execute `order.Confirm()`, posting balanced debits and credits into [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) and generating Revenue Recognition schedules.
- 🔐 **Guest Identity Claiming**: Anonymous buyers receive a secure cryptographic claim token / magic link allowing them to claim their orders, tickets, and entitlements once they sign in.

---

## How It Works

### Core Entities

| Entity | Role |
|---|---|
| **`MJ_BizApps_Orders: Checkout Widgets`** | The definition of what is being sold (Product ID/SKU, base theme, allowed domains, custom UI). |
| **`MJ_BizApps_Orders: Checkout Widget Distributions`** | The public distribution channel (unique URL `Slug`, active date ranges, expiration, campaign tracking). |
| **`MJ_BizApps_Orders: Checkout Sessions`** | The ephemeral shopping session between a visitor and the server (`ClientSessionKey`, in-memory draft state, expiry). |
| **`MJ_BizApps_Orders: Order Headers`** | The finalized posted order record, generated atomically upon completion. |
| **`MJ_BizApps_Orders: Order Lines`** | Discrete line items for each purchased product. |
| **`OrderLineExtensionEntity` (e.g. `EventOrderLine`)** | Polymorphic companion entity holding product-type-specific attributes (dietary preferences, seat assignments, licensing keys). |

---

## Creating a Checkout Widget for Any Product (Tutorial)

Creating a checkout flow for any product takes less than two minutes.

### Step 1: Ensure Your Product & Product Type Exist
In **MemberJunction Explorer** (or via code/migrations):
1. Navigate to **Catalog → Product Types**.
2. If your product requires custom fields (e.g. conference attendee details, shirt sizes, custom engraving text), set **`OrderLineExtensionEntity`** to your extension entity (e.g. `MJ_BizApps_Orders: Event Order Lines`).
3. Navigate to **Catalog → Products** and create your product (e.g. `Annual Summit Pass 2027`, SKU: `SUMMIT-2027`, Price: `$275.00`).

### Step 2: Create a Checkout Widget Record
1. In Explorer, navigate to **Sales → Checkout Widgets → New Record**.
2. Enter:
   - **Name**: `2027 Annual Conference Registration`
   - **Company**: Select your selling company
   - **Status**: `Active`
   - **Configuration** (JSON):
     ```json
     {
       "productSku": "SUMMIT-2027",
       "customUI": {
         "theme": {
           "primaryColor": "#2563eb",
           "borderRadius": "8px"
         }
       }
     }
     ```
   *(Note: If you omit `extensionFields`, the system automatically discovers them from metadata!)*

### Step 3: Create a Distribution (Public Vanity URL)
1. In the Checkout Widget form, go to **Distributions → New Record**.
2. Enter:
   - **Slug**: `summit-2027`
   - **Status**: `Active`
3. Save the record.

Anonymous access is inherent to the checkout edge (there is no per-distribution toggle);
the widget's `Configuration` carries the security knobs — `allowedOrigins` (embed origin
allowlist) and `requireTurnstile` (Cloudflare Turnstile on initialize/complete).

Your checkout widget distribution is now active for `summit-2027` and ready to be loaded via the `<mj-checkout-widget [distributionSlug]="'summit-2027'">` Angular component or host application routes.

---

## Metadata Reflection & Auto-Discovery

When `CheckoutSessionService.InitializeSession` runs, it inspects the target product's `ProductType`:

```
Product (SKU: 'CONF-2027')
   │
   └── ProductType ('Event Registration')
          │
          └── OrderLineExtensionEntity ('MJ_BizApps_Orders: Event Order Lines')
                 │
                 ├── Foreign Key: PersonID ──► Auto-injects: First Name, Last Name, Email, Company, Title
                 ├── nvarchar: DietaryPreferences ──► Auto-injects: Text / Dropdown
                 ├── nvarchar: Allergies ──────────► Auto-injects: Text
                 ├── nvarchar: Comments ───────────► Auto-injects: Textarea
                 └── bit: IsVIP ───────────────────► Auto-injects: Checkbox
```

### Auto-Discovery Rules
1. **Person Identity Detection**: If the extension entity contains a `PersonID` field, standard contact inputs (`firstName`, `lastName`, `email`, `company`, `title`) are automatically populated.
2. **Type Mapping**:
   - `nvarchar(max)` or length > 255 ➔ `textarea`
   - `nvarchar(<= 255)` ➔ `text`
   - `bit` ➔ `boolean` (checkbox)
   - `int` / `decimal` / `float` ➔ `number`
   - `date` / `datetimeoffset` ➔ `date`
   - Fields with Value Lists (CHECK constraints) ➔ `select` dropdown with choices.
3. **Exclusions**: System audit fields (`__mj_CreatedAt`, `__mj_UpdatedAt`), primary keys (`ID`), and parent `OrderLine` fields are automatically excluded.

---

## The `Configuration` JSONType & `customUI` Engine

Both `ProductType` and `CheckoutWidget` feature an extensible `Configuration` JSON column typed with schema interfaces from `@mj-biz-apps/orders-entities/configuration-types`.

### TypeScript Interface Structure

```typescript
export interface CustomUIThemeConfiguration {
    primaryColor?: string;
    accentColor?: string;
    borderRadius?: string;
    fontFamily?: string;
    backgroundColor?: string;
    textColor?: string;
    [key: string]: unknown;
}

export interface CustomUIConfiguration {
    /**
     * Custom JavaScript code string containing lifecycle hooks or UI handlers.
     */
    js?: string;
    /**
     * Custom CSS stylesheet string containing custom styling rules.
     */
    css?: string;
    /**
     * Theme tokens and color customizations.
     */
    theme?: CustomUIThemeConfiguration;
    /**
     * Registered custom component override key/class name.
     */
    componentOverrideKey?: string;
    [key: string]: unknown;
}

export interface FieldOverrideConfiguration {
    label?: string;
    placeholder?: string;
    hidden?: boolean;
    required?: boolean;
    defaultValue?: unknown;
    order?: number;
    options?: Array<{ label: string; value: string | number }>;
    [key: string]: unknown;
}

export interface ProductTypeConfiguration {
    /**
     * Unit mode: 'perUnit' (discrete repeating fieldsets) vs 'perLine' (single fieldset for the line).
     */
    unitMode?: 'perUnit' | 'perLine';
    /**
     * Maximum quantity allowed per order or line.
     */
    maxQuantity?: number;
    /**
     * Whether quantity selection is permitted in self-service checkout surfaces.
     */
    allowQuantity?: boolean;
    /**
     * Field overrides and customizations for line extension entity fields.
     */
    fieldOverrides?: Record<string, FieldOverrideConfiguration>;
    /**
     * Custom UI section containing JS hooks, custom CSS, theme tokens, and component overrides.
     */
    customUI?: CustomUIConfiguration;
    [key: string]: unknown;
}

export interface ExtensionFieldDef {
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select';
    required?: boolean;
    placeholder?: string;
    defaultValue?: unknown;
    options?: Array<{ label: string; value: string | number }>;
}

export interface CheckoutWidgetConfiguration {
    title?: string;
    description?: string;
    productId?: string;
    productSku?: string;
    productName?: string;
    unitPrice?: number;
    currency?: string;
    unitMode?: 'perUnit' | 'perLine';
    allowQuantity?: boolean;
    maxQuantity?: number;
    stripePublishableKey?: string;
    successMessage?: string;
    redirectUrl?: string;
    extensionEntityName?: string;
    extensionFields?: ExtensionFieldDef[];
    /**
     * Custom UI section containing JS hooks, custom CSS, theme tokens, and component overrides.
     */
    customUI?: CustomUIConfiguration;
    [key: string]: unknown;
}
```

### Theme & Styling Token Application

When rendered, the checkout component applies theme tokens directly as CSS variables:
- `--mj-primary-color`: Primary action buttons and focus rings (default: `#2563eb`)
- `--mj-accent-color`: Highlights and status badges (default: `#3b82f6`)
- `--mj-border-radius`: Input and container corner radiuses (default: `8px`)
- `--mj-font-family`: Custom typography font family
- `--mj-bg-color`: Container background surface (default: `#ffffff`)
- `--mj-text-color`: Primary text color (default: `#0f172a`)

If `customUI.css` is supplied in the widget or product type configuration, the rules are injected into a custom style tag for granular design customization.

### Client-Side Lifecycle JavaScript Hooks
Custom JS defined in `customUI.js` executes within the widget context:

```javascript
window.MJCheckoutHooks = {
    onInit({ config, distributionSlug }) {
        console.log("Widget initialized for distribution:", distributionSlug);
    },
    onValidate(submission) {
        if (submission.email.endsWith("@competitor.com")) {
            return "Registrations from this domain are not accepted.";
        }
    },
    onQuantityChange({ quantity }) {
        console.log("Quantity updated to:", quantity);
    },
    onBeforeSubmit(submission) {
        submission.extensionData.fields['source'] = 'marketing-campaign-q1';
    },
    onDestroy({ component }) {
        console.log("Widget instance unmounted");
    }
};
```

---

## Multi-Unit Discrete Expansion (`unitMode`)

Products represent different purchasing units:
- **`perLine`** (Default): A single line with `Quantity = N` (e.g. buying 10 boxes of pens).
- **`perUnit`**: Multi-unit purchases where **every single unit requires discrete registration data** (e.g. buying 3 conference tickets requires 3 attendee names and dietary choices).

### UI Behavior
When `unitMode === 'perUnit'` or `Product.MaxQuantityPerLine === 1`:
- Increasing the quantity selector immediately adds **`Attendee #1`**, **`Attendee #2`**, ..., **`Attendee #N`** sub-forms.
- Includes a 1-click **"Copy Contact to All"** helper button.

### Database Persistence
In `CheckoutSessionService.CompleteCheckout`:
- The service splits the quantity into discrete `OrderLine` records:
  - Line 1: `Quantity = 1`, `Description = "Annual Pass - Jane Doe"` ➔ `EventOrderLine` (`PersonID = Jane`, `DietaryPreferences = Vegan`)
  - Line 2: `Quantity = 1`, `Description = "Annual Pass - John Smith"` ➔ `EventOrderLine` (`PersonID = John`, `DietaryPreferences = None`)
- All lines and companion records are saved atomically within the order transaction.

---

## Zero-DB-Draft In-Memory Pricing & Atomic Booking

### Draft Phase
When a user adds items or inputs coupon codes:
- `CheckoutSessionService.UpdateDraft` constructs an in-memory `OrderHeaderEntity` graph.
- Executes `OrderPricingService` in memory to evaluate price tiers, volume breaks, and tax estimates.
- Returns the computed pricing to the client while storing the snapshot in `CheckoutSession.MetadataJSON`.
- **Zero draft rows are written to the `OrderHeader` database table.**

### Confirmation & Booking Phase
When the user clicks **Pay & Register**:
```typescript
// Server execution inside CompleteCheckout:
const order = await md.GetEntityObject<OrderHeaderEntity>('MJ_BizApps_Orders: Order Headers', contextUser);
order.NewRecord();
order.OrderDate = new Date();
order.Status = 'Pending';
order.Origin = 'Widget';

// Populate lines and companion extension entities...
await order.Save();

// Atomic BaseEntity Lifecycle Booking:
const confirmed = await order.Confirm();
if (!confirmed) {
    throw new Error(`Order confirmation failed: ${order.LatestResult?.Message}`);
}
```

> [!IMPORTANT]
> **Payment Verification Status**: Free/zero-dollar checkouts ($0) book and confirm immediately upon submission. For orders with `TotalGross > 0`, `CompleteCheckout` verifies the session's payment intent **state and amount** server-side — the intent must exist, be `Succeeded` (as advanced by the signature-verified payment webhook), and cover the freshly re-priced total. A session acquires its intent only through `CheckoutSessionService.OpenPaymentIntentForSession`, which prices from the session's own server-computed snapshot and resolves the provider from the widget's `Configuration.paymentProviderId` — the client never supplies an amount or a provider. `UpdateDraft` detaches the intent whenever the priced total changes, forcing a reopen at the new amount.

#### What Happens During `order.Confirm()`:
1. Validates payment capture / authorization.
2. Updates `OrderHeader.Status = 'Confirmed'` and stamps `ConfirmedAt`.
3. Creates balanced, double-entry **Journal Entries** in BizApps Accounting (`A/R Debit`, `Revenue / Deferred Revenue Credit`).
4. Generates **Deferred Revenue Schedules** for subscription / event recognition.
5. Emits real-time notification events across MemberJunction.

---

## Guest Record Claiming Workflow

When an unauthenticated guest completes an order:

```
1. Guest checks out as "jane@example.com"
   │
2. CheckoutSessionService creates:
   ├── OrderHeader (ORD-1000028)
   ├── Person ("Jane Doe", jane@example.com)
   └── IdentityClaim Token (UUID / Cryptographic Token)
   │
3. System sends Email Magic Link:
   "Click here to claim your tickets: https://app.example.com/claim?token=..."
   │
4. Jane clicks link or logs into MemberJunction:
   └── IdentityClaimEngineServer validates token
       ├── Stamped Jane's authenticated UserID onto the Person record
       └── Grants access to ORD-1000028 and associated Entitlements
```

---

## Embedding the Widget in Your Applications

### 1. Angular Application (Direct Component Embed)

Import `MJCheckoutWidgetComponent` from `@mj-biz-apps/orders-ng`:

```typescript
import { Component } from '@angular/core';
import { MJCheckoutWidgetComponent, type CheckoutSubmissionEvent, type CheckoutWidgetConfig } from '@mj-biz-apps/orders-ng';

@Component({
  standalone: true,
  imports: [MJCheckoutWidgetComponent],
  template: `
    <div class="checkout-container">
      <mj-checkout-widget 
        [config]="config"
        [distributionSlug]="'summit-2027'"
        [isPaymentReady]="isPaymentReady"
        (submitted)="onSubmitted($event)">
      </mj-checkout-widget>
    </div>
  `
})
export class RegistrationPageComponent {
  public config: CheckoutWidgetConfig = {
    title: '2027 Annual AI Summit',
    unitPrice: 275.00,
    allowQuantity: true
  };
  public isPaymentReady = false;

  public onSubmitted(event: CheckoutSubmissionEvent): void {
    console.log("Checkout submitted:", event.sessionKey, event.totalGross, event.email);
  }
}
```

### 2. Public checkout URL (MJAPI, not Explorer)

Anonymous buyers do not have an Explorer session. The public URL is served by MJAPI on the existing `OrdersCheckoutEdge` and hosts the reusable Angular `<mj-checkout-widget>` (packaged as the `<mj-orders-checkout>` custom element). Extension fields are introspected from the product type's `OrderLineExtensionEntity` — events are one product type, not a hard-coded form.

```
GET {MJAPI}/checkout/:slug
```

Example: `http://localhost:4103/checkout/summit-2027`

That route returns a vanilla HTML page that talks only to the POST edge below (`initialize` → `draft` → `payment-intent` if required → `complete`). It is not an Explorer route and not a custom-element bundle.

The Angular `<mj-checkout-widget>` remains the embeddable control for sites that already host Angular. A wrapper route inside Explorer would require login and is the wrong guest surface.

When Orders is installed as an Open App (`dynamicPackages.server[]` includes `@mj-biz-apps/orders-server`), MJ auto-loads `OrdersCheckoutEdge` from the package's `MJ_SERVER_EXTENSIONS` export — the host `mj.config.cjs` does not need to copy the extension block. Host `serverExtensions[]` is still the override layer (`Enabled`, `RootPath`, `Settings` such as `ServiceUserEmail`).

### 3. Headless & Custom Frontend Integration — the anonymous checkout edge

The app ships its own public REST edge: **`CheckoutServerExtension`** (`@mj-biz-apps/orders-server`, DriverClass `OrdersCheckoutEdge`), mounted pre-auth via Open App `MJ_SERVER_EXTENSIONS` (host `serverExtensions[]` overlays). Default root path `/checkout`:

1. `GET /checkout/:slug` — first-party HTML host page for the distribution (404 if the slug is reserved or not an Active distribution)
2. `POST /checkout/initialize` — body `{ slug, clientSessionKey, turnstileToken? }`
3. `POST /checkout/draft` — body `{ sessionId, clientSessionKey, email, lines }`
4. `POST /checkout/payment-intent` — body `{ sessionId, clientSessionKey }` → returns the gateway `ClientSecret` for Stripe.js confirmation
5. `POST /checkout/complete` — body `{ sessionId, clientSessionKey, turnstileToken? }`

The edge enforces, in order and fail-closed: a body-size cap, per-IP(+slug) fixed-window rate limiting, the widget's `Configuration.allowedOrigins` allowlist (with CORS grants only for allowed origins), and — when the widget sets `requireTurnstile` — Cloudflare Turnstile verification against the secret named by the extension's `Settings.TurnstileSecretEnvVar`. Writes run as the principal named by `Settings.ServiceUserEmail`, falling back to MJ's system user. **No request body carries an amount, a price, a product resolution, or a payment provider** — those all resolve server-side.

---

## Server API & Service Reference

The server orchestration is implemented by `CheckoutSessionService` in `@mj-biz-apps/orders-core-entities-server` (exposed publicly by `CheckoutServerExtension` above; hosts may additionally wrap it in their own GraphQL or Remotable Operations). Every mutating call requires **both** the session id and the client session key, and enforces the session TTL.

### 1. `InitializeSession(distributionSlug, clientSessionKey)`
Initializes a new checkout session (or reuses the caller's open, unexpired one). Secret-shaped keys are stripped from the returned `Configuration` before it ships to the anonymous caller.

**Request Parameters:**
```json
{
  "distributionSlug": "summit-2027",
  "clientSessionKey": "client-uuid-12345"
}
```

**Response:**
```json
{
  "Success": true,
  "SessionID": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "WidgetName": "2027 Annual Conference Registration",
  "Configuration": {
    "productId": "79b4a2c1-...",
    "productSku": "CONF-2027",
    "unitMode": "perUnit",
    "extensionEntityName": "MJ_BizApps_Orders: Event Order Lines",
    "extensionFields": [
      { "name": "firstName", "label": "First Name", "type": "text", "required": true },
      { "name": "lastName", "label": "Last Name", "type": "text", "required": true },
      { "name": "email", "label": "Email Address", "type": "text", "required": true },
      { "name": "dietaryPreferences", "label": "Dietary Preferences", "type": "select", "required": false },
      { "name": "allergies", "label": "Allergies", "type": "text", "required": false }
    ],
    "customUI": {
      "theme": { "primaryColor": "#2563eb" }
    }
  }
}
```

### 2. `UpdateDraft(sessionID, clientSessionKey, email, lines)`
Recalculates draft pricing in memory and persists the priced snapshot to the session. Resolves (but never creates) the payer Person by email so person-specific pricing applies to drafts; detaches a previously opened payment intent when the total changes. Quantities are capped per line (`Product.MaxQuantityPerLine`, `ProductType.Configuration.maxQuantity`, or the server default of 100), and a checkout carries at most 50 lines.

**Request Parameters:**
```json
{
  "sessionId": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "clientSessionKey": "client-uuid-12345",
  "email": "janet@example.com",
  "lines": [
    {
      "ProductID": "79b4a2c1-...",
      "Quantity": 2,
      "Attendees": [
        { "FirstName": "Janet", "LastName": "Doer", "Email": "janet@example.com", "DietaryPreferences": "Gluten Free" },
        { "FirstName": "Sam", "LastName": "Chen", "Email": "sam@example.com", "DietaryPreferences": "Vegetarian" }
      ]
    }
  ]
}
```

### 3. `OpenPaymentIntentForSession(sessionID, clientSessionKey)`
Opens (or idempotently re-opens) a payment intent for the session's **current server-priced total**. The amount comes from the session's own priced snapshot; the provider from the widget's `Configuration.paymentProviderId`. Returns the gateway `ClientSecret` (never persisted) for Stripe.js confirmation and stamps `session.PaymentIntentID`.

**Response:**
```json
{
  "Success": true,
  "SessionID": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "PaymentIntentID": "0b8a41d2-...",
  "ClientSecret": "pi_..._secret_...",
  "Amount": 550.00
}
```

### 4. `CompleteCheckout(sessionID, clientSessionKey)`
Executes payer-Person resolution (find-or-create by the session's captured email), payment verification (intent `Succeeded` + amount covers the re-priced total), line creation from the session's own snapshot (never fresh client input), companion extension hydration, atomic lifecycle booking, and GuestOrder claim generation. **Replay-safe**: calling it again on a `Confirmed` session returns the existing order rather than booking twice, and a failure after the order has committed never reverts the session to `Open`.

**Request Parameters:**
```json
{
  "sessionId": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "clientSessionKey": "client-uuid-12345"
}
```

**Response:**
```json
{
  "Success": true,
  "OrderID": "28471f24-2a35-4a50-8f60-6b224f747ffb",
  "OrderNumber": "ORD-1000028",
  "TotalGross": 550.00,
  "SessionID": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "Status": "Confirmed",
  "ClaimToken": "6df81e42-901a-4c28-bb84-90a1f2b842cd"
}
```

> `ClaimToken` is the `IdentityClaim` **row id** — the cryptographic verification token itself is only ever delivered in the claim email.
