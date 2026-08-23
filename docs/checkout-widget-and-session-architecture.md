# MemberJunction Checkout Widget & Session Architecture

The **MemberJunction Checkout Engine** provides an adaptive, metadata-driven, embeddable checkout and registration substrate. It allows any product in your MemberJunction catalog—from simple physical items and digital subscriptions to multi-attendee conference registrations and enterprise software seats—to be sold or registered online with zero boilerplate.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ANY WEB CLIENT                                        │
│  Angular (<mj-checkout-widget>) · Standalone JS Snippet · React / Vue / Static HTML     │
└─────────────────────────────────────────┬────────────────────────────────────────────────┘
                                          │  Slug + Session Key
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             CheckoutSessionService                                       │
│                                                                                          │
│  1. InitializeSession(slug)                                                              │
│     ├── Resolve Distribution & Widget Config                                            │
│     ├── Auto-Discover ProductType.OrderLineExtensionEntity via Metadata                 │
│     └── Merge customUI (Theming + Scoped CSS + Lifecycle JS Hooks)                       │
│                                                                                          │
│  2. UpdateDraft(sessionId, lines)                                                        │
│     └── In-Memory Pricing Engine (OrderPricingService) — No DB clutter                  │
│                                                                                          │
│  3. CompleteCheckout(sessionId, paymentToken, attendees)                                 │
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
10. [REST / Server API Reference](#rest--server-api-reference)

---

## Key Features

- 🪄 **Zero-Code Auto-Discovery**: Point a widget at a product. The engine automatically inspects the entity schema of the product type's companion extension entity (e.g. `EventOrderLine`, `CourseOrderLine`, `MembershipOrderLine`) and generates the UI form inputs (`text`, `textarea`, `select`, `date`, `number`, `boolean`).
- 🎨 **Extensible `customUI` Theming**: Complete control over brand styling, CSS token overrides, scoped CSS stylesheets, and client-side lifecycle JavaScript hooks (`onInit`, `onValidate`, `onQuantityChange`, `onBeforeSubmit`, `onSuccess`).
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
       "theme": {
         "primaryColor": "#2563eb",
         "borderRadius": "8px"
       }
     }
     ```
   *(Note: If you omit `extensionFields`, the system automatically discovers them from metadata!)*

### Step 3: Create a Distribution (Public Vanity URL)
1. In the Checkout Widget form, go to **Distributions → New Record**.
2. Enter:
   - **Slug**: `summit-2027`
   - **Status**: `Active`
   - **AllowAnonymous**: `true`
3. Save the record.

Your checkout widget is now live and accessible at `/checkout/summit-2027` or embeddable via the `<mj-checkout-widget slug="summit-2027">` Angular component!

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

Both `ProductType` and `CheckoutWidget` feature an extensible `Configuration` JSON column typed with `CustomUIConfiguration`.

### TypeScript Interface Structure

```typescript
export interface CustomUIThemeConfiguration {
    primaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    surfaceColor?: string;
    textColor?: string;
    borderRadius?: string;
    fontFamily?: string;
}

export interface CustomUIConfiguration {
    theme?: CustomUIThemeConfiguration;
    css?: string;
    js?: string;
    componentOverrideKey?: string;
}

export interface CheckoutWidgetConfiguration {
    productId?: string;
    productSku?: string;
    unitMode?: 'perUnit' | 'perLine';
    customUI?: CustomUIConfiguration;
    extensionEntityName?: string;
    extensionFields?: ExtensionFieldDef[];
    allowCoupons?: boolean;
    requireBillingAddress?: boolean;
    requireShippingAddress?: boolean;
}
```

### Cascading Theme Resolution
Themes and custom styles resolve in a cascading hierarchy:
$$\text{Base Default Theme} \longrightarrow \text{ProductType.Configuration.customUI} \longrightarrow \text{Widget.Configuration.customUI}$$

CSS variables injected into the widget container:
- `--mj-primary-color`: Primary action buttons and focus rings
- `--mj-accent-color`: Highlights and status badges
- `--mj-border-radius`: Input and container corner radiuses
- `--mj-font-family`: Custom typography

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
> **Payment Verification Status**: Free/zero-dollar checkouts ($0) book and confirm immediately upon submission. For orders with `TotalGross > 0`, `CompleteCheckout` verifies `PaymentIntentID` on the session before confirming. Host applications integrate gateway payment intents via `PaymentIntentService` and `CapturePaymentOperation`.

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

### 2. Standalone HTML / Vanilla JS Embed

Embed into WordPress, Webflow, Shopify, or static websites:

```html
<!-- Container -->
<div id="mj-checkout-container"></div>

<!-- MemberJunction Widget Bundle -->
<script src="https://cdn.example.com/mj-checkout-widget.js"></script>
<script>
  MJCheckout.mount('#mj-checkout-container', {
    distributionSlug: 'summit-2027',
    apiBaseUrl: 'https://api.example.com',
    theme: {
      primaryColor: '#059669',
      borderRadius: '12px'
    },
    onSuccess: function(result) {
      window.location.href = '/thank-you?order=' + result.orderNumber;
    }
  });
</script>
```

---

## Server API & Service Reference

The server orchestration is implemented by `CheckoutSessionService` in `@mj-biz-apps/orders-core-entities-server` (and exposed via REST/GraphQL gateway endpoints in host applications):

### 1. `InitializeSession(distributionSlug, clientSessionKey)`
Initializes a new checkout session.

**Request Payload:**
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

### 2. `POST /api/checkout/update-draft`
Recalculates draft pricing in memory.

**Request Payload:**
```json
{
  "sessionId": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "email": "janet@example.com",
  "lines": [
    {
      "productId": "79b4a2c1-...",
      "quantity": 2
    }
  ]
}
```

### 3. `POST /api/checkout/complete`
Executes payment verification, line creation, companion extension hydration, lifecycle booking, and claim generation.

**Request Payload:**
```json
{
  "sessionId": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "email": "janet@example.com",
  "paymentMethodId": "pm_card_visa",
  "lines": [
    {
      "productId": "79b4a2c1-...",
      "quantity": 2,
      "attendees": [
        {
          "firstName": "Janet",
          "lastName": "Doer",
          "email": "janet@example.com",
          "dietaryPreferences": "Gluten Free",
          "allergies": "Peanuts"
        },
        {
          "firstName": "Sam",
          "lastName": "Altman",
          "email": "sam@openai.com",
          "dietaryPreferences": "Vegetarian",
          "allergies": "None"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "Success": true,
  "OrderID": "28471f24-2a35-4a50-8f60-6b224f747ffb",
  "OrderNumber": "ORD-1000028",
  "TotalGross": 550.00,
  "Status": "Confirmed",
  "IdentityClaimID": "6df81e42-901a-4c28-bb84-90a1f2b842cd"
}
```
