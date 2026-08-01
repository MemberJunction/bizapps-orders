/**
 * `@mj-biz-apps/orders-ng-widgets` — reusable orders UI, layers 1 and 2.
 *
 * Framework-clean Angular. Nothing in here imports `@angular/router`,
 * `@memberjunction/ng-shared`, or any MJ Explorer package — which is what lets the same order
 * editor render inside an Explorer section tab, inside the Order entity form, inside a standalone
 * Angular app, or inside a test, without a fork.
 *
 * The boundary is enforced by `npm run check:ui-layers` (this package declares
 * `"mjUILayer": "widgets"`) and by `src/__tests__/widget-layer-purity.test.ts` — not by intent.
 *
 * Layering rules and the Before/After event contract: the MJ repo's
 * `guides/UI_LAYERING_GUIDE.md`, and `docs/UI_LAYERING.md` in this repo for how they apply here.
 *
 * Exports only what this package defines (rule 5 — no re-exports from other packages).
 */

/** Layer 1 — the panel vocabulary every screen is assembled from. */
export * from './lib/panels';
export * from './lib/panels/confirm-preflight.component';
export * from './lib/panels/worklist-table.component';
export * from './lib/panels/stat-tile.component';
export * from './lib/panels/summary-strip.component';
export * from './lib/panels/day-bars.component';
export * from './lib/panels/allocation-grid.component';
export * from './lib/panels/allocation-math';

/** The seam between a draft and the engine. */
export * from './lib/services/order-entry.service';
export * from './lib/services/orders-data.service';

/** Layer 2 — record composites, bindable from an entity form or any other surface. */
export * from './lib/composites/order-summary.component';

/** Layer 2 — the screen composites. Each takes props, emits intent, and never navigates. */
export * from './lib/pages/orders/fast-entry.page';
export * from './lib/pages/orders/order-editor.page';
export * from './lib/pages/orders/orders-list.page';
export * from './lib/pages/orders/orders-dashboard.page';
export * from './lib/pages/orders/fulfillment.page';
export * from './lib/pages/orders/order-document.page';
export * from './lib/pages/orders/return.page';
export * from './lib/pages/payments/payment-entry.page';
export * from './lib/pages/payments/payments-list.page';
export * from './lib/pages/payments/payments-dashboard.page';
export * from './lib/pages/payments/refund.page';
export * from './lib/pages/payments/account-credit.page';
export * from './lib/pages/receivables/overdue.page';
export * from './lib/pages/receivables/customer-ar.page';
export * from './lib/pages/receivables/subscriptions.page';
export * from './lib/pages/catalog/products.page';
export * from './lib/pages/catalog/pricing.page';
