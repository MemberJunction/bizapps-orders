# `@mj-biz-apps/orders-server`

**The bootstrap.** Its job is to make sure every `@RegisterClass` decorator in this app has actually
fired before a request is served.

## Why it exists

MJ resolves entity subclasses and remotable operations through `ClassFactory` at runtime. A
decorator only registers when its module is **loaded**, and a bundler will happily tree-shake a
module nothing imports by name. The failure mode is quiet and expensive: `Metadata.GetEntityObject`
returns the *base* entity, `Save()` writes the row without running a single business rule, and the
order books with no journal entry.

So `LoadBizAppsOrdersServer()` in `src/index.ts`, the `startupExport` that `mj-app.json` names for
MJAPI's dynamic package loader, calls a `Load*` anchor for each registered server class. One is
missing: `ProductPriceEntityServer` has no anchor and registers only through the package's
side-effect import. An excerpt:

```ts
export function LoadBizAppsOrdersServer(): void {
    LoadOrderEntityServer();
    LoadRefundPaymentOperation();      // 'Orders.RefundPayment'
    LoadPriceOrderOperation();         // 'Orders.PriceOrder'
    LoadDefaultPriceResolver();        // the resolver the walk falls back to
    LoadTaxResolver();                 // the address → jurisdiction seam
    LoadStripePaymentProvider();       // a payment driver, keyed by provider type
    LoadGenerateInvoiceAction();       // 'Orders.GenerateInvoice'
    LoadPaymentWebhookExtension();     // POST /webhooks/payments/:providerId
    // …and the rest: entity subclasses, operations, payment drivers, actions,
    // delivery channels, identity-claim drivers and server extensions
}
```

Each anchor is an exported function that does nothing at runtime. Its only purpose is to be a name a
bundler cannot prove is unused. One call is not an anchor: `InitConcessionApprovalListener()`
subscribes to MJ events so a decision on a concession's approval task decides that concession.

**Adding a registered class? Add its anchor here.** Nothing will fail loudly if you forget — the base
class will be used instead, and the first symptom is a financial one.

The hand-authored actions live here, in `src/custom/`, rather than in `@mj-biz-apps/orders-actions`.
Most of them import `@mj-biz-apps/orders-core-entities-server`, and orders-actions is a `shared`
package that also ships to MJExplorer, where a server dependency breaks the browser build. Each has
its anchor in `LoadBizAppsOrdersServer()` and its `Action` row in `metadata/actions/`.

## Also here

- `config.ts` — exports `mj_core_schema = '__mj'`. Its comment says CodeGen's resolvers import it;
  nothing in `src/` does today.
- `src/generated/` — CodeGen's GraphQL resolvers. Do not edit; see the Entities package README.
- `MJ_SERVER_EXTENSIONS` — declarations for the payment and Bill.com webhooks and the checkout
  edge. MJ bootstrap collects this (or `package.json` `memberjunction.serverExtensions`) from hosts
  that list this package in `dynamicPackages.server[]`. Host `mj.config.cjs` `serverExtensions[]`
  overlays by DriverClass.
- `GET /checkout/:slug` — public HTML host for a distribution; POSTs stay on the same edge.
  Pre-auth. Host `serverExtensions[]` can set `Enabled: false` to suppress. Settings:
  `TrustedProxyHops` (default 0 — ignore `X-Forwarded-For`; set to the number of reverse
  proxies that append to it), `RateLimitMax` / `RateLimitMaxGlobal`.

## Verifying registration

The integration suite is the real check: it resolves entities through the same `ClassFactory` a
request does, so a missing anchor shows up as a rule not running. If a check fails in a way that
looks like "the guard didn't fire", suspect a missing anchor before suspecting the guard.
