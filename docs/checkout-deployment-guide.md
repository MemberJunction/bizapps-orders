# Checkout Deployment Guide — what the HOST wires, and how

The orders repo ships the checkout **engine**: `CheckoutSessionService`, the anonymous REST edge
(`CheckoutServerExtension`), the presentational Angular widget, the payment/webhook machinery, and
the identity-claim drivers. It deliberately does **not** ship the host-side glue — the pieces that
depend on a concrete deployment (its domains, its Stripe account, its email provider, its portal).
This guide is the complete list of what a deployment (the Blue Cypress AIDP first) must wire, in
dependency order. If checkout "doesn't work" in a host, walk this list before reading code.

> Scope note (AIDP program): this is the WS-1 "host wiring" lane that was explicitly left to AIDP
> deployment in the unified-transactions plan — documented here, built there.

---

## 1. Server configuration (`mj.config.cjs` in the HOST)

Both server extensions mount through MJServer's `serverExtensions[]`, **before** the auth
middleware. The orders repo's own `mj.config.cjs` carries the reference entries; a host copies and
adapts them:

```js
serverExtensions: [
  { Enabled: true, DriverClass: 'OrdersPaymentWebhook', RootPath: '/webhooks/payments', Settings: {} },
  {
    Enabled: true,
    DriverClass: 'OrdersCheckoutEdge',
    RootPath: '/checkout',
    Settings: {
      ServiceUserEmail: 'checkout-service@yourdomain.com',   // strongly recommended — see §2
      TurnstileSecretEnvVar: 'CHECKOUT_TURNSTILE_SECRET',    // only if any widget sets requireTurnstile
      RateLimitWindowMs: 60000,                              // optional; defaults shown
      RateLimitMax: 30,
    },
  },
],
```

