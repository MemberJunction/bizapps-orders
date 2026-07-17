import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageHeaderComponent,
  MJPageBodyComponent,
  MJPageHeaderInteriorComponent,
  MJPageBodyInteriorComponent,
  MJLeftNavComponent,
  MJLeftNavContentComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJEmptyStateComponent,
  MjSlidePanelComponent,
  MJAlertComponent,
} from '@memberjunction/ng-ui-components';

// Shared with accounting (dependency direction: common -> accounting -> orders). The scope chip,
// the "not built yet" page and the workspace-tab strip are the SAME components both apps use —
// imported, never re-implemented.
import {
  CompanyScopeChipComponent,
  ShellPagePendingComponent,
  WorkspaceTabStripComponent,
  CustomerARBaseComponent,
  GlResolutionPreviewComponent,
} from '@mj-biz-apps/accounting-ng';

// The categories HOST these existing dashboards so swapping the app nav to the §13 shape costs no
// working screen. Each is replaced by its purpose-built §13 page as the wave reaches it.
import { OrderHistoryModule } from '../OrderHistory/order-history.module';
import { OrdersManagementModule } from '../OrdersManagement/orders-management.module';
import { OrdersConsoleModule } from '../OrdersConsole/orders-console.module';
import { ProductCatalogModule } from '../ProductCatalog/product-catalog.module';
import { ProductCategoryTreeModule } from '../ProductCategoryTree/product-category-tree.module';

import { OrderEditorPageComponent } from './pages/order-editor.page';
import { AllOrdersPageComponent } from './pages/all-orders.page';
import { StatusBoardPageComponent } from './pages/status-board.page';
import { OrderDetailPanelComponent } from './pages/order-detail-panel.component';
import { PaymentEntryPageComponent } from './pages/payment-entry.page';
import { PaymentCapturePageComponent } from './pages/payment-capture.page';
import { CustomerARPageComponent } from './pages/customer-ar.page';
import { CatalogPageComponent } from './pages/catalog.page';
import { FulfillmentQueuePageComponent } from './pages/fulfillment-queue.page';
import { RefundsPageComponent } from './pages/refunds.page';
import { PaymentMethodsPageComponent } from './pages/payment-methods.page';
import { SubscriptionsPageComponent } from './pages/subscriptions.page';
import { OrdersDashboardPageComponent } from './pages/orders-dashboard.page';
import { PaymentsDashboardPageComponent } from './pages/payments-dashboard.page';
import { CategoriesPageComponent } from './pages/categories.page';
import { ProductWorkshopPageComponent } from './pages/product-workshop.page';
import { ProductTypesPageComponent } from './pages/product-types.page';
import { PaymentTermsTypesPageComponent } from './pages/payment-terms-types.page';
import { PaymentProvidersPageComponent } from './pages/payment-providers.page';
import { SubscriptionPlansPageComponent } from './pages/subscription-plans.page';
import { PricingPageComponent } from './pages/pricing.page';
import { GLMappingPageComponent } from './pages/gl-mapping.page';
import { OverdueWorklistPageComponent } from './pages/overdue-worklist.page';
import { AllPaymentsPageComponent } from './pages/all-payments.page';
import { OrdersCategoryComponent } from './orders-category.component';
import { OrdersCategoryResourceComponent } from './orders-category-resource.component';
import { PaymentsCategoryComponent } from './payments-category.component';
import { PaymentsCategoryResourceComponent } from './payments-category-resource.component';
import { ProductsCategoryComponent } from './products-category.component';
import { ProductsCategoryResourceComponent } from './products-category-resource.component';
import { OrdersReportsCategoryComponent } from './reports-category.component';
import { OrdersReportsCategoryResourceComponent } from './reports-category-resource.component';

/**
 * The orders app shell (UI plan §13.0): the four category shells + their pages.
 *
 * NgModule-declared to match this package's existing pattern (mirrors the OrdersConsole /
 * ProductCatalog modules). The standalone pieces — MJ's chrome and accounting's shared shell
 * components — are imported, not declared.
 */
@NgModule({
  declarations: [
    OrderEditorPageComponent,
    FulfillmentQueuePageComponent,
    RefundsPageComponent,
    PaymentMethodsPageComponent,
    SubscriptionsPageComponent,
    OrdersDashboardPageComponent,
    PaymentsDashboardPageComponent,
    CatalogPageComponent,
    CategoriesPageComponent,
    ProductWorkshopPageComponent,
    ProductTypesPageComponent,
    PaymentTermsTypesPageComponent,
    PaymentProvidersPageComponent,
    SubscriptionPlansPageComponent,
    PricingPageComponent,
    GLMappingPageComponent,
    CustomerARPageComponent,
    OverdueWorklistPageComponent,
    PaymentEntryPageComponent,
    PaymentCapturePageComponent,
    AllPaymentsPageComponent,
    AllOrdersPageComponent,
    StatusBoardPageComponent,
    OrderDetailPanelComponent,
    OrdersCategoryComponent,
    OrdersCategoryResourceComponent,
    PaymentsCategoryComponent,
    PaymentsCategoryResourceComponent,
    ProductsCategoryComponent,
    ProductsCategoryResourceComponent,
    OrdersReportsCategoryComponent,
    OrdersReportsCategoryResourceComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    EntityViewerModule, // <mj-entity-data-grid> — the house grid
    // Existing dashboards hosted by the categories (see the import block above).
    OrderHistoryModule,
    OrdersManagementModule,
    OrdersConsoleModule,
    ProductCatalogModule,
    ProductCategoryTreeModule,
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJPageHeaderInteriorComponent,
    MJPageBodyInteriorComponent,
    MJLeftNavComponent,
    MJLeftNavContentComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJEmptyStateComponent,
    MjSlidePanelComponent,
    MJAlertComponent,
    CompanyScopeChipComponent,
    ShellPagePendingComponent,
    WorkspaceTabStripComponent,
    CustomerARBaseComponent, // accounting-homed A/R numbers (§13.4)
    GlResolutionPreviewComponent, // accounting-homed GL chain rendering (§13.3)
  ],
  exports: [
    OrderEditorPageComponent,
    FulfillmentQueuePageComponent,
    RefundsPageComponent,
    PaymentMethodsPageComponent,
    SubscriptionsPageComponent,
    OrdersDashboardPageComponent,
    PaymentsDashboardPageComponent,
    CatalogPageComponent,
    CategoriesPageComponent,
    ProductWorkshopPageComponent,
    ProductTypesPageComponent,
    PaymentTermsTypesPageComponent,
    PaymentProvidersPageComponent,
    SubscriptionPlansPageComponent,
    PricingPageComponent,
    GLMappingPageComponent,
    CustomerARPageComponent,
    OverdueWorklistPageComponent,
    PaymentEntryPageComponent,
    PaymentCapturePageComponent,
    AllPaymentsPageComponent,
    AllOrdersPageComponent,
    StatusBoardPageComponent,
    OrderDetailPanelComponent,
    OrdersCategoryComponent,
    OrdersCategoryResourceComponent,
    PaymentsCategoryComponent,
    PaymentsCategoryResourceComponent,
    ProductsCategoryComponent,
    ProductsCategoryResourceComponent,
    OrdersReportsCategoryComponent,
    OrdersReportsCategoryResourceComponent,
  ],
})
export class OrdersShellModule {}
