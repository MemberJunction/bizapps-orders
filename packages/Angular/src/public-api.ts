/**
 * BizApps Orders Angular Bootstrap
 *
 * Client-side bootstrap package for the BizApps Orders Open App. Imports the
 * entity classes, the generated form components and this app's Explorer sections
 * so @RegisterClass decorators fire and the components are available to MJ's
 * class factory.
 */

// Import entity package to trigger @RegisterClass decorators for entity subclasses
import '@mj-biz-apps/orders-entities';

// Import generated form components (triggers @RegisterClass for form components)
import './lib/generated/generated-forms.module';

// Import custom form components (loaded AFTER generated to override via @RegisterClass priority)
import './lib/custom/custom-forms.module';
import { LoadCustomForms } from './lib/custom/custom-forms.module';

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';

/**
 * The four Explorer sections. Importing them here is what makes the app's
 * navigation work: the Orders Application's `DefaultNavItems` name a `DriverClass`
 * per tab, Explorer asks the class factory for it, and the factory only knows a
 * class whose `@RegisterClass` decorator has actually run — which means the module
 * has to be in the bundle. A tree-shaken section is a blank tab.
 */
import {
    CatalogSectionResource,
    OrdersSectionResource,
    PaymentsSectionResource,
    ReceivablesSectionResource,
} from './lib/sections/orders-sections.component';

// Re-export for consumers
export { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';
export { GeneratedFormsModule } from './lib/generated/generated-forms.module';
export { CustomFormsModule } from './lib/custom/custom-forms.module';
export { BizAppsProductFormComponent } from './lib/custom/Product/product-form.component';

/** Explorer sections — the four top-level tabs of the Orders application. */
export {
    MJOSectionBaseComponent,
    OrdersSectionResource,
    PaymentsSectionResource,
    ReceivablesSectionResource,
    CatalogSectionResource,
} from './lib/sections/orders-sections.component';

/** The section frame, reusable by any surface that wants a rail over sub-pages. */
export { MJOSectionShellComponent } from './lib/sections/section-shell.component';

/** The panel library — the shared vocabulary every screen is assembled from. */
export * from './lib/panels';
export * from './lib/panels/worklist-table.component';
export * from './lib/panels/stat-tile.component';
export * from './lib/panels/summary-strip.component';
export * from './lib/panels/day-bars.component';
export * from './lib/panels/allocation-grid.component';
export * from './lib/panels/allocation-math';

/** The seam between a draft and the engine. */
export * from './lib/services/pricing-scheduler.service';
export * from './lib/data/entity-names';
export * from './lib/data/orders-queries';

/** Screens. */
export * from './lib/pages/orders/fast-entry.page';
export * from './lib/pages/orders/order-editor.page';
export * from './lib/pages/orders/order-workspace.page';
export * from './lib/pages/orders/orders-list.page';
export * from './lib/pages/orders/orders-dashboard.page';
export * from './lib/pages/orders/fulfillment.page';
export * from './lib/pages/orders/order-document.page';
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
export * from './lib/pages/orders/return.page';

/** The information architecture, as data — testable, and injectable for badges. */
export {
    BuildLeftNavSections,
    ORDERS_SUB_PAGES,
    PAYMENTS_SUB_PAGES,
    RECEIVABLES_SUB_PAGES,
    CATALOG_SUB_PAGES,
} from './lib/sections/section-nav.model';
export type { OrdersSubPage, OrdersNavBadges } from './lib/sections/section-nav.model';

/**
 * Bootstrap function called during MJExplorer initialization. The static imports
 * above handle registration; this is the startupExport entry point.
 *
 * The section classes are referenced rather than merely imported: a bundler that
 * sees an unused import is entitled to drop the module, and dropping it would
 * silently un-register the tabs.
 */
export function LoadBizAppsOrdersClient(): void {
    void [OrdersSectionResource, PaymentsSectionResource, ReceivablesSectionResource, CatalogSectionResource];
    void CLASS_REGISTRATIONS;
    LoadCustomForms();
}
