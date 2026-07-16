import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import {
  MJButtonDirective,
  MJPageLayoutComponent,
  MJPageBodyComponent,
  MJPageHeaderInteriorComponent,
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
    MJPageBodyComponent,
    MJPageHeaderInteriorComponent,
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
  ],
  exports: [
    OrderEditorPageComponent,
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