The host's server bootstrap must load `@mj-biz-apps/orders-server` (`startupExport:
LoadBizAppsOrdersServer` via `mj-app.json` / dynamic packages) — that is what registers the
extension classes, the payment drivers, and the identity-claim drivers with the ClassFactory.
If the extension loader logs "nothing registered for DriverClass", the bootstrap didn't run.

## 2. The checkout service principal

Checkout writes (sessions, orders, Person rows, claims) run as the user named by
`Settings.ServiceUserEmail`. Without it, the edge falls back to **MJ's system user** and logs a
warning — acceptable for a dev box, not for production (you lose "who wrote this" and the ability
to scope permissions).

Create a dedicated MJ user (e.g. `checkout-service@…`) and grant it, at minimum:
- **Create/Read/Update** on the `__mj_BizAppsOrders` checkout + order entities
  (Checkout Sessions, Order Headers, Order Lines + extension entities, Payment Intents,
  Entitlement Grants)
- **Create/Read** on `MJ_BizApps_Common: People`
- **Create** on `MJ: Identity Claims` (the GuestOrder claim mint)

Author the role + entity permissions as metadata in the host (MJ's `guides/MAGIC_LINK_GUIDE.md`
shows the restricted-role recipe shape), not by hand in the DB.

## 3. Environment variables

| Variable | Consumed by | Purpose |
|---|---|---|
| `PORTAL_BASE_URL` | MJ core `IdentityClaimEngineServer` | Base of the claim emails' `/claims/redeem?id=..&token=..` links — point it at the Explorer origin |
| `CLAIM_FROM_EMAIL` (fallback `NOTIFICATION_FROM_EMAIL`) | MJ core | From-address of claim emails |
| `CLAIM_EMAIL_PROVIDER` | MJ core | MJ Communications provider name for claim emails (default `SendGrid`) — that provider must be configured in the host |
| `<CREDENTIALSREF>_API_KEY`, `<CREDENTIALSREF>_WEBHOOK_SECRET` | `EnvironmentSecretResolver` | Payment gateway secrets; the prefix is the `PaymentProvider.CredentialsRef` uppercased with non-alphanumerics replaced by `_` |
| `CHECKOUT_TURNSTILE_SECRET` (or whatever `TurnstileSecretEnvVar` names) | `CheckoutServerExtension` | Cloudflare Turnstile server secret — required the moment any widget sets `requireTurnstile` (the edge fails closed with a 503 otherwise) |

## 4. Payment provider rows + gateway webhook

Per selling company: a `PaymentProvider` row (type Stripe/StripeACH/…, `IsLiveMode` per row — live
and test rows coexist), with `CredentialsRef` pointing at the env-var prefix above. Then register
the gateway webhook at Stripe:

```
https://<api-host>/webhooks/payments/<PaymentProviderID>
```

One endpoint per provider row is deliberate — the path tells the handler which secret verifies the
signature before a byte of payload is parsed. Async-settling methods (ACH, 3DS) **require** the
webhook: the intent only reaches `Succeeded` through it, and completion is gated on that status.

## 5. Widget + distribution metadata (what sells)

A `CheckoutWidget` row (Status `Active`) with `Configuration` JSON — the admin-authored,
server-resolved knobs (typed in `packages/Entities/src/configuration-types.ts`,
`CheckoutWidgetConfiguration`):

| Key | Required? | Notes |
|---|---|---|
| `productId` (or `productSku`) | yes | What the widget sells; drives extension-field auto-discovery |
| `paymentProviderId` | for paid checkout | The `PaymentProvider` row used by `OpenPaymentIntentForSession`. Never client-supplied |
| `currency` | recommended | Display + intent currency code |
| `allowedOrigins` | for embeds | Origins allowed to drive this widget through the edge; requests from others get 403 and no CORS grant. Unset = any origin (the slug is the access control) |
| `requireTurnstile` | public internet | Demands a Turnstile token on initialize/complete |
| `stripePublishableKey` | paid checkout | Shipped to the browser (publishable by definition) for Stripe.js |
| `unitMode`, `maxQuantity`, `extensionFields`, `customUI`, `successMessage`, `redirectUrl` | optional | UX shaping. `successMessage`/`redirectUrl` render once the host sets the widget's `[completed]` input |
| `receiptEmail`, `receiptTemplateName` | optional | Buyer receipt after completion (default ON when an email was captured; template defaults to `'Orders: Standard Invoice'`). Needs the host's email provider configured — failures are logged, never checkout failures |
| `magicLink` (`applicationName`, `roleName`, `expiresInDays`, `maxUses`, `issuerRoleNames`) | optional | When set, creating a **distribution** mints a multi-use anonymous magic-link invite scoped to that app + restricted role, revoked with the distribution. Omit for slug-only distributions |

Plus a `CheckoutWidgetDistribution` row: unique `Slug`, Status `Active`. Revocation = flip Status
to `Revoked` (the edge and `InitializeSession` refuse inactive distributions).

Secret-shaped `Configuration` keys (`*secret*`, `*password*`, `*credential*`, `*apikey*`) are
stripped before the config ships to an anonymous caller — but don't put secrets there anyway.

## 6. The browser glue (the host-owned lane)

The Angular widget (`<mj-checkout-widget>` in `@mj-biz-apps/orders-ng`) is **purely
presentational**: config in, `(submitted)`/`(cancelled)` events out. The host owns the network
choreography against the REST edge:

```
1. On load:            POST {edge}/checkout/initialize   { slug, clientSessionKey }
                       → feed result.Configuration into [config]; keep SessionID + the key
2. On any line change: POST {edge}/checkout/draft        { sessionId, clientSessionKey, email, lines,
                                                           promotionCodes? }
                       → show TotalGross / RequiresPayment; surface result.UnusableCodes to the
                         buyer (a typed code that did nothing must say why). Codes are opaque
                         strings (≤10, ≤60 chars each) — the server validates and re-applies them
                         at completion from its own snapshot.
3. Paid orders:        POST {edge}/checkout/payment-intent { sessionId, clientSessionKey }
                       → stripe.confirmPayment / confirmCardPayment with result.ClientSecret
                         (Stripe.js, using Configuration.stripePublishableKey)
4. On submit:          POST {edge}/checkout/complete     { sessionId, clientSessionKey, turnstileToken? }
                       → set [completed]="true" on the widget: it renders
                         Configuration.successMessage and honors Configuration.redirectUrl.
                         A "Payment has not settled" refusal means the webhook hasn't advanced
                         the intent yet — retry with backoff, don't error the buyer: the webhook
                         itself now completes the session once the intent settles
                         (CompleteCheckoutForSettledIntent), so an abandoned tab still books.
