# `@mj-biz-apps/orders-ng`

**Angular components for BizApps Orders** — the Orders application in MJ Explorer, its entity forms,
and the public checkout widget.

The rules for UI work here are in [`docs/ui-architecture.md`](../../docs/ui-architecture.md), and
they are binding: components bind to entities and remote operations directly, with no data-access
service layer.

## Layout of `src/lib/`

| Folder | What it holds |
|---|---|
| `generated/` | A CodeGen form per entity, driven by the same metadata that produces the entity classes, including field descriptions lifted from the migration's extended properties. Do not edit; see the Entities package README for the regeneration cycle. |
| `custom/` | Hand-written form components, one folder per entity. Four replace the generated form: `OrderHeader`, `PaymentHeader` and `EventOrderLine`, plus `Product` through `product-save-guard-form.component.ts`, each with `@RegisterClass` at an explicit priority; `custom-forms.module.ts` loads after the generated module. `Product/widgets/` holds the Product widgets the form panels mount. |
| `form-panels/` | Panels contributed to forms by entity (`@RegisterClassEx(BaseFormPanel, …)`), including the orders sections on bizapps-common's Person and Organization forms. |
| `sections/` | The four Explorer tabs (Orders, Payments, Receivables, Catalog) and the shell that gives each its left rail. Each registers under the `DriverClass` the Orders application's nav items name. |
| `pages/` | The screens inside those tabs, one folder per tab. |
| `panels/` | The shared panel library the screens are built from: worklist table, stat tile, money strip, status stepper, decomposition ladder and others. |
| `services/` | `MJOPricingScheduler`, which prices a draft as the user types, and save-error formatting. |
| `data/` | Entity names, the reads the list and detail screens make (`orders-queries.ts`), and grid view and column state. |
| `checkout-widget/` | The checkout widget and the public host page behind `GET /checkout/:slug`. |
| `styles/orders-kit.css` | This app's own component CSS, for classes MJ does not ship. The mockups import the same file. |

`src/public-api.ts` loads the forms, form panels and sections so their decorators fire, and exports
the rest. `LoadBizAppsOrdersClient()` is the `startupExport` that `mj-app.json` names for MJExplorer.

## Build

`pnpm run build` in this package, or the root build, runs:

1. `ngc`, then `tsc-alias -f`, compiling into `dist/`.
2. `build:styles` — copies `src/lib/styles/orders-kit.css` into `dist/lib/styles/`, because `ngc`
   compiles TypeScript only. Exported as `@mj-biz-apps/orders-ng/styles/orders-kit.css`.
3. `build:checkout-element` — `scripts/build-checkout-element.mjs` bundles the
   `<mj-orders-checkout>` Angular Element into `dist/checkout-element/main.js` with esbuild and the
   Angular linker, so the payment page needs no JIT and no `unsafe-eval`. Exported as
   `@mj-biz-apps/orders-ng/checkout-element`; the checkout edge serves it at
   `GET /checkout/element/main.js` for the `GET /checkout/:slug` page.

## When you build UI here

Three things this app's rules make non-optional:

**Refusals carry a reason, and it is worth showing.** Every guard returns a message written to be
read by a person — which price rules collided, which cap was exceeded, why no tax was charged. Do
not replace them with a generic error toast; they are the most useful thing the server produces.

**A zero is ambiguous and the reason disambiguates it.** Tax has four ways to be zero — untaxable,
no nexus, buyer exempt, no jurisdiction — recorded as a zero-amount `OrderLinePriceComponent`. A UI
that shows only the number is hiding the answer to the question the user is about to ask.

**Prices decompose.** `OrderLinePriceComponent` is a per-line trail: base, rules, adjustments,
charges, tax, each with a running total and a link to what produced it. Any "why is this £847.32?"
affordance should read that rather than recompute.

## Price through the engine, never beside it

`OrderPricingService` is the pricing walk `Save()` runs, and it lives in
`@mj-biz-apps/orders-entities`, so a screen can run it too. `MJOPricingScheduler` prices a draft in
the browser when it can, and sends the whole order to `Orders.PriceOrder` when a pricing plugin or a
promotion code is involved; neither path writes anything. `Orders.PreviewPrice` answers for one
product — its unit price and how it resolved — not for what an order comes to. Do not estimate
client-side with arithmetic of your own: a preview that diverges from the invoice is worse than no
preview, because people trust it.
