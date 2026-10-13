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
│  2. UpdateDraft(sessionId, clientKey, email, lines, billingAddress)                      │
│     ├── Billing location required (ISO country + subdivision) — CheckBillingLocation    │
│     └── In-Memory Pricing Engine (OrderPricingService) — No DB clutter                  │
│                                                                                          │
│  2b. OpenPaymentIntentForSession(sessionId, clientKey)   [paid orders]                   │
│     └── Server-priced amount + widget-configured provider → ClientSecret                 │
│                                                                                          │
│  3. CompleteCheckout(sessionId, clientKey)                                               │
│     ├── Resolve Person Records (create missing ones after payment verifies)             │
│     ├── Multi-Unit Line Splitting (unitMode: 'perUnit' vs 'perLine')                      │
│     ├── Atomic Companion Persistence (OrderLine.Extension BaseEntity)                    │
│     ├── Full Lifecycle Booking: await order.Confirm()                                    │
│     │   ├── Emits Double-Entry Journal Entries to BizApps Accounting                     │
│     │   └── Forward-Dated Revenue-Recognition Journal Entries                            │
│     └── GuestOrder Claim: minted through MJ's IdentityClaimEngineServer, no e-mail       │
└─────────────────────────────────────────┬────────────────────────────────────────────────┘
                                          │
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                  MEMBERJUNCTION DB                                       │
│  OrderHeader · OrderLine · EventOrderLine (IS-A) · JournalEntry · EntitlementGrant       │
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
7. [Questions at Checkout (`questions`)](#questions-at-checkout-questions)
8. [Choice Groups at Checkout (`choiceGroups`)](#choice-groups-at-checkout-choicegroups)
9. [Zero-DB-Draft In-Memory Pricing & Atomic Booking](#zero-db-draft-in-memory-pricing--atomic-booking)
10. [Pre-Purchase Checks](#pre-purchase-checks)
11. [Post-Payment Step Record, Review Queue and Replay](#post-payment-step-record-review-queue-and-replay)
12. [Guest Record Claiming Workflow](#guest-record-claiming-workflow)
13. [Account Step After Payment (`CheckoutAccountStep`)](#account-step-after-payment-checkoutaccountstep)
14. [Embedding the Widget in Your Applications](#embedding-the-widget-in-your-applications)
15. [Server API & Service Reference](#server-api--service-reference)

---

## Key Features

- 🪄 **Zero-Code Auto-Discovery**: Point a widget at a product. The engine automatically inspects the entity schema of the product type's companion extension entity (e.g. `EventOrderLine`, the one this app ships, used by the Event product type) and generates the UI form inputs (`text`, `textarea`, `select`, `date`, `number`, `boolean`). An Event widget still needs authored `extensionFields`; see [Auto-Discovery Rules](#auto-discovery-rules).
- 🎨 **Extensible `customUI` Theming**: Complete control over brand styling, CSS token overrides, custom CSS stylesheets, and client-side lifecycle JavaScript hooks (`onInit`, `onValidate`, `onQuantityChange`, `onBeforeSubmit`, `onDestroy`).
- 🎟️ **Multi-Attendee / Discrete Unit Expansion**: When buying multiple tickets or seats (`unitMode: 'perUnit'`), the widget dynamically expands discrete attendee cards and creates individual, fully-associated order lines in the database.
- ⚡ **Zero Database Clutter During Shopping**: Real-time line calculations and discount pricing execute 100% in-memory via `OrderPricingService`. No temporary draft rows pollute `OrderHeader`.
- 📒 **Double-Entry Accounting on Confirm**: Free ($0) orders, and paid orders once their payment is verified, execute `order.Confirm()`, which posts balanced debits and credits into [BizApps Accounting](https://github.com/MemberJunction/bizapps-accounting) for each line with a value to book (a free item posts nothing); deferred revenue is released by forward-dated journal entries, one per recognition period.
- 🔐 **Guest Identity Claiming**: checkout mints a GuestOrder claim through MemberJunction's claim engine; redeeming it attaches the order and its entitlements to the buyer's account. Claim e-mails are off for now; see [Guest Record Claiming Workflow](#guest-record-claiming-workflow).

---

## How It Works

### Core Entities

| Entity | Role |
|---|---|
| **`MJ_BizApps_Orders: Checkout Widgets`** | The definition of what is being sold (Product ID/SKU, base theme, allowed domains, custom UI). |
| **`MJ_BizApps_Orders: Checkout Widget Distributions`** | The public distribution channel (unique URL `Slug`; `Status` is `Active` or `Revoked`, with the revocation time and reason). |
| **`MJ_BizApps_Orders: Checkout Sessions`** | The ephemeral shopping session between a visitor and the server (`ClientSessionKey`, the priced draft snapshot in `MetadataJSON`, expiry). |
| **`MJ_BizApps_Orders: Checkout Session Steps`** | One row per post-payment step (`Confirm`, `Capture`) of a paid checkout, read by the review queue and replay (see [Post-Payment Step Record](#post-payment-step-record-review-queue-and-replay)). |
| **`MJ_BizApps_Orders: Order Headers`** | The order, created and confirmed (`Status = 'Confirmed'`) in one transaction when checkout completes. |
| **`MJ_BizApps_Orders: Order Lines`** | Discrete line items for each purchased product. |
| **`MJ_BizApps_Orders: Order Checkout Answers`** | The buyer's answers to the widget's `questions`, one row per answered question, on the order. |
| **`MJ_BizApps_Orders: Order Line Choices`** | The buyer's picks from the widget's `choiceGroups`, one row per pick, on each order line. |
| **`OrderLineExtensionEntity` (e.g. `EventOrderLine`)** | Polymorphic companion entity holding product-type-specific attributes (dietary preferences, seat assignments, licensing keys). |

---

## Creating a Checkout Widget for Any Product (Tutorial)

Creating a checkout flow for any product takes less than two minutes.

### Step 1: Ensure Your Product & Product Type Exist
In **MemberJunction Explorer** (or via code/migrations):
1. Pick the product type. The Orders app's **Catalog → Products & categories** page lists product types but does not edit them; to change one, open its record in the generated `MJ_BizApps_Orders: Product Types` form.
2. If your product requires custom fields (e.g. conference attendee details, shirt sizes, custom engraving text), set the type's **`OrderLineExtensionEntity`** to the extension entity. The seeded **Event** type already points at `MJ_BizApps_Orders: Event Order Lines`, the one extension this app ships; a widget selling an Event product needs authored `extensionFields` (step 2).
3. In **Catalog → Products & categories**, create your product with the grid's New button (e.g. `Annual Summit Pass 2027`, SKU: `SUMMIT-2027`). Its price (e.g. `$275.00`) is a product price rule, listed under **Catalog → Pricing**.

### Step 2: Create a Checkout Widget Record
1. Checkout widgets have no page in the Orders app's navigation (Orders, Payments, Receivables, Catalog). In Explorer, create a record in the generated `MJ_BizApps_Orders: Checkout Widgets` form.
2. Enter:
   - **Name**: `2027 Annual Conference Registration`
   - **Company**: Select your selling company
   - **Status**: `Active`
   - **Configuration** (JSON):
     ```json
     {
       "productSku": "SUMMIT-2027",
       "unitPrice": 275,
       "paymentProviderId": "<ID of a MJ_BizApps_Orders: Payment Providers row>",
       "stripePublishableKey": "pk_test_...",
       "customUI": {
         "theme": {
           "primaryColor": "#2563eb",
           "borderRadius": "8px"
         }
       }
     }
     ```
   *(Note: If you omit `extensionFields`, the system automatically discovers them from metadata!)* See [Auto-Discovery Rules](#auto-discovery-rules).

   A paid product needs the three keys after `productSku`: without `unitPrice` the widget shows the item as free and renders no card form, without `stripePublishableKey` no card form is mounted, and without `paymentProviderId` `/checkout/payment-intent` refuses. A free product needs none of them.

### Step 3: Create a Distribution (Public Vanity URL)
1. In the Checkout Widget form, open the **Checkout Widget Distributions** section and add a record.
2. Enter:
   - **Slug**: `summit-2027`
   - **Status**: `Active`
3. Save the record.

Anonymous access is inherent to the checkout edge (there is no per-distribution toggle);
the widget's `Configuration` carries the security knobs — `allowedOrigins` (embed origin
allowlist) and `requireTurnstile` (Cloudflare Turnstile on initialize/complete; see [Configuration Keys](#configuration-keys)
and [Turnstile](#turnstile)).

Your checkout widget distribution is now active for `summit-2027`: MJAPI serves it at `GET {MJAPI}/checkout/summit-2027`, and another page can embed it as `<mj-orders-checkout slug="summit-2027">` (see [Embedding the Widget](#embedding-the-widget-in-your-applications)). The Angular `<mj-checkout-widget>` makes no server calls itself; its `distributionSlug` input only reaches the `onInit` hook, and the host page drives the API.

---

## Metadata Reflection & Auto-Discovery

When `CheckoutSessionService.InitializeSession` runs, it inspects the target product's `ProductType`:

```
Product (SKU: 'CONF-2027')
   │
   └── ProductType ('Event')
          │
          └── OrderLineExtensionEntity ('MJ_BizApps_Orders: Event Order Lines')
                 │
                 ├── Foreign Key: PersonID ──► Auto-injects: First Name, Last Name, Email, Company, Title
                 ├── nvarchar(500): DietaryPreferences ──► Auto-injects: Textarea
                 ├── nvarchar(500): Allergies ───────────► Auto-injects: Textarea
                 ├── nvarchar(2000): Comments ───────────► Auto-injects: Textarea
                 └── bit: IsVIP (hypothetical; Event Order Lines has no bit column of its own) ──► Auto-injects: Checkbox
```

The diagram shows a few columns; discovery lists every column the rules below keep.

### Auto-Discovery Rules
1. **Person Identity Detection**: If the extension entity contains a `PersonID` field, standard contact inputs (`firstName`, `lastName`, `email`, `company`, `title`) are automatically populated.
2. **Type Mapping** (first match wins):
   - Fields with a value list ➔ `select`, with the list's values as `options` in their `Sequence` order (each value is both label and value).
   - `bit` ➔ `boolean` (checkbox)
   - `date` / `datetime` / `datetime2` / `datetimeoffset` / `smalldatetime` ➔ `date`
   - `int` / `bigint` / `smallint` / `tinyint` / `decimal` / `numeric` / `float` / `real` / `money` / `smallmoney` ➔ `number`
   - `ntext` / `text`, `nvarchar(max)` / `varchar(max)` (stored as `Length` -1), and strings longer than 255 characters (`EntityField.MaxLength`; `Length` is bytes) ➔ `textarea`
   - Any other string ➔ `text`
3. **Exclusions**: System audit fields (`__mj_CreatedAt`, `__mj_UpdatedAt`), primary keys (`ID`), parent `OrderLine` fields, `PersonID` (replaced by the contact inputs), `CheckInAt`, virtual fields and fields the API cannot update are excluded.
4. **Required**: a discovered field is required when its column is `NOT NULL` and has no default. A column with a default (Event Order Lines' `AttendanceStatus`, default `Registered`) is optional, since the database fills it.

---

## The `Configuration` JSONType & `customUI` Engine

Both `ProductType` and `CheckoutWidget` have a `Configuration` column holding JSON. The column is a plain string; the code parses it as the interfaces in [`packages/Entities/src/configuration-types.ts`](../packages/Entities/src/configuration-types.ts), which `@mj-biz-apps/orders-entities` exports. When `/initialize` resolves the widget's product, the product type's `unitMode`, `allowQuantity`, `maxQuantity` and `customUI` fill in whatever the widget leaves unset; on conflict the widget wins.

### Configuration Keys

`configuration-types.ts` is the source of truth; the table below lists its keys.

**`CheckoutWidgetConfiguration`** (a checkout widget's `Configuration`):

| Key | Meaning |
|---|---|
| `title` | Heading at the top of the widget (default "Checkout"). |
| `description` | Text under the heading. |
| `productId` | The product the widget sells. |
| `allowedProductIds` | Further products the widget may sell. A draft naming any other product is refused, and a widget with no product at all refuses every draft unless `allowAnyProduct` is true. Server-side only. |
| `allowAnyProduct` | Sells any product of the widget's company: an explicit open catalog, never the default. Requires the widget's `CompanyID`. Server-side only. |
| `productSku` | Finds the product by SKU when `productId` is not set. |
| `productName` | Name shown for the item; `/initialize` fills it from the product when unset. |
| `unitPrice` | Price per unit the widget displays. Unset or 0 shows the checkout as free, with no card form. The amount charged is the server's price. |
| `currency` | Currency of the payment. Unset means USD; a payment intent in any other currency is refused, because orders do not yet record one. |
| `unitMode` | `'perUnit'` collects details for each unit; `'perLine'` collects one set for the line. Booking splits by the product type's `unitMode` and the unit details sent, not by the widget's `unitMode`. When the product type is `'perUnit'`, a line that sends unit details must send one set per unit, so a `'perLine'` widget on a per-unit product is refused at quantity above 1 (see [Multi-Unit Discrete Expansion](#multi-unit-discrete-expansion-unitmode)). |
| `allowQuantity` | Shows the quantity selector. |
| `maxQuantity` | Highest quantity the selector offers (default 50). The server's cap comes from the product and product type instead. |
| `stripePublishableKey` | Stripe publishable key the widget mounts its card form with. |
| `autoRenewConsentText` | Wording of the automatic-renewal agreement. When set, the buyer must tick it, the server refuses to open a payment intent without that agreement, and the session records the text and the time. |
| `allowCoupons` | Shows a promotion-code field and lets the draft take a code. Otherwise codes are refused. |
| `successMessage` | Success-screen text in place of the default confirmation line. |
| `accessMessages` | `pending`, `ready` and `failed` texts for the success screen while access is provisioned after the confirm; shown only when a registered consumer gates access (see [Outbound events](outbound-events.md#access-status-on-the-checkouts-success-screen)). |
| `redirectUrl` | Where the public checkout sends the buyer once the order is confirmed, with `order=<order number>` appended. |
| `sendReceipt` | Asks the payment gateway to e-mail its own receipt to the buyer (Stripe `receipt_email`). Off by default. Server-side only. |
| `extensionEntityName` | The order-line extension entity; `/initialize` fills it from the product type when it discovers the fields. |
| `extensionFields` | Form fields for the extension entity (`name`, `label`, `type`, `required`, `placeholder`, `options`). Discovered from metadata when not authored (see [Metadata Reflection & Auto-Discovery](#metadata-reflection--auto-discovery)). |
| `questions` | Questions the buyer answers before paying (see [Questions at Checkout](#questions-at-checkout-questions)). |
| `choiceGroups` | "Choose N of these M options" groups (see [Choice Groups at Checkout](#choice-groups-at-checkout-choicegroups)). |
| `paymentProviderId` | The Payment Provider row that opens payment intents for this widget's sessions. Never taken from the client; required before a paid checkout can complete. Server-side only. |
| `tenderCode` | `PaymentType.Code` the payment is booked with (e.g. `CreditCard`, `ACH`). Server-side only; defaults to `CreditCard`. |
| `allowedOrigins` | Origins (scheme, host and port) allowed to embed and drive this widget through the checkout edge. Other browser origins are refused and get no CORS grant; MJAPI's own origin always passes. Unset or empty allows any origin. |
| `requireTurnstile` | Requires a Cloudflare Turnstile token on initialize and complete. Both built-in clients render the challenge; the edge also needs `Settings.TurnstileSecretEnvVar` and `Settings.TurnstileSiteKey`, and refuses both calls with a 503 when either is missing. See [Turnstile](#turnstile). |
| `memberDiscountResolver` | Registration key of the resolver that verifies a host's member token (see [Verified-member discount](#verified-member-discount)). Server-side only. |
| `customUI` | `js`, `css`, `theme` and `componentOverrideKey` (below). |

`/initialize` sends the browser only an allowlist of these keys (`PUBLIC_CONFIGURATION_KEYS` in `packages/CoreEntitiesServer/src/CheckoutSessionService.ts`); `allowedProductIds`, `allowAnyProduct`, `sendReceipt`, `paymentProviderId`, `tenderCode` and `memberDiscountResolver` stay on the server.

**`ProductTypeConfiguration`** (a product type's `Configuration`): `unitMode`, `allowQuantity`, `maxQuantity` and `customUI` are defaults for widgets that sell the type. At completion a `'perUnit'` type also splits a line into one line per set of unit details, and `maxQuantity` is the server's per-line cap when the product sets no `MaxQuantityPerLine`. `fieldOverrides` is declared, but nothing reads it yet.

**`customUI`**: `js` (lifecycle hooks, below), `css` (added as a style element), `theme` (`primaryColor`, `accentColor`, `borderRadius`, `fontFamily`, `backgroundColor`, `textColor`, applied as the CSS variables below) and `componentOverrideKey`, which the widget reads but nothing renders yet.

`ExtensionFieldDef`, the field type the Angular widget renders (it adds `defaultValue`), lives in [`packages/Angular/src/lib/checkout-widget/checkout-widget.component.ts`](../packages/Angular/src/lib/checkout-widget/checkout-widget.component.ts). `CheckoutWidgetConfig` in the same file extends the configuration with widget-only inputs (`theme`, `customCSS`, `customJS`, `isEvent`).

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

The widget calls whatever `window.MJCheckoutHooks` holds, so the host page's own script can set it too. `customUI.js` runs through `new Function`, which a Content-Security-Policy without `'unsafe-eval'` blocks. The public checkout page MJAPI serves has such a policy, so there `customUI.js` does not run and the widget shows a notice instead.

---

## Multi-Unit Discrete Expansion (`unitMode`)

Products represent different purchasing units:
- **`perLine`** (Default): A single line with `Quantity = N` (e.g. buying 10 boxes of pens).
- **`perUnit`**: Multi-unit purchases where **every single unit requires discrete registration data** (e.g. buying 3 conference tickets requires 3 attendee names and dietary choices).

### UI Behavior
When `unitMode === 'perUnit'` (or the Angular config sets `isEvent`) and the quantity is above 1:
- The form shows one card per unit, **Item 1** to **Item N**, under **Item Details (N)**.
- A **Copy Primary Info to All** button copies the first card's fields, except name and e-mail, into the others.

### Database Persistence
In `CheckoutSessionService.CompleteCheckout`:
- When the product type's `unitMode` is `'perUnit'` and the line carries unit details, it must carry one set per unit: a `Quantity` that differs from the number of sets is refused at `/draft` and `/complete` with a message asking for details for each item, rather than booked as a different number of units.
- A line is split into one `OrderLine` per set of unit details (`Quantity = 1` each) when it carries unit details and either its product type's `unitMode` is `'perUnit'` or it carries more than one set:
  - Line 1: `Quantity = 1`, `Description = "Jane Doe (jane@example.com)"` ➔ `EventOrderLine` (`PersonID` = Jane's Person, `DietaryPreferences = Vegan`)
  - Line 2: `Quantity = 1`, `Description = "John Smith (john@example.com)"` ➔ `EventOrderLine` (`PersonID` = John's Person, `DietaryPreferences = None`)
- All lines and companion records are saved atomically within the order transaction.

---

## Questions at Checkout (`questions`)

A widget can ask the buyer questions that are not columns on any entity, such as "How did you hear about us?". They are defined in the widget's `Configuration`:

```json
{
  "questions": [
    {
      "key": "source",
      "label": "How did you hear about us?",
      "type": "select",
      "options": ["Search", { "value": "referral", "label": "A colleague" }, "Other"],
      "required": true,
      "otherOptionKey": "Other"
    },
    { "key": "note", "label": "Anything we should know?", "type": "text", "maxLength": 500 }
  ]
}
```

- `type` is `select` or `text`. A `select` needs `options`; a bare string option is both value and label.
- `otherOptionKey` names the option that needs a free-text answer. Choosing it makes the text required.
- Answers are capped at 1000 characters, or `maxLength` when lower.
- A malformed list (duplicate keys, a select with no options, an `otherOptionKey` that is not an option) refuses the checkout instead of being skipped.

**Flow.** The widget renders the questions and keeps Pay disabled until required ones are answered. `/draft` stores the answers with the priced snapshot; it refuses an answer to a question the widget does not ask or a choice that is not an option, but accepts a missing required answer so the checkout can be priced first. `/payment-intent` and `/complete` check the stored answers in full against the widget's current questions and refuse a missing required answer, before a payment intent opens or a payer Person is created.

**Storage.** `CompleteCheckout` adds one `OrderCheckoutAnswer` row per answered question to the order's `CheckoutAnswers` collection before `Confirm()`, so the rows save in the booking transaction. Each row records `QuestionKey`, `QuestionLabel` (as the buyer saw it), `Answer` (a select's option value, or the text) and `OtherText`.

The shared check is `CheckCheckoutAnswers` in `@mj-biz-apps/orders-entities` (`checkout-questions.ts`), used by both the widget and the server.

---

## Choice Groups at Checkout (`choiceGroups`)

Some products require the buyer to choose from a fixed list, such as "choose exactly 2 of these 8 departments", and the choice decides what the buyer is entitled to. The groups are defined in the widget's `Configuration`:

```json
{
  "choiceGroups": [
    {
      "key": "department",
      "label": "Choose your departments",
      "options": [{ "value": "marketing", "label": "Marketing" }, { "value": "finance", "label": "Finance" }, "Operations"],
      "min": 2,
      "max": 2
    }
  ]
}
```

- `min` and `max` are whole numbers: `0 <= min <= max <= options`, and `max >= 1`. `min: 0` makes the group optional.
- A bare string option is both value and label. Keys and option values are at most 100 characters.
- A malformed list refuses the checkout instead of being skipped.
- A widget with choice groups sells a single line, and not an extension-type (IS-A) line such as an event line: `/draft` refuses either.

**Flow.** The widget renders each group as checkboxes. A group of one swaps the pick; a larger group stops at `max` and disables the rest. Pay stays disabled until every group has at least `min`. `/draft` stores the picks with the priced snapshot and refuses more than `max` or an option not in the list, but accepts fewer than `min`, so the checkout can be priced first. `/payment-intent` and `/complete` check the stored picks in full against the widget's current groups.

**Storage.** `CompleteCheckout` adds one `OrderLineChoice` row per pick to each line's `Choices` collection before `Confirm()`, so the rows save in the booking transaction. In `perUnit` mode every line gets the picks. Each row records `GroupKey`, `GroupLabel`, `OptionValue` and `OptionLabel`, with the labels as the buyer saw them.

**Entitlements.** A `ProductEntitlement` with `ChoiceGroupKey` and `ChoiceOptionValue` set is conditional: it is granted only on a line carrying that pick. One without them is granted on every line of its product, as before. To grant a code per department, add one conditional row per option, for example `ChoiceGroupKey = department`, `ChoiceOptionValue = marketing`, `Code = MARKETING-ACCESS`.

**Renewals.** `Orders.SpawnRenewals` copies the renewed line's picks onto the renewal line, so the conditional entitlements renew with them. Changing a pick after purchase is not supported.

The shared check is `CheckCheckoutChoices` in `@mj-biz-apps/orders-entities` (`checkout-choices.ts`), used by both the widget and the server.

---

## Zero-DB-Draft In-Memory Pricing & Atomic Booking

### Draft Phase
When a user adds items or inputs coupon codes:
- `CheckoutSessionService.UpdateDraft` constructs an in-memory `OrderHeaderEntity` graph.
- Executes `OrderPricingService` in memory to evaluate price tiers, volume breaks, and tax estimates.
- Returns the computed pricing to the client while storing the snapshot in `CheckoutSession.MetadataJSON`.
- **Zero draft rows are written to the `OrderHeader` database table.**

### Verified-member discount
A host can price members of a partner organisation without a typed code. The host page sets a signed
token on the element (`<mj-orders-checkout slug="…" member-token="…">`), the element sends it as
`memberToken` on `/draft`, and the widget's registered resolver verifies it server-side:

```typescript
@RegisterClass(BaseCheckoutMemberDiscountResolver, 'PARTNER-MEMBER')
export class PartnerMemberResolver extends BaseCheckoutMemberDiscountResolver {
    public async Resolve(ctx: CheckoutMemberDiscountContext): Promise<CheckoutMemberDiscountDecision> {
        const member = await verifyHostToken(ctx.MemberToken); // the host's own verification, including expiry
        // Bind the token to one buyer: a copied token is useless under another email.
        const sameBuyer = !!member && !!ctx.Email && member.email.toLowerCase() === ctx.Email.toLowerCase();
        return sameBuyer ? { PromotionCode: 'PARTNER-RATE' } : { PromotionCode: null, Message: 'Membership could not be confirmed.' };
    }

    // Names the codes this resolver hands out, so a buyer cannot type one instead.
    public override async IsMemberPromotionCode(ctx: CheckoutTypedPromotionCodeContext): Promise<boolean> {
        return ctx.Code.toUpperCase() === 'PARTNER-RATE';
    }
}
```

The widget names it with `Configuration.memberDiscountResolver: "PARTNER-MEMBER"` (server-side only).

The token sits in the host page, so anyone who copies it can replay it. Issue **short-lived** tokens
(minutes, not days) and tie each to the member's email, then have the resolver compare that email with
`ctx.Email`, the buyer email captured on the draft, as the sample does.

A member code is an ordinary promotion code, so a buyer who learns it could type it into a checkout that
takes codes and get the member price without a token. Before a typed code is priced, `/draft` asks every
registered resolver `IsMemberPromotionCode`, and refuses a code any of them claims, at every widget —
promotion codes are not scoped to one. A resolver that throws counts as claiming the code. The base class
claims **every** code, so a resolver that does not override it turns typed codes off at every checkout
until it names its own.

A member code and a typed code **do not stack** unless the host says so. When a buyer with a verified token
also types a code, the resolver's decision says which one is priced through `TypedCode`:

| `TypedCode` | Priced | The other code |
|---|---|---|
| `'Replace'` (default, and any value other than `'Yield'` or `'Stack'`) | the member code | the typed code comes back in `UnusablePromotionCodes`; the element shows why and stops, so the buyer can remove it |
| `'Yield'` | the typed code | the member code is set aside and `MemberDiscountMessage` says so |
| `'Stack'` | both, in one pricing pass | the promotions' own stacking settings decide whether both apply; a code the engine declines is reported as usual |

Under `'Replace'` and `'Yield'`, when the engine declines the winning code (dates, limits, qualifier), the
other one is priced instead, so a usable code is never dropped for a dead one. The snapshot keeps only the
code that was priced — `MemberPromotionCode` or `PromotionCodes`, both only under `'Stack'` — so
`/complete` charges what the draft quoted.

- The resolver returns a **promotion code**, priced through the ordinary promotion engine — dates, qualifiers and redemption limits apply as they do to any code.
- The session snapshot keeps only the resolved code (`MemberPromotionCode`); **the token is never stored**. `/complete` re-prices from the snapshot and carries the code on the order, so the booked total equals the charged total.
- A rejected token, a resolver that throws, or a code the engine declines prices at the standard rate and returns `MemberDiscountMessage`. The element stops once on that message before payment; submitting again pays the standard rate.
- A token sent to a widget with no `memberDiscountResolver`, or one naming an unregistered class, is refused.
- If the engine declines the code at `/complete` (the promotion ended or reached its redemption limit after the draft), the re-priced total exceeds the payment, so no order is booked. The buyer gets a plain message, and a checkout alert (log marker plus a Task when bizapps-tasks is installed) names the session and payment intent so staff can refund. Any settled payment that falls short of the re-priced total raises the same alert.

### Confirmation & Booking Phase
Once the buyer has paid (or pressed **Complete Free Registration** on a free checkout), `/complete` runs `CompleteCheckout`. Simplified from `CheckoutSessionService.ts`:
```typescript
// The payer Person has been found from the session's e-mail; a new buyer's is created after payment checks out.
const order = await md.GetEntityObject<OrderHeaderEntity>('MJ_BizApps_Orders: Order Headers', contextUser);
order.NewRecord();                        // Status defaults to 'Draft'
order.CompanyID = widget.CompanyID;
order.BillToPersonID = session.PersonID;
order.ShipToPersonID = session.PersonID;
order.Origin = 'Widget';
order.OrderType = 'Sale';
order.SourceCheckoutWidgetID = widget.ID;
order.OrderDate = TodayAsDateValue();

// Lines (one per unit where split), their extension rows, the checkout answers, the line choices and
// the promotion codes are added to the order's graph from the session snapshot. None of the order's
// rows is saved yet; each unit's attendee Person is found as its line is built.
// The lines are priced, and a paid order's payment intent is verified (see the note below).
// Only then are missing payer and attendee Persons created, so a refused payment leaves none behind.
// A new buyer is priced with no BillToPersonID, as the draft was: a Person created afterwards holds no
// price list, membership, exemption or order history that pricing could read.

order.BillToAddressID = billingAddressID; // the snapshot's billing location, recorded as an Address
order.ShipToAddressID = billingAddressID;

await order.Confirm(); // sets Status = 'Confirmed' and saves; throws with the reason when refused
```

After `Confirm()` commits, `CompleteCheckout` marks the session `Confirmed` with the order's id, books a paid order's payment against it through `CapturePayment`, and mints a GuestOrder claim, best-effort (see [Guest Record Claiming Workflow](#guest-record-claiming-workflow)).

> [!IMPORTANT]
> **Payment Verification Status**: Free/zero-dollar checkouts ($0) book and confirm immediately upon submission. For orders with `TotalGross > 0`, `CompleteCheckout` verifies the session's payment intent **state and amount** server-side — the intent must exist, be `Succeeded` (as set by the signature-verified payment webhook, or read from the gateway with the server's own key when the webhook has not arrived yet), and cover the freshly re-priced total. A session acquires its intent only through `CheckoutSessionService.OpenPaymentIntentForSession`, which prices from the session's own server-computed snapshot and resolves the provider from the widget's `Configuration.paymentProviderId` — the client never supplies an amount or a provider. `UpdateDraft` detaches the intent whenever the priced total changes, forcing a reopen at the new amount.

#### What Happens During `order.Confirm()`:
`Confirm()` (`packages/Entities/src/OrderHeaderEntity.ts`) sets the status and saves. The server subclass, `OrderEntityServer` in `@mj-biz-apps/orders-core-entities-server`, sees the first move into `Confirmed` and books in one database transaction:
1. Prices every line (bundles expanded, subscriptions decided, tax from the ship-to address).
2. Writes the header with its order number, `ConfirmedAt`, `ConfirmedByUserID` and address snapshots, then the lines with their extension rows and choices, and the checkout answers.
3. Creates, extends or reactivates the subscription for each subscription line, with the term the purchase bought.
4. Books one **journal entry** per line in BizApps Accounting (`Accounting.CreateJournalEntries`): debits Accounts Receivable (and Sales Discounts for a discount); credits Sales, or Deferred Revenue for revenue earned later, and each tax or charge to its own account. A line with nothing to book, such as a free item, gets no entry.
5. For deferred revenue, adds one forward-dated journal entry per recognition period (Deferred Revenue to Sales). Those entries are the recognition schedule; there is no separate schedule table.
6. Grants the order's entitlements and issues any gift cards.
7. Records outbound events for registered consumers: `OrderConfirmed` for a sale, and `GrantStatusChanged` for each grant created. They are sent after the commit (see [Outbound events](outbound-events.md)).

A failure at any step rolls the whole booking back. Payment is not checked inside `Confirm()`: `CompleteCheckout` verified it first.

---

## Pre-Purchase Checks

`UpdateDraft` refuses a purchase before pricing it when either check says no, and `OpenPaymentIntentForSession` runs both again before any money moves. A refused draft persists nothing.

1. **Built in.** The Person the e-mail resolves to already holds an `Active` or `Trialing` subscription (as its beneficiary) to a product on the draft. This applies whatever the subscription type's `ConcurrencyMode` says. A buyer the system does not know yet holds nothing, so the rule is skipped.
2. **Host.** Subclass `CheckoutPrePurchaseCheck` from `@mj-biz-apps/orders-core-entities-server` and register it. The highest-priority registration runs; with none, only the built-in rule applies.

```typescript
import { RegisterClass } from '@memberjunction/global';
import { ALREADY_SUBSCRIBED_REASON, CheckoutPrePurchaseCheck, type PrePurchaseContext, type PrePurchaseVerdict } from '@mj-biz-apps/orders-core-entities-server';

@RegisterClass(CheckoutPrePurchaseCheck)
export class HeldElsewhereCheck extends CheckoutPrePurchaseCheck {
    public override async Check(ctx: PrePurchaseContext): Promise<PrePurchaseVerdict> {
        // ctx: Email, PersonID (null for a new buyer), CompanyID, Lines, ContextUser
        const held = await lookUpInOtherSystem(ctx.Email, ctx.Lines);
        return held.length === 0
            ? { Allowed: true }
            : { Allowed: false, Message: 'You already subscribe to this.', Reason: ALREADY_SUBSCRIBED_REASON, ProductIDs: held };
    }
}
```

Reference the class from the server bootstrap so the decorator is not tree-shaken away. A check that throws, or a subscription lookup that fails, refuses the purchase with a generic message (`Refusal.Code = 'Unverified'`).

A refused response carries `Success: false`, the buyer's message in `ErrorMessage`, and:

```json
{ "Refusal": { "Code": "AlreadySubscribed", "Source": "built-in", "ProductIDs": ["79b4a2c1-..."] } }
```

`Code` is `AlreadySubscribed` (built in, or a host refusal with `Reason: 'already-subscribed'`), `HostRefused` (any other host refusal) or `Unverified`.

The widget shows the message. For `AlreadySubscribed` only, `<mj-orders-checkout>` also dispatches a `checkout-already-subscribed` DOM event. Its `detail` is `{ productIds, source }` and carries no e-mail or other personal data:

```javascript
document.querySelector('mj-orders-checkout')
    .addEventListener('checkout-already-subscribed', (e) => showManageSubscriptionLink(e.detail.productIds));
```

---

## Post-Payment Step Record, Review Queue and Replay

Each post-payment step of a paid checkout writes one `CheckoutSessionStep` row per session (`CheckoutStepLog.ts`):

| Step | Runs in | Failure leaves |
|---|---|---|
| `Confirm` | `CompleteCheckout`, once payment has checked out | the session `Open`; the buyer's next complete call retries it |
| `Capture` | `CompleteCheckout`, its replay, and the `payment_intent.succeeded` webhook | the order `Confirmed` and unpaid |

- Every attempt sets the row `Running`, adds one to `Attempts` and records its source (`Checkout`, `Webhook` or `Replay`). It then ends `Succeeded` or `Failed` with `LastError` and `Retryable`.
- Rows are written outside the step's own transaction, so a rolled-back `Confirm` still records its failure. A write that fails is logged; it never fails the step.
- The shared view **Checkouts: Needs Review** lists `Failed` rows, plus `Running` rows whose last attempt started more than 15 minutes ago (`STALE_RUNNING_MINUTES`).
- `Orders.ReplayCheckoutStep` (authorization `MJ.BizApps.Orders.Checkout.Replay`, held by the **Checkout Operator** role) re-drives one step:
  - a `Succeeded` step is a no-op;
  - a step still `Running` inside the stale window is refused;
  - `Capture` re-runs the same idempotent `CapturePayment` (`checkout-complete:${session.ID}`);
  - `Confirm` is not replayable here.
- The terminal-capture Task is raised on the first non-retryable failure only, not again on every replay of it.
- GuestOrder claim minting is not recorded as a step: it is best-effort, and a failure is logged without failing the booked order (see [Guest Record Claiming Workflow](#guest-record-claiming-workflow)).

## Guest Record Claiming Workflow

> [!NOTE]
> `CompleteCheckout` asks MJ's `IdentityClaimEngineServer.CreateClaim` (`@memberjunction/core-entities-server`) for a `GuestOrder` claim with `SendEmail: false`: claim e-mails stay off until a claim e-mail template and the portal base URL are configured, since without them MJ sends a generic message linking to its default host. `GuestOrderClaimDriver` and `EntitlementGrantClaimDriver` register against MJ's `BaseIdentityClaimDriver` (`@memberjunction/core-entities`). The host needs MJ's Identity Claim entities and the `GuestOrder` claim type; when minting fails, `CompleteCheckout` logs it and the order books without a claim.

When an unauthenticated guest completes an order:

```
1. Guest checks out as "jane@example.com"
   │
2. CheckoutSessionService creates:
   ├── OrderHeader (ORD-1000028)
   ├── Person ("Jane Doe", jane@example.com)
   └── GuestOrder IdentityClaim for jane@example.com
   │
3. The claim engine would e-mail Jane a claim link (off until a template and the portal
   base URL are configured):
   "Click here to claim your tickets: https://app.example.com/claim?token=..."
   │
4. Jane follows the link, or signs in to MemberJunction:
   └── IdentityClaimEngineServer validates the claim and runs GuestOrderClaimDriver, which
       ├── finds the Person whose e-mail matches Jane's login
       ├── sets the order's ship-to (and an empty bill-to) to that Person
       └── makes that Person the beneficiary of the order's entitlement grants
```

---

## Account Step After Payment (`CheckoutAccountStep`)

A host that needs the buyer to leave checkout with a login on its own identity provider registers a subclass of `CheckoutAccountStep` (`@mj-biz-apps/orders-core-entities-server`). The identity-provider code lives in the host; Orders calls it after the order is confirmed.

```typescript
@RegisterClass(CheckoutAccountStep)
export class MyAccountStep extends CheckoutAccountStep {
    public override async EnsureAccount(ctx: CheckoutAccountContext): Promise<CheckoutAccountResult> {
        // find or create the login for ctx.Email; never change an existing one
        // create it unable to sign in, and send a verification link to ctx.Email
        // 'NotApplicable' when this checkout is not one you make logins for (another company's widget)
        return { Outcome: 'Created' }; // or 'Exists' / 'Failed', with an optional buyer-facing Message
    }
    public override async SetPassword(ctx: CheckoutAccountContext & { Password: string }): Promise<CheckoutPasswordResult> {
        // set the password of the account EnsureAccount created; refuse any other
        return { Success: true }; // or { Success: false, Message: 'Use at least 10 characters.' }
    }
}
```

Reference the class from the server bootstrap so the decorator is not tree-shaken away. With nothing registered the step is off and checkout behaves as before.

**The host must verify the e-mail.** The checkout never proves the buyer owns the e-mail they typed. Anyone can check out with someone else's e-mail, for the price of the widget or for nothing on a free one, and set the password in the widget. So:
- An account answered `Created` must not be able to sign in until the host has verified the e-mail, for example with a link sent to it. The widget tells the buyer of every `Created` account to use that link before signing in. `CheckoutAccountResult.VerificationRequired` is deprecated and ignored.
- Until the e-mail is verified, do not link the new login to `ctx.PersonID`. That Person was matched by e-mail alone, and may be an existing member whose orders and memberships would come with the login.
- Never change an account the checkout did not create, in either method.

**Flow.**
1. `POST /checkout/complete` confirms the order and answers straight away, without calling the host. When a step is registered the response carries `AccountStep: true`.
2. The widget then calls `POST /checkout/account` with `{ sessionId, clientSessionKey }`, showing "Setting up your account…". Orders calls `EnsureAccount` with the buyer's e-mail, name, Person, order, company, session id and when the session began, and answers `Account: { Outcome, Message?, CanSetPassword, VerificationRequired }`, where `VerificationRequired` is true for every `Created` account. A step that throws, or doesn't answer within `HostTimeoutSeconds` (default 10), is reported as `Failed`. It never changes the confirmed order.
3. `Created`: the widget shows a password form with the verification note, and after the password is set tells the buyer to verify the e-mail before signing in. `POST /checkout/account/password` with `{ sessionId, clientSessionKey, password }` passes the password to `SetPassword`. The password is never stored or logged.
4. `Exists`: the widget shows the step's message, or a default telling the buyer to sign in.
5. `Failed`: the widget says the order is confirmed and offers "Try again", which calls `/checkout/account` again. "Not now" follows the redirect.
6. `NotApplicable`: the session has no account step. The response carries no `Account`, exactly as when no step is registered.

The widget's `redirectUrl` is followed once the step is settled, or when the buyer chooses "Not now". The widget remembers the completing session in `sessionStorage`, so a reload in the same tab after payment returns to an unsettled account step instead of starting a new checkout.

**Rules.**
- The outcome is recorded in the session's `MetadataJSON`. `Created`, `Exists` and `NotApplicable` are final; asking again returns them without calling the host. Only `Failed` is asked again.
- A call Orders gave up on may still finish at the host. When `EnsureAccount` finds an account it created earlier for the same `SessionID`, it should answer `Created`, not `Exists`.
- A password is accepted only for a confirmed session whose outcome is `Created`, with the session's client key, once, and within the step's `PasswordWindowMinutes` of the `Created` answer (default 5; override the getter to change it). After the window the buyer is told to reset the password with the host. A password the host refuses counts as an attempt; after 5 the form closes.
- Each attempt is recorded before the password is passed on. If the host's answer is lost, times out or can't be recorded, the form closes and no second password is accepted. Calls for one session run one at a time within a server process.
- A session confirmed only by a payment webhook, with no buyer returning to the widget, never runs the step.

**What a host that enables the step takes on.**
- **Scripts on the checkout page.** The password inputs render in the host page's DOM, and the client session key sits in `sessionStorage`, so any script on that page can read what the buyer types or call the password route. Keep third-party tags off the checkout page, or restrict them with a Content-Security-Policy.
- **Account enumeration.** `Exists` versus `Created` tells anyone who completes a checkout whether an e-mail has an account with the host.

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

That route returns a small, first-party HTML page (nonce-based CSP, no Explorer shell, no login) that talks only to the POST edge below (`initialize` → `draft` → `payment-intent` if required → `complete`; after the sale the element also calls `access-status`, and `account` and `account/password` when a host registered an account step). What the page contains depends on whether the element bundle was built:

- **Bundle built (the normal case):** the page loads the `<mj-orders-checkout>` Angular Element from `GET {MJAPI}/checkout/element/main.js` and renders `<mj-orders-checkout slug="…" api-root="/checkout">`. The buyer gets the full reusable widget — `customUI` theming and the introspected extension fields. MJAPI finds the bundle in `@mj-biz-apps/orders-ng`'s `dist/checkout-element` (`resolveCheckoutElementDir` in `CheckoutServerExtension.ts`).
- **Bundle not found:** the page falls back to a minimal vanilla form driven by an inline boot script, against the same POST edge.

Either way it is not an Explorer route. The element bundle itself is public static code, served to every origin, so a third-party site can load the same `main.js` and embed `<mj-orders-checkout>` directly (see *Embedding the checkout inside another widget* below).

The Angular `<mj-checkout-widget>` remains the embeddable control for sites that already host Angular. A wrapper route inside Explorer would require login and is the wrong guest surface.

When Orders is installed as an Open App (`dynamicPackages.server[]` includes `@mj-biz-apps/orders-server`), MJ auto-loads `OrdersCheckoutEdge` from the package's `MJ_SERVER_EXTENSIONS` export — the host `mj.config.cjs` does not need to copy the extension block. Host `serverExtensions[]` is still the override layer (`Enabled`, `RootPath`, `Settings` such as `ServiceUserEmail`).

### DOM events for the host page

`<mj-orders-checkout>` dispatches `CustomEvent`s that bubble and are `composed`, so a host page, Google Tag Manager or GA4 can listen on the element or on `document`:

| Event | When | `detail` |
|---|---|---|
| `checkout-state-change` | each change of state: `LOADING`, `CHECKOUT`, `PROCESSING`, `SUCCESS`, `PASSWORD`, `ERROR`. `PASSWORD` is sent while the account step's password form shows after a sale (after `SUCCESS`, or on a reload that returns to the form); `SUCCESS` follows once the password is set or skipped | `{ state }` |
| `checkout-complete` | the order is confirmed, before any `redirectUrl` is followed | `{ sessionId, productName, productId, amount, currency, coupon }` — `amount` is the order's total in major units; `currency` is the widget's `currency` upper-cased, or `null` when the widget sets none; `coupon` is the promotion code the draft applied, or `null` when none was |
| `checkout-error` | the checkout could not load, or a step failed | `{ message }` |
| `checkout-cancel` | the buyer pressed Cancel; the form has been reset to blank | `{}` |
| `checkout-close` | sent with `checkout-cancel`, for a container such as a modal to close itself | `{}` |
| `checkout-reset-refused` | a host's `checkout-reset` arrived while a payment was in flight or the account step was unsettled | `{ state }` |
| `checkout-access-state` | after the sale, each change in whether the buyer's access is ready, while the success screen polls `access-status` ([Outbound events](outbound-events.md#access-status-on-the-checkouts-success-screen)) | `{ state }`: `Ready`, `Pending` or `Failed` |

Cancel clears every field, the error banner and the card entry; the checkout session stays open, so the buyer can start again. It is ignored while a payment is in flight.

No detail carries the buyer's e-mail, name or any other personal data: the events reach every script on the host page. `productName` is the widget's `productName`, which `/initialize` fills from the product's name, or else its `title`.

```javascript
document.addEventListener('checkout-complete', (e) => {
    window.dataLayer?.push({ event: 'purchase', value: e.detail.amount, currency: e.detail.currency, coupon: e.detail.coupon });
});
```

### Embedding the checkout inside another widget

A host that opens the checkout inside its own panel (a chat or voice agent, say) can pass what it already knows and control the element:

```html
<mj-orders-checkout slug="annual-plan-voice" api-root="https://api.example.com/checkout"
    email="caller@example.com" source="voice_agent" source-ref="conv-8f2c"
    capture-cookies="visitor_id"></mj-orders-checkout>
```

- **`slug`** picks the distribution, and with it the widget and product. Give each channel its own distribution to tell sales apart by slug.
- **`email`** fills the e-mail field while it is empty; the buyer can still change it.
- **`source`** and **`source-ref`** say where the checkout came from. They are kept on the checkout session as `MetadataJSON.Attribution` `{ Source, Reference }`, and the session's `DraftOrderID` names the order once it confirms — so an outbound consumer handling `OrderConfirmed` can read them by order. The order confirms a moment before `DraftOrderID` is stamped, so a consumer that finds no session for the order should retry the lookup shortly after. `source` is letters, digits and `_ - . :` up to 50 characters, `source-ref` up to 200 printable characters; an attribution that cannot be read is dropped, never a reason to refuse the checkout. The browser supplies it and anyone can set it, so it is reporting data only: nothing that pays out, such as a commission, may rely on it unless the server can verify it.
- **`capture-cookies`** names first-party cookies on the host page (comma or space separated, at most 10) for the widget to send with each draft, for example a marketing tool's visitor cookie so an outbound consumer can tie the buyer to their earlier browsing. The widget also sends the page URL it is embedded on, with or without this attribute. Both are kept on the checkout session as `MetadataJSON.Tracking` `{ PageURL, Cookies }` and read by order the same way as the attribution. They are read at each draft, not when the element loads, because a tracker can set its cookie after that; a later draft's values replace an earlier one's, and a cookie a later draft lacks is kept. The page URL is `http(s)` up to 2000 characters; a cookie name is letters, digits and `_ . -` up to 64 characters, and its value up to 512 printable characters with no `;`. Anything that cannot be read is dropped, never a reason to refuse the checkout. Like the attribution, it comes from the browser and is reporting data only.
- **Reset:** dispatch `checkout-reset` on the element to return it to a blank form (no `checkout-cancel` / `checkout-close`, since the host started it). It is refused with `checkout-reset-refused` `{ state }` while a payment is in flight, and after a sale while the account step still waits on the buyer (a password form showing, or a failed step not yet dismissed). Every reset starts a new session, before a sale as well as after one, so nothing about the previous buyer carries into the next. The reset reads `email`, `source`, `source-ref` and `capture-cookies` again, so a host starting a new conversation sets them on the element first, then dispatches `checkout-reset`.

```javascript
const el = document.querySelector('mj-orders-checkout');
el.addEventListener('checkout-reset-refused', () => { /* keep the panel open */ });
el.dispatchEvent(new CustomEvent('checkout-reset'));
```

### 3. Headless & Custom Frontend Integration — the anonymous checkout edge

The app ships its own public REST edge: **`CheckoutServerExtension`** (`@mj-biz-apps/orders-server`, DriverClass `OrdersCheckoutEdge`), mounted pre-auth via Open App `MJ_SERVER_EXTENSIONS` (host `serverExtensions[]` overlays). Default root path `/checkout`:

1. `GET /checkout/:slug` — first-party HTML host page for the distribution (404 if the slug is reserved or not an Active distribution)
2. `POST /checkout/initialize` — body `{ slug, clientSessionKey, turnstileToken? }`
3. `POST /checkout/draft` — body `{ sessionId, clientSessionKey, email, lines, billingAddress, attribution?, tracking?, answers?, choices?, promotionCodes?, memberToken? }`
4. `POST /checkout/payment-intent` — body `{ sessionId, clientSessionKey, autoRenewConsent? }` → returns the gateway `ClientSecret` for Stripe.js confirmation
5. `POST /checkout/complete` — body `{ sessionId, clientSessionKey, turnstileToken? }` → the confirmation, with `AccountStep: true` when a host registered an account step
6. `POST /checkout/account` — body `{ sessionId, clientSessionKey }` → the account step's outcome (see [Account Step After Payment](#account-step-after-payment-checkoutaccountstep))
7. `POST /checkout/account/password` — body `{ sessionId, clientSessionKey, password }`
8. `POST /checkout/access-status` — body `{ sessionId, clientSessionKey }` → `State`: `Ready`, `Pending`, `Failed` or `NotTracked`, for a confirmed session only (see [Outbound events](outbound-events.md#access-status-on-the-checkouts-success-screen))

When the element bundle was built, the edge also serves it at `GET /checkout/element/main.js`.

The edge enforces, in order and fail-closed: a body-size cap, per-IP(+slug) fixed-window rate limiting (`access-status`, which the success screen polls, counts in a window of its own), the widget's `Configuration.allowedOrigins` allowlist (with CORS grants only for allowed origins), and — when the widget sets `requireTurnstile` — Cloudflare Turnstile verification against the secret named by the extension's `Settings.TurnstileSecretEnvVar`. Writes run as the principal named by `Settings.ServiceUserEmail`, falling back to MJ's system user. **No request body carries an amount, a price, a product resolution, or a payment provider** — those all resolve server-side.

#### Turnstile

A widget that sets `requireTurnstile` needs both edge settings: `TurnstileSecretEnvVar` (the env var holding the Turnstile secret) and `TurnstileSiteKey` (the public site key paired with that secret). The key is set once per edge, because Cloudflare accepts a token only under the secret of the site key that issued it.

The widget configuration reaches the browser only in the reply to `initialize`, so a client cannot know the site key before its first call. The edge tells it: an `initialize` or `complete` without a token, or with one Cloudflare refuses, answers 403 with `{ Success: false, ErrorMessage, TurnstileRequired: true, TurnstileSiteKey }`. `<mj-orders-checkout>` and the fallback page answer by rendering the challenge (invisible unless Cloudflare needs the buyer to interact) and retrying once with the token. A token works once and expires after five minutes, so they get a fresh one for every later `initialize` or `complete`. A custom front end follows the same handshake.

The checkout page MJAPI serves allows `https://challenges.cloudflare.com` in `script-src` and `frame-src`. A site that embeds `<mj-orders-checkout>` must allow the same in its own Content-Security-Policy, and its hostname must be on the site key's hostname list in Cloudflare.

---

## Server API & Service Reference

The server orchestration is implemented by `CheckoutSessionService` in `@mj-biz-apps/orders-core-entities-server` (exposed publicly by `CheckoutServerExtension` above; hosts may additionally wrap it in their own GraphQL or Remotable Operations). Every mutating call requires **both** the session id and the client session key, and enforces the session TTL.

### 1. `InitializeSession(slug, clientSessionKey)`
Initializes a new checkout session (or reuses the caller's open, unexpired one). The returned `Configuration` carries only an allowlist of keys (`PUBLIC_CONFIGURATION_KEYS` in `CheckoutSessionService.ts`); every other key stays on the server.

**Request Parameters:**
```json
{
  "slug": "summit-2027",
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
      { "name": "dietaryPreferences", "label": "Dietary Preferences", "type": "textarea", "required": false },
      { "name": "allergies", "label": "Allergies", "type": "textarea", "required": false }
    ],
    "customUI": {
      "theme": { "primaryColor": "#2563eb" }
    }
  }
}
```

The sample is abbreviated: the response also carries `ClientSessionKey`, `WidgetID`, `CompanyID`, `CustomCSS`, `CustomJS` and `ExpiresAt`, each discovered field has a `placeholder`, and `extensionFields` lists every column discovery keeps (see [Auto-Discovery Rules](#auto-discovery-rules)).

### 2. `UpdateDraft(sessionID, clientSessionKey, email, lines, billingAddress, contextUser?, options?)`
Recalculates draft pricing in memory and persists the priced snapshot to the session. `options.Answers` carries the buyer's answers to the widget's `questions` (see [Questions at Checkout](#questions-at-checkout-questions)); `options.Choices` carries their picks from its `choiceGroups` (see [Choice Groups at Checkout](#choice-groups-at-checkout-choicegroups)); `options.Attribution` carries the checkout's source; `options.Tracking` carries the embedding page URL and captured cookies; `options.PromotionCodes` carries codes the buyer typed, refused unless the widget sets `allowCoupons`; `options.MemberToken` applies a [verified-member discount](#verified-member-discount), and the response then carries `MemberDiscountApplied` and, when no discount applied, `MemberDiscountMessage`.

The billing location is required. `Country` is an ISO 3166-1 alpha-2 code; `StateProvince` is an ISO 3166-2 subdivision code without its country prefix (`IL`, not `US-IL`), required for US, CA and AU; `PostalCode` is required and shape-checked for those three. Free text such as `"Illinois"` is refused. The lists and the check live in `@mj-biz-apps/orders-entities` (`billing-location.ts`), shared by the widget's pickers and the server. Tax is priced from the location inline (nothing is saved for it at draft), and the result's `Tax` is the tax resolved; `TotalGross` includes it. Resolves (but never creates) the payer Person by email so person-specific pricing applies to drafts, and resolves it again when the email changes; runs the [pre-purchase checks](#pre-purchase-checks); detaches a previously opened payment intent when the total changes. Quantities are capped per line (`Product.MaxQuantityPerLine`, `ProductType.Configuration.maxQuantity`, or the server default of 100), and a checkout carries at most 50 lines.

**Request Parameters:**
```json
{
  "sessionId": "d1c080b0-379e-4b7f-a2e6-64156641e7d2",
  "clientSessionKey": "client-uuid-12345",
  "email": "janet@example.com",
  "billingAddress": { "Country": "US", "StateProvince": "IL", "PostalCode": "60601" },
  "lines": [
    {
      "ProductID": "79b4a2c1-...",
      "Quantity": 2,
      "Attendees": [
        { "FirstName": "Janet", "LastName": "Doer", "Email": "janet@example.com", "DietaryPreferences": "Gluten Free" },
        { "FirstName": "Sam", "LastName": "Chen", "Email": "sam@example.com", "DietaryPreferences": "Vegetarian" }
      ]
    }
  ],
  "answers": {
    "source": { "Value": "Other", "OtherText": "A podcast" }
  },
  "choices": {
    "department": ["marketing", "finance"]
  }
}
```

### 3. `OpenPaymentIntentForSession(sessionID, clientSessionKey)`
Refuses while a required question is unanswered. Opens (or idempotently re-opens) a payment intent for the session's **current server-priced total**. Refused when the session's snapshot holds no valid billing location. The currency is the widget's `Configuration.currency`, defaulting to USD; `OpenPaymentIntent` refuses any other currency, because orders do not yet record one. The amount comes from the session's own priced snapshot; the provider from the widget's `Configuration.paymentProviderId`. Returns the gateway `ClientSecret` (never persisted) for Stripe.js confirmation and stamps `session.PaymentIntentID`. Runs the [pre-purchase checks](#pre-purchase-checks) again against the drafted lines first. When the widget sets `autoRenewConsentText`, it is refused unless `options.AutoRenewConsent` is true (the edge's `autoRenewConsent`), and the session records the widget's text and the time of agreement.

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
Refuses while a required question is unanswered, before anything is written. Executes payer-Person resolution by the session's captured email, payment verification (intent `Succeeded` + amount covers the re-priced total), creation of any payer or attendee Person not found (only once payment checks out), line creation from the session's own snapshot (never fresh client input), companion extension hydration, the buyer's answers as Order Checkout Answers and picks as Order Line Choices, atomic lifecycle booking, booking a paid order's payment against it (`CapturePayment`), and a best-effort GuestOrder claim (see [Guest Record Claiming Workflow](#guest-record-claiming-workflow)). **Replay-safe**: calling it again on a `Confirmed` session returns the existing order rather than booking twice, and a failure after the order has committed never reverts the session to `Open`.

Once payment checks out, the snapshot's billing location is recorded as a Common `Address` (street and city empty), linked to the buyer as their `Billing` address, and set as the order's `BillToAddressID` and `ShipToAddressID` before `Confirm()`. The ship-to is what tax is resolved from. A session whose snapshot holds no valid location is refused and reverted to `Open`; an Address that cannot be saved fails the checkout, while a failed address-book link is logged and tolerated.

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
  "Status": "Confirmed"
}
```

> `ClaimToken` carries the GuestOrder `IdentityClaim` **row id**, and is absent when minting failed (see [Guest Record Claiming Workflow](#guest-record-claiming-workflow)). The verification token itself is never returned; it would travel only in the claim e-mail, which is off.
