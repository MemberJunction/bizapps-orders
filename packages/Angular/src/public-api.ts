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

// Import generated class registrations manifest
import { CLASS_REGISTRATIONS } from './lib/generated/class-registrations-manifest';

// Custom form PANELS. Imported after the generated forms so their registrations are live when a
// generated form's <mj-form-panel-slot> hosts go looking for them.
import { OrdersCustomFormsModule, LoadOrdersCustomForms } from './lib/custom/custom-forms.module';

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

/**
 * The panel vocabulary, the data seam and the screen composites now live in
 * `@mj-biz-apps/orders-ng-widgets` (UI layers 1 + 2). They are NOT re-exported from here —
 * consumers import from the package that defines them (rule 5). Splitting them out is what makes
 * the boundary real: this package depends on `@memberjunction/ng-shared` for
 * `BaseResourceComponent`, and anything sharing a package with that dependency can reach it.
 */

/** Custom form panels — mounted into the GENERATED forms via <mj-form-panel-slot>. */
export { OrdersCustomFormsModule } from './lib/custom/custom-forms.module';
export { OrderSummaryPanel } from './lib/custom/panels/order-summary.panel';

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
    LoadOrdersCustomForms();
}