```

Rules for the glue:
- **Mint `clientSessionKey` client-side** (`crypto.randomUUID()`) and persist it per visitor
  (localStorage is appropriate here — it's anonymous visitor state, not a user preference). It is
  half the session credential: every mutating call needs `sessionId` **and** the key.
- **Never send prices, amounts, or provider ids** from the browser. The edge ignores anything
  money-shaped by construction; a host that starts passing them is building the bug the
  architecture exists to prevent.
- Handle `409`/replay on complete idempotently — a `Confirmed` session returns the same `OrderID`.

### Custom-element build (embed on non-Angular sites)

The widget is a standalone Angular component; a deployment that wants a `<script>`-tag embed wraps
it with `@angular/elements` in a tiny host app it builds and serves itself:

```ts
// checkout-element/main.ts (in the HOST's build, not in this repo)
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { CheckoutWidgetComponent } from '@mj-biz-apps/orders-ng';

createApplication().then((app) => {
  customElements.define('mj-checkout',
    createCustomElement(CheckoutWidgetComponent, { injector: app.injector }));
});
```

Bundle that entry (esbuild/ng build, single self-contained JS + the widget CSS), serve it from the
checkout domain, and keep the REST-glue script alongside it. The element build is a **deployment
artifact** — pin it to the `@mj-biz-apps/orders-ng` version you deploy.

## 7. Claims + portal

- `PORTAL_BASE_URL` must point at an Explorer deployment that includes the `/claims/redeem` route
  (MJ core, `explorer-core` ≥ the release carrying MemberJunction/MJ#4047).
- The orders claim types (`GuestOrder`, `PersonAccountLink`) seed via
  `mj sync push --dir metadata` in the host — a claim type's metadata row lives with the repo that
  ships its driver.
- Claim-on-login is automatic (MJ core wires it at token validation); no host work beyond having
  the email provider configured so claim emails actually send.

## 7.5 Entitlement provisioning (WS-2 — when products push access downstream)

When a sold entitlement must reach an outside system (an LXP enrollment, a license server), the
host wires the provisioning framework:

1. **Ship the driver with the deployment.** Subclass `BaseEntitlementProvisioningDriver`
   (`@mj-biz-apps/orders-core-entities-server`), register it with
   `@RegisterClass(BaseEntitlementProvisioningDriver, '<YourKey>')`, and call its `Load*` anchor
   from the host bootstrap. Drivers must be idempotent (delivery is at-least-once; recognize your
   own work via `ExternalRef`). The orders engine ships only `Orders.NoOpProvisioning`.
2. **Seed an `EntitlementProvisioningTarget` row** (metadata, like
   `metadata/entitlement-provisioning-targets/` in the orders repo) whose `DriverClass` is your
   registration key; put endpoints/tenant ids in `Configuration` — **secrets stay in env vars the
   driver resolves itself**.
3. **Point `ProductEntitlement.ProvisioningTargetID`** at the target for each entitlement that
   needs the push. NULL means self-contained (nothing pushed).
4. **Enable the reconcile sweep** after one clean manual run of the
   `Reconcile Entitlement Provisioning` action: flip the `Orders: Reconcile Entitlement
   Provisioning` scheduled job (ships `Disabled`) to `Active`. It re-drives anything the
   post-commit push missed, with backoff and a bounded attempt ceiling; grants past the ceiling
   report as `Exhausted` and need a human.
5. **Watch `EntitlementProvisioningEvent`** — one append-only row per attempt is the audit trail.

## 8. Go-live checklist

- [ ] `OrdersCheckoutEdge` enabled with `ServiceUserEmail` set to a real, permission-scoped user
- [ ] `allowedOrigins` set on every widget that will be embedded cross-origin
- [ ] `requireTurnstile` on for anything reachable from the public internet + secret configured
- [ ] Rate limits sized for expected traffic (defaults: 30/min/IP)
- [ ] Payment provider rows per company with live-mode credentials; Stripe webhook registered and
      signature-verified end to end (send a test event)
- [ ] Claim email provider sending; `PORTAL_BASE_URL` resolving to Explorer; a test claim redeems
- [ ] The recorded dry run from the program plan: buy → order books → JEs balance → grants created
      → claim email → redeem — in Stripe test mode, then repeated live
- [ ] `serve_checkout_demo.mjs` is NOT deployed anywhere (labeled scratch harness; it violates the
      pricing-input rule by design of its age)

## 9. CustomJS caution

`CheckoutWidget.CustomJS` executes in the embedding page (`new Function` over a DB column). Treat
widget `Configuration`/`CustomJS` authorship as **privileged**: whoever can edit widget rows can run
script in every page that embeds that widget. Scope entity permissions on
`MJ_BizApps_Orders: Checkout Widgets` accordingly, and set a CSP on embedding pages that you have
verified against the widget's needs.
